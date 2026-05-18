import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// CORS is handled via getCorsHeaders() from _shared/cors.ts

async function getCancelCutoffMinutes(svc: ReturnType<typeof createClient>): Promise<number> {
  const { data } = await svc.from("platform_settings").select("value").eq("key", "cancel_cutoff_minutes").maybeSingle();
  const n = parseInt(data?.value ?? "60", 10);
  return Number.isFinite(n) && n > 0 ? n : 60;
}

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

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { matchId } = body;
    if (!matchId) {
      return new Response(JSON.stringify({ error: "Missing matchId" }), {
        status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    const { data: match, error: matchErr } = await supabase
      .from("matches")
      .select("id, organizer_id, join_code, entry_fee, core_paid_count, match_date, status, venue:venues(name)")
      .eq("id", matchId)
      .single();

    if (matchErr || !match) {
      return new Response(JSON.stringify({ error: "Match not found" }), {
        status: 404, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    if (match.status === "completed" || match.status === "cancelled") {
      return new Response(JSON.stringify({ error: "Match already ended" }), {
        status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";
    if (match.organizer_id !== user.id && !isAdmin) {
      return new Response(JSON.stringify({ error: "Only the organizer or admin can cancel" }), {
        status: 403, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    const supabaseService = createClient(supabaseUrl, serviceKey);

    const cutoffMinutes = await getCancelCutoffMinutes(supabaseService);
    const cancelCutoffMs = cutoffMinutes * 60 * 1000;
    const kickoff = match.match_date ? new Date(match.match_date).getTime() : 0;
    const msUntilKickoff = kickoff - Date.now();
    if (!isAdmin && match.organizer_id === user.id && msUntilKickoff < cancelCutoffMs) {
      return new Response(
        JSON.stringify({
          error: `Cannot cancel within ${cutoffMinutes} minutes of kickoff. Contact support if you need an exception.`,
        }),
        { status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" } },
      );
    }

    const { data: paidParticipants } = await supabaseService
      .from("match_participants")
      .select("id, user_id, payment_reference, payment_status")
      .eq("match_id", matchId)
      .eq("payment_status", "paid");

    const { data: rosterBefore } = await supabaseService
      .from("match_participants")
      .select("user_id, payment_status")
      .eq("match_id", matchId)
      .eq("status", "active");

    const venueName = Array.isArray(match.venue) ? match.venue[0]?.name ?? "the venue" : (match.venue as { name?: string })?.name ?? "the venue";
    const entryFee = Number(match.entry_fee ?? 0);

    await supabaseService
      .from("matches")
      .update({ status: "cancelled" as any, escrow_status: "refunded" as any })
      .eq("id", matchId);

    await supabaseService
      .from("match_participants")
      .update({ check_in_flagged_cancel: true as any })
      .eq("match_id", matchId)
      .eq("attendance_scanned", true);

    let refundCount = 0;
    let totalCredited = 0;
    const refundErrors: string[] = [];

    for (const p of paidParticipants ?? []) {
      if (entryFee <= 0) {
        await supabaseService
          .from("match_participants")
          .update({ payment_status: "refunded" as any, status: "left" as any })
          .eq("id", p.id);
        refundCount++;
        continue;
      }

      const ref = `cancel_refund_${matchId}_${p.user_id}_${p.id}`;
      const { error: rpcErr } = await supabaseService.rpc("process_wallet_transaction", {
        p_user_id: p.user_id,
        p_amount: entryFee,
        p_type: "refund",
        p_reference: ref,
      });

      if (rpcErr) {
        console.error("Wallet credit failed for user", p.user_id, rpcErr);
        refundErrors.push(p.user_id);
        continue;
      }

      await supabaseService
        .from("match_participants")
        .update({ payment_status: "refunded" as any, status: "left" as any })
        .eq("id", p.id);

      if (p.payment_reference) {
        await supabaseService
          .from("transactions")
          .update({ status: "refunded" as any })
          .eq("payment_reference", p.payment_reference)
          .eq("type", "entry_fee");

        await supabaseService.from("transactions").insert({
          match_id: matchId,
          user_id: p.user_id,
          amount: entryFee,
          type: "refund" as any,
          status: "completed" as any,
          payment_reference: `wallet-${ref}`,
        });
      }

      refundCount++;
      totalCredited += entryFee;
    }

    await supabaseService
      .from("match_participants")
      .update({ status: "left" as any })
      .eq("match_id", matchId)
      .eq("status", "active")
      .neq("payment_status", "paid");

    await supabaseService
      .from("matches")
      .update({ core_paid_count: 0 })
      .eq("id", matchId);

    const notifByUser = new Map<string, { user_id: string; title: string; body: string; type: string; data: Record<string, unknown> }>();

    for (const p of paidParticipants ?? []) {
      const failed = refundErrors.includes(p.user_id);
      const credited = entryFee > 0 && !failed;
      const body = credited
        ? `Match ${match.join_code} at ${venueName} was cancelled. ₵${entryFee} was added to your Play wallet.`
        : failed
        ? `Match ${match.join_code} at ${venueName} was cancelled. Wallet credit failed — please contact support with code ${match.join_code}.`
        : `Match ${match.join_code} at ${venueName} was cancelled.`;
      notifByUser.set(p.user_id, {
        user_id: p.user_id,
        title: "Match cancelled",
        body,
        type: "match_cancel",
        data: { match_id: matchId, join_code: match.join_code },
      });
    }

    for (const row of rosterBefore ?? []) {
      if (notifByUser.has(row.user_id)) continue;
      notifByUser.set(row.user_id, {
        user_id: row.user_id,
        title: "Match cancelled",
        body: `Match ${match.join_code} at ${venueName} was cancelled.`,
        type: "match_cancel",
        data: { match_id: matchId, join_code: match.join_code },
      });
    }

    const notifs = [...notifByUser.values()];
    if (notifs.length) {
      await supabaseService.from("notifications").insert(notifs as any);
    }

    return new Response(
      JSON.stringify({
        success: true,
        refundCount,
        totalCredited,
        walletRefunds: true,
        refundErrors: refundErrors.length ? refundErrors : undefined,
      }),
      { status: 200, headers: { ...getCorsHeaders(), "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("Edge function error:", err);
    return new Response(JSON.stringify({ error: err.message ?? "Internal error" }), {
      status: 500, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
    });
  }
});
