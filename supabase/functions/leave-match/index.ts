import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PAYSTACK_SECRET = Deno.env.get("PAYSTACK_SECRET_KEY");

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

    // Load match
    const { data: match, error: matchErr } = await supabase
      .from("matches")
      .select("id, join_code, match_date, entry_fee, organizer_id, status, core_paid_count")
      .eq("id", matchId)
      .single();

    if (matchErr || !match) {
      return new Response(JSON.stringify({ error: "Match not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (match.status === "completed" || match.status === "cancelled") {
      return new Response(JSON.stringify({ error: "Match already ended" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load participant
    const { data: participant } = await supabase
      .from("match_participants")
      .select("id, payment_status, payment_reference, slot_type")
      .eq("match_id", matchId)
      .eq("user_id", user.id)
      .single();

    if (!participant) {
      return new Response(JSON.stringify({ error: "You are not in this match" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create a service_role client for secure backend operations like wallet refund
    const supabaseService = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Check time remaining
    const matchTime = new Date(match.match_date!).getTime();
    const now = Date.now();
    const hoursUntil = (matchTime - now) / (1000 * 60 * 60);
    // Remove the requirement for payment_reference since wallet payments don't use it
    const eligibleForRefund = hoursUntil > 2 && participant.payment_status === "paid";

    let refunded = false;
    let refundAmount = 0;

    if (eligibleForRefund) {
      refundAmount = match.entry_fee ?? 0;

      // Process wallet refund securely via RPC
      const { error: refundErr } = await supabaseService.rpc("process_wallet_transaction", {
        p_user_id: user.id,
        p_amount: refundAmount,
        p_type: 'refund',
        p_reference: `refund_${matchId}_${Date.now()}`
      });

      if (refundErr) {
        console.error("Wallet refund failed:", refundErr);
      } else {
        refunded = true;
      }
    }

    // Update participant status
    await supabaseService
      .from("match_participants")
      .update({ status: "left" as any, payment_status: refunded ? "refunded" as any : participant.payment_status })
      .eq("id", participant.id);

    // Free up the core slot if they were a paid core player
    if (participant.slot_type === "core" && participant.payment_status === "paid") {
      await supabaseService.from("matches").update({
        core_paid_count: Math.max(0, (match.core_paid_count ?? 1) - 1)
      }).eq("id", matchId);
    }

    // Notify organizer
    const leaverName = user.user_metadata?.full_name || user.email?.split("@")[0] || "A player";
    await supabase.from("notifications").insert({
      user_id: match.organizer_id,
      title: "Player left match",
      body: `${leaverName} left ${match.join_code}${refunded ? " · ₵" + refundAmount + " refunded" : ""}`,
      type: "match_leave" as any,
      data: { match_id: matchId, join_code: match.join_code },
    });

    return new Response(JSON.stringify({
      success: true,
      refunded,
      refundAmount,
      message: refunded
        ? `Left match · ₵${refundAmount} refunded`
        : hoursUntil <= 2 && participant.payment_status === "paid"
        ? "Left match · no refund (less than 2 hours to kickoff)"
        : "Left match",
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("Edge function error:", err);
    return new Response(JSON.stringify({ error: err.message ?? "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
