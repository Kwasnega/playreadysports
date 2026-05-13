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
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
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
    const { matchId, callbackUrl, team } = body;
    if (!matchId) {
      return new Response(JSON.stringify({ error: "Missing matchId" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch match + participant
    const { data: match, error: matchErr } = await supabase
      .from("matches")
      .select("id, join_code, entry_fee, status, organizer_id")
      .eq("id", matchId)
      .single();

    if (matchErr || !match) {
      return new Response(JSON.stringify({ error: "Match not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (match.status === "cancelled" || match.status === "completed") {
      return new Response(JSON.stringify({ error: "Match is no longer open for payment" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: participant } = await supabase
      .from("match_participants")
      .select("id, payment_status")
      .eq("match_id", matchId)
      .eq("user_id", user.id)
      .single();

    if (!participant) {
      return new Response(JSON.stringify({ error: "You are not a participant in this match" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (participant.payment_status === "paid") {
      return new Response(JSON.stringify({ error: "Already paid" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Free match = auto-mark as paid
    if ((match.entry_fee ?? 0) <= 0) {
      await supabase
        .from("match_participants")
        .update({ payment_status: "paid" as any })
        .eq("id", participant.id);
      return new Response(JSON.stringify({ success: true, free: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user email for Paystack
    const userEmail = user.email ?? "player@playreadysports.com";
    const amountKobo = Math.round((match.entry_fee as number) * 100); // GHS in pesewas
    const reference = `PRS-${match.join_code}-${user.id.slice(0, 8)}-${Date.now()}`;

    // Insert pending transaction
    await supabase.from("transactions").insert({
      match_id: matchId,
      user_id: user.id,
      amount: match.entry_fee,
      type: "entry_fee" as any,
      status: "pending" as any,
      payment_reference: reference,
    });

    // Update participant with reference
    await supabase
      .from("match_participants")
      .update({ payment_reference: reference })
      .eq("id", participant.id);

    // Call Paystack
    if (!PAYSTACK_SECRET) {
      return new Response(JSON.stringify({ error: "Paystack not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: userEmail,
        amount: amountKobo,
        reference,
        callback_url: callbackUrl || `${Deno.env.get("APP_URL") ?? "http://localhost:5173"}/lobby/${match.join_code}`,
        metadata: {
          match_id: matchId,
          user_id: user.id,
          join_code: match.join_code,
          team: team || "unassigned",
          entry_fee: match.entry_fee ?? 0,
        },
      }),
    });

    const paystackData = await paystackRes.json();
    if (!paystackData.status) {
      console.error("Paystack init error:", paystackData);
      return new Response(JSON.stringify({ error: paystackData.message || "Paystack failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      authorizationUrl: paystackData.data.authorization_url,
      reference,
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
