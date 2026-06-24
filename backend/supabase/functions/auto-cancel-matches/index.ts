import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

/**
 * auto-cancel-matches
 * Cancels underfilled paid matches within the admin-configured window,
 * refunds all players, and sends notifications.
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders() });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const svc = createClient(supabaseUrl, serviceKey);

    // Prefer SQL function when available (also scheduled via pg_cron)
    // Disabled SQL RPC temporarily to ensure TS loop runs for Turf Owner Notifications (Issue 14)
    // const { data: sqlCount, error: sqlErr } = await svc.rpc("auto_cancel_underfilled_matches");
    // if (!sqlErr && typeof sqlCount === "number") {
    //   return new Response(JSON.stringify({ cancelled: sqlCount, source: "sql" }), {
    //     headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
    //   });
    // }

    const { data: settings } = await svc
      .from("platform_settings")
      .select("key, value")
      .in("key", ["auto_cancel_window_minutes", "auto_cancel_min_paid_pct"]);

    const settingsMap: Record<string, string> = {};
    (settings ?? []).forEach((r: any) => { settingsMap[r.key] = r.value; });

    const windowMinutes = parseInt(settingsMap["auto_cancel_window_minutes"] ?? "20", 10);
    const minPaidPct = parseFloat(settingsMap["auto_cancel_min_paid_pct"] ?? "1");

    const now = new Date();
    const windowEnd = new Date(now.getTime() + windowMinutes * 60 * 1000);

    const { data: candidates } = await svc
      .from("matches")
      .select("id, join_code, match_date, organizer_id, entry_fee, max_core_players, core_paid_count, venue_id, venue:venues(name, owner_id)")
      .in("status", ["upcoming", "full"])
      .gt("entry_fee", 0)
      .or(`and(match_date.lte.${windowEnd.toISOString()},match_date.gt.${now.toISOString()}),match_date.lt.${now.toISOString()}`);

    if (!candidates?.length) {
      return new Response(JSON.stringify({ cancelled: 0, checked: 0 }), {
        headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    let cancelledCount = 0;

    for (const match of candidates) {
      const maxCore = Number(match.max_core_players) || 10;
      const paidCount = Number(match.core_paid_count) || 0;
      const entryFee = Number(match.entry_fee) || 0;
      const fillRatio = paidCount / maxCore;
      if (fillRatio >= minPaidPct) continue;

      const venueName =
        Array.isArray(match.venue)
          ? match.venue[0]?.name ?? "the venue"
          : (match.venue as any)?.name ?? "the venue";

      await svc
        .from("matches")
        .update({ status: "cancelled" as any, escrow_status: "refunded" as any })
        .eq("id", match.id);

      const { data: paidParts } = await svc
        .from("match_participants")
        .select("id, user_id")
        .eq("match_id", match.id)
        .eq("payment_status", "paid");

      for (const p of paidParts ?? []) {
        if (entryFee > 0) {
          const ref = `auto_cancel_refund_${match.id}_${p.user_id}`;
          const { error: rpcErr } = await svc.rpc("process_wallet_transaction", {
            p_user_id: p.user_id,
            p_amount: entryFee,
            p_type: "refund",
            p_reference: ref,
            p_match_id: match.id,
            p_description: `Auto-cancel refund: ${match.join_code}`,
          });
          if (!rpcErr) {
            await svc
              .from("match_participants")
              .update({ payment_status: "refunded" as any, status: "left" as any })
              .eq("id", p.id);
          }
        }
      }

      await svc
        .from("match_participants")
        .update({ status: "left" as any })
        .eq("match_id", match.id)
        .eq("status", "active");

      await svc.from("matches").update({ core_paid_count: 0 }).eq("id", match.id);

      const { data: roster } = await svc
        .from("match_participants")
        .select("user_id")
        .eq("match_id", match.id);

      const userIds = new Set<string>([match.organizer_id, ...((roster ?? []).map((r: any) => r.user_id))]);
      const notifications = Array.from(userIds).map((uid) => {
        const isOrganizer = uid === match.organizer_id;
        return {
          user_id: uid,
          title: "Match auto-cancelled",
          body: isOrganizer
            ? `Your match ${match.join_code} at ${venueName} was auto-cancelled — the lobby was not full. All fees have been refunded.`
            : `Match ${match.join_code} at ${venueName} was cancelled (lobby not full). Your entry fee has been refunded to your wallet.`,
          type: "match_cancel",
          data: { match_id: match.id, join_code: match.join_code, auto: true },
        };
      });

      if (notifications.length) {
        // Turf Owner Notification (Issue 14)
        const turfOwnerId = Array.isArray(match.venue) ? match.venue[0]?.owner_id : (match.venue as any)?.owner_id;
        if (turfOwnerId) {
          const matchTimeStr = match.match_date ? new Date(match.match_date).toLocaleString('en-US', { 
            timeZone: 'Africa/Accra', dateStyle: 'medium', timeStyle: 'short'
          }) : "the scheduled time";

          notifications.push({
            user_id: turfOwnerId,
            title: "Match Auto-Cancelled",
            body: `A match scheduled at ${venueName} on ${matchTimeStr} was auto-cancelled — player minimum not met.`,
            type: "turf_event" as any,
            data: { match_id: match.id, venue_id: match.venue_id, auto: true }
          });
        }
        await svc.from("notifications").insert(notifications as any);
      }

      cancelledCount++;
    }

    return new Response(
      JSON.stringify({ cancelled: cancelledCount, checked: candidates.length }),
      { status: 200, headers: { ...getCorsHeaders(), "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("auto-cancel-matches error:", err);
    return new Response(JSON.stringify({ error: err.message ?? "Internal error" }), {
      status: 500,
      headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
    });
  }
});
