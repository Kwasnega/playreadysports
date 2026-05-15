import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUFFER_AFTER_MS = 30 * 60 * 1000;

async function getSetting(svc: ReturnType<typeof createClient>, key: string, fallback: string): Promise<string> {
  const { data } = await svc.from("platform_settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? fallback;
}

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
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) {
      return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const svc = createClient(supabaseUrl, serviceKey);

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { matchId } = body;
    if (!matchId) {
      return new Response(JSON.stringify({ error: "Missing matchId" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";

    const { data: match, error: matchErr } = await svc
      .from("matches")
      .select(`
        id, join_code, organizer_id, venue_id, status, match_date, duration_minutes,
        entry_fee, core_paid_count, organizer_incentive_amount, escrow_released_at,
        venue:venues(id, owner_id, owner_email, name)
      `)
      .eq("id", matchId)
      .single();

    if (matchErr || !match) {
      return new Response(JSON.stringify({ error: "Match not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (match.escrow_released_at) {
      return new Response(JSON.stringify({ error: "Escrow already released for this match" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (match.status === "cancelled" || match.status === "completed") {
      return new Response(JSON.stringify({ error: "Match already ended" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (match.organizer_id !== user.id && !isAdmin) {
      return new Response(JSON.stringify({ error: "Only the organizer or admin can complete this match" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (match.status !== "live") {
      return new Response(JSON.stringify({ error: "Match must be live before marking complete" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const kickoff = match.match_date ? new Date(match.match_date).getTime() : 0;
    const durationMs = (Number(match.duration_minutes) || 60) * 60 * 1000;
    const deadline = kickoff + durationMs + BUFFER_AFTER_MS;
    const canBypassQr = Date.now() >= deadline;

    const { data: paidCore } = await svc
      .from("match_participants")
      .select("id, user_id, attendance_scanned")
      .eq("match_id", matchId)
      .eq("status", "active")
      .eq("slot_type", "core")
      .eq("payment_status", "paid");

    const paidList = paidCore ?? [];
    const unscanned = paidList.filter((p: { attendance_scanned?: boolean }) => !p.attendance_scanned);

    if (!canBypassQr && unscanned.length > 0) {
      return new Response(
        JSON.stringify({
          error: `Waiting for ${unscanned.length} paid player(s) to scan venue QR before release`,
          waitingForQr: true,
          unscannedCount: unscanned.length,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const entryFee = Number(match.entry_fee ?? 0);
    const paidCount = Number(match.core_paid_count ?? paidList.length);
    const gross = Math.round(entryFee * paidCount * 100) / 100;

    const defaultIncentive = await getSetting(svc, "organizer_incentive_amount", "5.00");
    const commissionStr = await getSetting(svc, "commission_rate", "0.05");
    const commissionRate = Math.min(1, Math.max(0, parseFloat(commissionStr) || 0));

    let organizerIncentive = Number(match.organizer_incentive_amount);
    if (!Number.isFinite(organizerIncentive) || organizerIncentive < 0) {
      organizerIncentive = parseFloat(defaultIncentive) || 5;
    }
    organizerIncentive = Math.round(Math.min(organizerIncentive, gross) * 100) / 100;

    const platformFee = Math.round(gross * commissionRate * 100) / 100;
    let venueCut = Math.round((gross - organizerIncentive - platformFee) * 100) / 100;
    if (venueCut < 0) venueCut = 0;

    const venue = Array.isArray(match.venue) ? match.venue[0] : match.venue;
    let venueOwnerId: string | null = venue?.owner_id ?? null;
    if (!venueOwnerId && venue?.owner_email) {
      const { data: ownerProf } = await svc
        .from("profiles")
        .select("id")
        .eq("email", String(venue.owner_email).trim())
        .maybeSingle();
      venueOwnerId = ownerProf?.id ?? null;
    }

    if (organizerIncentive > 0 && match.organizer_id) {
      const ref = `organizer_incentive_${matchId}`;
      const { error: wErr } = await svc.rpc("process_wallet_transaction", {
        p_user_id: match.organizer_id,
        p_amount: organizerIncentive,
        p_type: "bonus",
        p_reference: ref,
      });
      if (wErr) {
        console.error("Organizer wallet credit failed:", wErr);
        return new Response(JSON.stringify({ error: "Failed to credit organizer incentive" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (venueCut > 0 && venueOwnerId) {
      const { error: vErr } = await svc.rpc("credit_venue_owner_balance", {
        p_user_id: venueOwnerId,
        p_amount: venueCut,
        p_reference: `venue_payout_${matchId}`,
      });
      if (vErr) {
        console.error("Venue owner credit failed:", vErr);
        return new Response(JSON.stringify({ error: "Failed to credit venue owner balance" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const releasedAt = new Date().toISOString();
    await svc
      .from("matches")
      .update({
        status: "completed" as any,
        escrow_status: "released" as any,
        escrow_released_at: releasedAt,
        organizer_incentive_amount: organizerIncentive,
      })
      .eq("id", matchId);

    await svc.from("transactions").insert({
      match_id: matchId,
      user_id: match.organizer_id,
      amount: organizerIncentive,
      type: "payout" as any,
      status: "completed" as any,
      payment_reference: `organizer-incentive-${match.join_code}-${Date.now()}`,
    });

    if (venueOwnerId && venueCut > 0) {
      await svc.from("transactions").insert({
        match_id: matchId,
        user_id: venueOwnerId,
        amount: venueCut,
        type: "payout" as any,
        status: "completed" as any,
        payment_reference: `venue-payout-${match.join_code}-${Date.now()}`,
      });
    }

    const { data: participants } = await svc
      .from("match_participants")
      .select("user_id")
      .eq("match_id", matchId)
      .eq("status", "active");

    const notifs = (participants ?? []).map((p: { user_id: string }) => ({
      user_id: p.user_id,
      title: "Match complete! Great game.",
      body: `Match ${match.join_code} has ended.`,
      type: "match_update" as any,
      data: { match_id: matchId, join_code: match.join_code },
    }));
    if (notifs.length) await svc.from("notifications").insert(notifs);

    if (venueOwnerId && venueCut > 0) {
      await svc.from("notifications").insert({
        user_id: venueOwnerId,
        title: "Match earnings credited",
        body: `₵${venueCut.toFixed(2)} from ${match.join_code} was added to your venue balance.`,
        type: "payment_received" as any,
        data: { match_id: matchId, join_code: match.join_code },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        gross,
        organizerIncentive,
        venueCut,
        platformFee,
        venueOwnerId,
        qrBypassed: canBypassQr && unscanned.length > 0,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("complete-match:", err);
    return new Response(JSON.stringify({ error: err.message ?? "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
