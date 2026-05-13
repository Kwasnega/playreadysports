import { createClient } from "jsr:@supabase/supabase-js@2";

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

    const body = await req.json();
    const { matchId } = body;
    if (!matchId) {
      return new Response(JSON.stringify({ error: "Missing matchId" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user is organizer
    const { data: match, error: matchErr } = await supabase
      .from("matches")
      .select("organizer_id, join_code, entry_fee, core_paid_count, venue:venues(name)")
      .eq("id", matchId)
      .single();

    if (matchErr || !match) {
      return new Response(JSON.stringify({ error: "Match not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check organizer or admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";
    if (match.organizer_id !== user.id && !isAdmin) {
      return new Response(JSON.stringify({ error: "Only the organizer or admin can cancel" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update match status + escrow
    await supabase.from("matches").update({ status: "cancelled" as any, escrow_status: "refunded" as any }).eq("id", matchId);

    // Auto-refund all paid participants
    const PAYSTACK_SECRET = Deno.env.get("PAYSTACK_SECRET_KEY");
    const { data: paidParticipants } = await supabase
      .from("match_participants")
      .select("id, user_id, payment_reference, payment_status")
      .eq("match_id", matchId)
      .eq("payment_status", "paid");

    const refundPromises = (paidParticipants ?? []).map(async (p: any) => {
      if (!p.payment_reference) return;

      let paystackRefunded = false;

      // Call Paystack refund first — only mark DB on success
      if (PAYSTACK_SECRET) {
        try {
          const refundRes = await fetch("https://api.paystack.co/refund", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${PAYSTACK_SECRET}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              transaction: p.payment_reference,
              reason: "Match cancelled by organizer",
            }),
          });
          const refundData = await refundRes.json();
          if (refundData.status) {
            paystackRefunded = true;
          } else {
            console.error("Paystack refund failed:", p.payment_reference, refundData.message);
          }
        } catch (e) {
          console.error("Paystack refund network error for", p.user_id, e);
        }
      }

      if (!paystackRefunded) return; // Skip DB update if Paystack didn't confirm

      // Mark participant as refunded + left
      await supabase
        .from("match_participants")
        .update({ payment_status: "refunded" as any, status: "left" as any })
        .eq("id", p.id);

      // Mark original entry_fee transaction as refunded
      await supabase
        .from("transactions")
        .update({ status: "refunded" as any })
        .eq("payment_reference", p.payment_reference)
        .eq("type", "entry_fee");

      // Insert refund transaction
      await supabase.from("transactions").insert({
        match_id: matchId,
        user_id: p.user_id,
        amount: match.entry_fee ?? 0,
        type: "refund" as any,
        status: "completed" as any,
        payment_reference: `refund-${p.payment_reference}`,
      });
    });

    await Promise.all(refundPromises);

    // Notify all active participants
    const { data: participants } = await supabase
      .from("match_participants")
      .select("user_id")
      .eq("match_id", matchId)
      .eq("status", "active");

    const venueName = Array.isArray(match.venue) ? match.venue[0]?.name ?? "the venue" : match.venue?.name ?? "the venue";
    const refundAmount = (match.entry_fee ?? 0) * (match.core_paid_count ?? 0);

    const notifs = (participants ?? []).map((p: any) => ({
      user_id: p.user_id,
      title: "Match cancelled",
      body: refundAmount > 0
        ? `Match ${match.join_code} at ${venueName} was cancelled. ₵${refundAmount} refund incoming.`
        : `Match ${match.join_code} at ${venueName} was cancelled.`,
      type: "match_cancel" as any,
      data: { match_id: matchId, join_code: match.join_code },
    }));

    if (notifs.length) {
      await supabase.from("notifications").insert(notifs);
    }

    const refundCount = paidParticipants?.length ?? 0;
    const totalRefunded = (match.entry_fee ?? 0) * refundCount;

    return new Response(JSON.stringify({ success: true, refundCount, totalRefunded }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Edge function error:", err);
    return new Response(JSON.stringify({ error: err.message ?? "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
