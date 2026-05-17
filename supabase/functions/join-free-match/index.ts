import { createClient } from "jsr:@supabase/supabase-js@2";
import { checkRateLimit } from "../_shared/rateLimiter.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders();
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit: 10 free joins per user per 10 minutes
    const allowed = await checkRateLimit(supabase, user.id, "join_free_match", 10, 10);
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded — try again later" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { matchId, team } = body;
    if (!matchId) {
      return new Response(JSON.stringify({ error: "Missing matchId" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch match for notification context (read-only — no race risk here)
    const { data: match } = await supabase
      .from("matches")
      .select("organizer_id, join_code, max_core_players, core_paid_count, entry_fee, status")
      .eq("id", matchId)
      .single();

    // Atomic join via RPC — handles capacity check, duplicate check, and insert
    // inside a single PostgreSQL transaction with FOR UPDATE row lock.
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const svc = createClient(supabaseUrl, serviceKey);

    const { data: rpcResult, error: rpcErr } = await svc.rpc("process_free_join", {
      p_match_id: matchId,
      p_user_id:  user.id,
      p_team:     team || "unassigned",
    });

    if (rpcErr) {
      return new Response(JSON.stringify({ error: rpcErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = rpcResult as any;
    if (!result?.success) {
      const status = result?.error === "Match is full" ? 400 : 400;
      return new Response(JSON.stringify({ error: result?.error || "Join failed" }), {
        status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Notify organizer
    if (match?.organizer_id) {
      const joinerName = user.user_metadata?.full_name || user.email?.split("@")[0] || "Someone";
      const maxCore = match.max_core_players ?? 10;
      const newCount = (match.core_paid_count ?? 0) + 1;
      await svc.from("notifications").insert({
        user_id: match.organizer_id,
        title: "New player joined",
        body: `${joinerName} joined your match (${newCount}/${maxCore})`,
        type: "match_join" as any,
        data: { match_id: matchId, join_code: match.join_code },
      });
    }

    return new Response(JSON.stringify({ success: true, participant_id: result.participant_id }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("Edge function error:", err);
    return new Response(JSON.stringify({ error: err.message ?? "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
