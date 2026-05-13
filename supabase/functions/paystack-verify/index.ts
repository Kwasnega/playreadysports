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
    const { reference } = body;
    if (!reference) {
      return new Response(JSON.stringify({ error: "Missing reference" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify with Paystack
    if (!PAYSTACK_SECRET) {
      return new Response(JSON.stringify({ error: "Paystack not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
    });
    const verifyData = await verifyRes.json();

    if (!verifyData.status || verifyData.data.status !== "success") {
      return new Response(JSON.stringify({ error: verifyData.message || "Payment not verified" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update transaction
    const { data: txn } = await supabase
      .from("transactions")
      .select("match_id, user_id")
      .eq("payment_reference", reference)
      .single();

    if (!txn) {
      return new Response(JSON.stringify({ error: "Transaction not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark participant as paid
    await supabase
      .from("match_participants")
      .update({ payment_status: "paid" as any })
      .eq("match_id", txn.match_id)
      .eq("user_id", txn.user_id);

    // Update transaction
    await supabase
      .from("transactions")
      .update({ status: "completed" as any })
      .eq("payment_reference", reference);

    // Check if all core paid → confirm match
    const { data: match } = await supabase
      .from("matches")
      .select("id, join_code, max_core_players, core_paid_count, organizer_id")
      .eq("id", txn.match_id)
      .single();

    if (match) {
      const allPaid = (match.core_paid_count ?? 0) >= (match.max_core_players ?? 0);
      if (allPaid) {
        await supabase
          .from("matches")
          .update({ escrow_status: "holding" as any })
          .eq("id", txn.match_id);

        // Notify all participants
        const { data: participants } = await supabase
          .from("match_participants")
          .select("user_id")
          .eq("match_id", txn.match_id)
          .eq("status", "active");

        const notifs = (participants ?? []).map((p: any) => ({
          user_id: p.user_id,
          title: "Match confirmed! 🔒",
          body: `All slots paid for ${match.join_code}. See you on the pitch!`,
          type: "match_confirmed" as any,
          data: { match_id: txn.match_id, join_code: match.join_code },
        }));

        if (notifs.length) {
          await supabase.from("notifications").insert(notifs);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, verified: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("Edge function error:", err);
    return new Response(JSON.stringify({ error: err.message ?? "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
