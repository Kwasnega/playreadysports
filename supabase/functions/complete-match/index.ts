import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkRateLimit } from "../_shared/rateLimiter.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders() });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) {
      return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
        status: 500, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const svc = createClient(supabaseUrl, serviceKey);

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    // Rate limit: 10 completions per user per 10 minutes
    const allowed = await checkRateLimit(supabase, user.id, "complete_match", 10, 10);
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded — try again later" }), {
        status: 429, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { matchId } = body;
    if (!matchId) {
      return new Response(JSON.stringify({ error: "Missing matchId" }), {
        status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    // Atomic completion — all financial ops in a single PostgreSQL transaction
    const { data: rpcResult, error: rpcErr } = await svc.rpc("complete_match_atomic", {
      p_match_id: matchId,
      p_caller_id: user.id,
    });

    if (rpcErr) {
      console.error("complete_match_atomic RPC error:", rpcErr.message);
      return new Response(JSON.stringify({ error: rpcErr.message }), {
        status: 500, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    const result = rpcResult as any;
    if (result?.error) {
      const status = result?.waitingForQr ? 400 : (result?.error?.includes("Unauthorized") ? 403 : 400);
      return new Response(JSON.stringify(result), { status, headers: { ...getCorsHeaders(), "Content-Type": "application/json" } });
    }

    // ── Best-effort notifications (non-critical, outside atomic tx) ──
    try {
      const { data: match } = await svc
        .from("matches")
        .select("join_code")
        .eq("id", matchId)
        .single();
      const joinCode = match?.join_code ?? "";

      const { data: participants } = await svc
        .from("match_participants")
        .select("user_id")
        .eq("match_id", matchId)
        .eq("status", "active");

      const notifs = (participants ?? []).map((p: any) => ({
        user_id: p.user_id,
        title: "Match complete! Great game.",
        body: `Match ${joinCode} has ended.`,
        type: "match_update",
        data: { match_id: matchId, join_code: joinCode },
      }));
      if (notifs.length) {
        await svc.from("notifications").insert(notifs as any);
      }

      if (result?.venueOwnerId && result?.venueCut > 0) {
        await svc.from("notifications").insert({
          user_id: result.venueOwnerId,
          title: "Match earnings credited",
          body: `₵${Number(result.venueCut).toFixed(2)} from ${joinCode} was added to your venue balance.`,
          type: "payment_received",
          data: { match_id: matchId, join_code: joinCode },
        } as any);
      }
    } catch (notifErr: any) {
      console.error("complete-match notification error:", notifErr.message);
    }

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...getCorsHeaders(), "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("complete-match:", err);
    return new Response(JSON.stringify({ error: err.message ?? "Internal error" }), {
      status: 500, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
    });
  }
});
