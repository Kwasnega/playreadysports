import { createClient } from "jsr:@supabase/supabase-js@2";
import { checkRateLimit } from "../_shared/rateLimiter.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

const PAYSTACK_SECRET = Deno.env.get("PAYSTACK_SECRET_KEY");

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders();
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

    // Rate limit: 3 paid joins per user per 5 minutes
    const allowed = await checkRateLimit(supabase, user.id, "join_paid_match", 3, 5);
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded — try again later" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { matchId, team, paystackReference } = body;
    if (!matchId || !paystackReference) {
      return new Response(JSON.stringify({ error: "Missing matchId or paystackReference" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotency: if this reference was already processed, return immediately
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const svc = createClient(supabaseUrl, serviceKey);
    const { data: existingTx } = await svc
      .from("transactions")
      .select("id, status")
      .eq("payment_reference", paystackReference)
      .maybeSingle();
    if (existingTx && existingTx.status === "completed") {
      return new Response(JSON.stringify({ success: true, alreadyProcessed: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      console.error("PAYSTACK_SECRET_KEY is not set in Edge Function secrets");
      return new Response(JSON.stringify({ error: "Paystack not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Verifying Paystack ref:", paystackReference);
    const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${paystackReference}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
    });
    const verifyData = await verifyRes.json();
    console.log("Paystack verify response:", JSON.stringify(verifyData).slice(0, 500));

    if (!verifyData.status || verifyData.data?.status !== "success") {
      console.error("Paystack verification failed:", verifyData.message);
      return new Response(JSON.stringify({ error: verifyData.message || "Payment verification failed" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check amount matches (in pesewas)
    const expectedPesewas = Math.round((match.entry_fee ?? 0) * 100);
    console.log("Amount check — expected:", expectedPesewas, "received:", verifyData.data?.amount);
    if (verifyData.data?.amount !== expectedPesewas) {
      return new Response(JSON.stringify({ error: "Payment amount mismatch" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Atomic DB operation via RPC — participant upsert + transaction insert in one transaction
    const { data: rpcResult, error: rpcErr } = await supabase.rpc("process_paid_join", {
      p_match_id: matchId,
      p_user_id: user.id,
      p_team: team || "unassigned",
      p_payment_reference: paystackReference,
      p_amount: match.entry_fee ?? 0,
      p_slot_type: "core",
    });

    if (rpcErr) {
      console.error("process_paid_join RPC error:", rpcErr.message);
      return new Response(JSON.stringify({ error: rpcErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = rpcResult as any;
    if (!result?.success) {
      if (result?.error === "match_full") {
        return new Response(JSON.stringify({ error: "Match is full" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (result?.error === "match_not_upcoming") {
        return new Response(JSON.stringify({ error: "Match is not open for joining" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: result?.error || "Join failed" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (result?.already_processed) {
      return new Response(JSON.stringify({ success: true, alreadyProcessed: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Notify organizer
    const joinerName = user.user_metadata?.full_name || user.email?.split("@")[0] || "Someone";
    const paidCount = (match.core_paid_count ?? 0) + 1;
    const maxCore = match.max_core_players ?? match.players_per_side ?? 10;
    console.log("Sending notification to organizer:", match.organizer_id);

    const { error: notifErr } = await supabase.from("notifications").insert({
      user_id: match.organizer_id,
      title: "New player joined (paid)",
      body: `${joinerName} paid and joined your match (${paidCount}/${maxCore})`,
      type: "payment_received" as any,
      data: { match_id: matchId, join_code: match.join_code },
    });
    if (notifErr) console.error("Notification insert error:", notifErr.message);

    // Check if match now fully paid
    console.log("Checking if match is full");
    const { data: updatedMatch, error: updErr } = await supabase
      .from("matches")
      .select("core_paid_count, max_core_players")
      .eq("id", matchId)
      .single();
    if (updErr) console.error("Match re-fetch error:", updErr.message);

    const isFull = (updatedMatch?.core_paid_count ?? 0) >= (updatedMatch?.max_core_players ?? maxCore);
    if (isFull) {
      console.log("Match is full — updating escrow");
      const { error: escErr } = await supabase
        .from("matches")
        .update({ escrow_status: "holding" as any })
        .eq("id", matchId);
      if (escErr) console.error("Escrow update error:", escErr.message);

      const { data: allParticipants, error: partErr } = await supabase
        .from("match_participants")
        .select("user_id")
        .eq("match_id", matchId)
        .eq("status", "active");
      if (partErr) console.error("Participants fetch error:", partErr.message);

      const notifs = (allParticipants ?? []).map((p: any) => ({
        user_id: p.user_id,
        title: "Match is confirmed! ⚽",
        body: `All slots paid for ${match.join_code}. See you on the pitch!`,
        type: "match_confirmed" as any,
        data: { match_id: matchId, join_code: match.join_code },
      }));

      if (notifs.length) {
        console.log("Sending match confirmed notifications:", notifs.length);
        const { error: bulkNotifErr } = await supabase.from("notifications").insert(notifs);
        if (bulkNotifErr) console.error("Bulk notification error:", bulkNotifErr.message);
      }
    }

    return new Response(JSON.stringify({ success: true, participant: result?.participant_id ?? null }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("Edge function error:", err);
    return new Response(JSON.stringify({ error: err.message ?? "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
