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
      .select("organizer_id, join_code")
      .eq("id", matchId)
      .single();

    if (matchErr || !match) {
      return new Response(JSON.stringify({ error: "Match not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (match.organizer_id !== user.id) {
      return new Response(JSON.stringify({ error: "Only the organizer can complete" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch match with entry fee + paid count
    const { data: matchData } = await supabase
      .from("matches")
      .select("entry_fee, core_paid_count, organizer_id")
      .eq("id", matchId)
      .single();

    const entryFee = matchData?.entry_fee ?? 0;
    const paidCount = matchData?.core_paid_count ?? 0;
    const totalPot = entryFee * paidCount;
    const payoutAmount = Math.round(totalPot * 0.95 * 100) / 100; // 95% to organizer
    const platformFee = Math.round(totalPot * 0.05 * 100) / 100;  // 5% platform

    // Update match status + release escrow
    await supabase
      .from("matches")
      .update({ status: "completed" as any, escrow_status: "released" as any })
      .eq("id", matchId);

    // Record payout transaction
    if (payoutAmount > 0 && matchData?.organizer_id) {
      await supabase.from("transactions").insert({
        match_id: matchId,
        user_id: matchData.organizer_id,
        amount: payoutAmount,
        type: "payout" as any,
        status: "completed" as any,
        payment_reference: `payout-${match.join_code}-${Date.now()}`,
      });
    }

    // Notify all active participants
    const { data: participants } = await supabase
      .from("match_participants")
      .select("user_id")
      .eq("match_id", matchId)
      .eq("status", "active");

    const notifs = (participants ?? []).map((p: any) => ({
      user_id: p.user_id,
      title: "Match complete! Great game. 🏆",
      body: `Match ${match.join_code} has ended.`,
      type: "match_update" as any,
      data: { match_id: matchId, join_code: match.join_code },
    }));

    if (notifs.length) {
      await supabase.from("notifications").insert(notifs);
    }

    return new Response(JSON.stringify({ success: true, payout: payoutAmount, platformFee }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Edge function error:", err);
    return new Response(JSON.stringify({ error: err.message ?? "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
