import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

/**
 * auto-cancel-stale-matches
 * Cancels matches that have passed their scheduled time but are still marked as 'upcoming'
 * This prevents displaying past matches as still upcoming
 */

Deno.serve(async (req) => {
  const requestOrigin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(requestOrigin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const svc = createClient(supabaseUrl, serviceKey);

    const now = new Date();

    // Find all matches that are past their scheduled time but still upcoming
    const { data: staleMatches, error: queryErr } = await svc
      .from("matches")
      .select("id, join_code, match_date, organizer_id, status, intelligent_status, venue_id, venue:venues(name, owner_id)")
      .lt("match_date", now.toISOString())
      .in("status", ["upcoming", "full"]);

    if (queryErr) throw queryErr;

    if (!staleMatches || staleMatches.length === 0) {
      return new Response(JSON.stringify({ cancelled: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let cancelledCount = 0;

    for (const match of staleMatches) {
      // Skip if already cancelled or completed
      if (match.status === "cancelled" || match.intelligent_status === "cancelled" || match.intelligent_status === "ended") {
        continue;
      }

      // Auto-cancel the match
      const { error: updateErr } = await svc
        .from("matches")
        .update({
          status: "cancelled" as any,
          intelligent_status: "cancelled" as any,
          escrow_status: "refunded" as any,
          cancelled_reason: "auto_cancelled_stale" as any,
        })
        .eq("id", match.id);

      if (!updateErr) {
        cancelledCount++;

        // Get all participants to notify and refund
        const { data: participants } = await svc
          .from("match_participants")
          .select("id, user_id, payment_status, entry_fee")
          .eq("match_id", match.id);

        // Process refunds and notifications
        for (const p of participants ?? []) {
          if (p.payment_status === "paid") {
            const ref = `auto_cancel_stale_${match.id}_${p.user_id}`;
            const feeAmount = Number(p.entry_fee) || 0;
            await svc.rpc("process_wallet_transaction", {
              p_user_id: p.user_id,
              p_amount: feeAmount,
              p_type: "refund",
              p_reference: ref,
              p_match_id: match.id,
              p_description: `Auto-cancel refund (stale match): ${match.join_code}`,
            });

            // Send notification
            await svc.from("notifications").insert({
              user_id: p.user_id,
              title: "Match Auto-Cancelled",
              body: `The match ${match.join_code} was automatically cancelled because not enough players joined before kickoff. Your entry fee of GHS ${feeAmount.toFixed(2)} has been refunded to your PlayReady wallet.`,
              type: "match_cancel" as any,
              data: {
                original_type: "match_cancel",
                link: `/browse`,
              },
              is_read: false,
            });
          }
        }

        // Notify organizer
        await svc.from("notifications").insert({
          user_id: match.organizer_id,
          title: "Match Auto-Cancelled",
          body: `Your match ${match.join_code} was automatically cancelled — the minimum number of players wasn't reached before kickoff. Any entry fees collected have been refunded to participants.`,
          type: "match_cancel" as any,
          data: {
            original_type: "match_cancel",
            link: `/my-matches`,
          },
          is_read: false,
        });

        // Turf Owner Notification (Issue 14)
        const turfOwnerId = Array.isArray(match.venue) ? match.venue[0]?.owner_id : (match.venue as any)?.owner_id;
        if (turfOwnerId) {
          const venueName = Array.isArray(match.venue) ? match.venue[0]?.name : (match.venue as any)?.name ?? "your turf";
          const matchTimeStr = match.match_date ? new Date(match.match_date).toLocaleString('en-US', { 
            timeZone: 'Africa/Accra', dateStyle: 'medium', timeStyle: 'short'
          }) : "the scheduled time";
          
          await svc.from("notifications").insert({
            user_id: turfOwnerId,
            title: "Match Auto-Cancelled",
            body: `A match scheduled at ${venueName} on ${matchTimeStr} was auto-cancelled — player minimum not met.`,
            type: "turf_event" as any,
            data: { match_id: match.id, venue_id: match.venue_id }
          });
        }
      }
    }

    return new Response(JSON.stringify({ cancelled: cancelledCount, checked: staleMatches.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("auto-cancel-stale-matches error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
