import { createClient } from "jsr:@supabase/supabase-js@2";
import { checkRateLimit } from "../_shared/rateLimiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
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

    // Load match
    const { data: match, error: matchErr } = await supabase
      .from("matches")
      .select("*, organizer:profiles(full_name, username)")
      .eq("id", matchId)
      .single();

    if (matchErr || !match) {
      return new Response(JSON.stringify({ error: "Match not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (match.status !== "upcoming") {
      return new Response(JSON.stringify({ error: "Match is not open for joining" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Must be free
    if ((match.entry_fee ?? 0) > 0) {
      return new Response(JSON.stringify({ error: "This match requires payment. Use join-paid-match." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if already joined
    const { data: existing } = await supabase
      .from("match_participants")
      .select("id")
      .eq("match_id", matchId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ error: "Already joined this match" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check not full
    const { count: activeCount } = await supabase
      .from("match_participants")
      .select("*", { count: "exact", head: true })
      .eq("match_id", matchId)
      .eq("status", "active")
      .eq("slot_type", "core");

    const maxCore = match.max_core_players ?? match.players_per_side ?? 10;
    if ((activeCount ?? 0) >= maxCore) {
      return new Response(JSON.stringify({ error: "Match is full" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert participant (free = auto-paid)
    const { data: participant, error: pErr } = await supabase
      .from("match_participants")
      .insert({
        match_id: matchId,
        user_id: user.id,
        slot_type: "core" as any,
        team: (team || "unassigned") as any,
        status: "active" as any,
        payment_status: "paid" as any,
      })
      .select("id")
      .single();

    if (pErr) {
      return new Response(JSON.stringify({ error: pErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Notify organizer
    const joinerName = user.user_metadata?.full_name || user.email?.split("@")[0] || "Someone";
    const newCount = (activeCount ?? 0) + 1;

    await supabase.from("notifications").insert({
      user_id: match.organizer_id,
      title: "New player joined",
      body: `${joinerName} joined your match (${newCount}/${maxCore})`,
      type: "match_join" as any,
      data: { match_id: matchId, join_code: match.join_code },
    });

    return new Response(JSON.stringify({ success: true, participant }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("Edge function error:", err);
    return new Response(JSON.stringify({ error: err.message ?? "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
