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
    const { matchId, team, paystackReference } = body;
    if (!matchId || !paystackReference) {
      return new Response(JSON.stringify({ error: "Missing matchId or paystackReference" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load match
    const { data: match, error: matchErr } = await supabase
      .from("matches")
      .select("*, venue:venues(name, city), organizer:profiles(full_name, username)")
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

    // Verify with Paystack
    if (!PAYSTACK_SECRET) {
      return new Response(JSON.stringify({ error: "Paystack not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${paystackReference}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
    });
    const verifyData = await verifyRes.json();

    if (!verifyData.status || verifyData.data.status !== "success") {
      return new Response(JSON.stringify({ error: verifyData.message || "Payment verification failed" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check amount matches (in pesewas)
    const expectedPesewas = Math.round((match.entry_fee ?? 0) * 100);
    if (verifyData.data.amount !== expectedPesewas) {
      return new Response(JSON.stringify({ error: "Payment amount mismatch" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user is already a participant
    const { data: existing } = await supabase
      .from("match_participants")
      .select("id, status")
      .eq("match_id", matchId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing && existing.status === "active") {
      return new Response(JSON.stringify({ error: "Already joined this match" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check match not full
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

    // Upsert participant as paid
    const { data: participant, error: pErr } = await supabase
      .from("match_participants")
      .upsert({
        match_id: matchId,
        user_id: user.id,
        slot_type: "core" as any,
        team: (team || "unassigned") as any,
        status: "active" as any,
        payment_status: "paid" as any,
        payment_reference: paystackReference,
      }, { onConflict: "match_id, user_id" })
      .select("id")
      .single();

    if (pErr) {
      return new Response(JSON.stringify({ error: pErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert transaction record
    await supabase.from("transactions").insert({
      match_id: matchId,
      user_id: user.id,
      amount: match.entry_fee ?? 0,
      type: "entry_fee" as any,
      status: "completed" as any,
      payment_reference: paystackReference,
    });

    // Notify organizer
    const joinerName = user.user_metadata?.full_name || user.email?.split("@")[0] || "Someone";
    const paidCount = (match.core_paid_count ?? 0) + 1;

    await supabase.from("notifications").insert({
      user_id: match.organizer_id,
      title: "New player joined (paid)",
      body: `${joinerName} paid and joined your match (${paidCount}/${maxCore})`,
      type: "payment_received" as any,
      data: { match_id: matchId, join_code: match.join_code },
    });

    // Check if match now fully paid
    const { data: updatedMatch } = await supabase
      .from("matches")
      .select("core_paid_count, max_core_players")
      .eq("id", matchId)
      .single();

    const isFull = (updatedMatch?.core_paid_count ?? 0) >= (updatedMatch?.max_core_players ?? maxCore);
    if (isFull) {
      await supabase
        .from("matches")
        .update({ escrow_status: "holding" as any })
        .eq("id", matchId);

      const { data: allParticipants } = await supabase
        .from("match_participants")
        .select("user_id")
        .eq("match_id", matchId)
        .eq("status", "active");

      const notifs = (allParticipants ?? []).map((p: any) => ({
        user_id: p.user_id,
        title: "Match is confirmed! ⚽",
        body: `All slots paid for ${match.join_code}. See you on the pitch!`,
        type: "match_confirmed" as any,
        data: { match_id: matchId, join_code: match.join_code },
      }));

      if (notifs.length) {
        await supabase.from("notifications").insert(notifs);
      }
    }

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
