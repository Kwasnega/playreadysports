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
    const { matchId, winningTeam } = body;
    if (!matchId) {
      return new Response(JSON.stringify({ error: "Missing matchId" }), {
        status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    // Atomic completion — all financial ops in a single PostgreSQL transaction
    const { data: rpcResult, error: rpcErr } = await svc.rpc("complete_match_atomic", {
      p_match_id: matchId,
      p_caller_id: user.id,
      p_winning_team: winningTeam ?? null,
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
        .select("join_code, organizer_id, venue_id, venue:venues(name, owner_id)")
        .eq("id", matchId)
        .single();
      const joinCode = match?.join_code ?? "";
      const organizerId = match?.organizer_id;
      const venueName = Array.isArray(match?.venue) ? match?.venue[0]?.name : (match?.venue as any)?.name ?? "your turf";
      const turfOwnerId = result?.venueOwnerId || (Array.isArray(match?.venue) ? match?.venue[0]?.owner_id : (match?.venue as any)?.owner_id);

      const winLabel = winningTeam
        ? `${winningTeam.charAt(0).toUpperCase() + winningTeam.slice(1)} won!`
        : "It was a draw!";

      const { data: participants } = await svc
        .from("match_participants")
        .select("user_id")
        .eq("match_id", matchId)
        .eq("status", "active");

      const participantUserIds = new Set((participants ?? []).map((p: any) => p.user_id));

      const notifs = (participants ?? []).map((p: any) => ({
        user_id: p.user_id,
        title: "Match complete! Great game.",
        body: `Match ${joinCode} has ended. ${winLabel}`,
        type: "match_update",
        data: { match_id: matchId, join_code: joinCode },
      }));

      // Always notify the organizer even if they weren't an active participant
      if (organizerId && !participantUserIds.has(organizerId)) {
        notifs.push({
          user_id: organizerId,
          title: "Match complete!",
          body: `Match ${joinCode} has ended. ${winLabel}`,
          type: "match_update",
          data: { match_id: matchId, join_code: joinCode },
        });
      }

      if (notifs.length) {
        const { error: notifInsertErr } = await svc.from("notifications").insert(notifs as any);
        if (notifInsertErr) {
          // Log full error so it shows in Edge Function logs, but don't fail the request
          console.error("complete-match: participant notification insert failed", {
            error: notifInsertErr.message,
            code: notifInsertErr.code,
            matchId,
          });
        }
      }

      // Turf Owner Notifications (Issue 14)
      if (turfOwnerId) {
        // 1. Match Completed
        const matchCompletedNotif = {
          user_id: turfOwnerId,
          title: "Match Completed",
          body: `Match at ${venueName} completed. ${participants?.length || 0} players participated. Revenue: GHS ${Number(result?.venueCut || 0).toFixed(2)}.`,
          type: "turf_event" as any,
          data: { match_id: matchId, join_code: joinCode, venue_id: match?.venue_id }
        };
        
        // 2. Escrow Released (only if they made money)
        if (result?.venueCut > 0) {
          const escrowReleasedNotif = {
            user_id: turfOwnerId,
            title: "Payment Released",
            body: `GHS ${Number(result.venueCut).toFixed(2)} has been released to your wallet for Match ${joinCode}.`,
            type: "payment_received" as any,
            data: { match_id: matchId, join_code: joinCode, venue_id: match?.venue_id }
          };
          
          await svc.from("notifications").insert([matchCompletedNotif, escrowReleasedNotif] as any);
        } else {
          await svc.from("notifications").insert(matchCompletedNotif as any);
        }
      }
    } catch (notifErr: any) {
      console.error("complete-match: unexpected notification error", {
        message: notifErr?.message ?? String(notifErr),
        matchId,
      });
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
