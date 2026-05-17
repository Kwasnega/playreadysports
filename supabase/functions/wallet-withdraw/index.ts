import { createClient } from "jsr:@supabase/supabase-js@2";
import { getgetCorsHeaders() } from "../_shared/cors.ts";

// CORS is handled via getCorsHeaders() from _shared/cors.ts

const VALID_PROVIDERS = ["mtn", "vodafone", "airteltigo"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders() });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
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
        status: 401, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { amount, phone, provider } = body;

    if (!amount || typeof amount !== "number" || amount < 10) {
      return new Response(JSON.stringify({ error: "Minimum withdrawal is ₵10" }), {
        status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    if (!phone || !VALID_PROVIDERS.includes(provider)) {
      return new Response(JSON.stringify({ error: "Valid phone and provider (mtn/vodafone/airteltigo) required" }), {
        status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    const reference = `wd_${user.id.slice(0, 8)}_${Date.now()}`;

    // Deduct from wallet + create pending transaction via RPC
    const { data: deductResult, error: deductErr } = await supabase.rpc("process_wallet_withdrawal", {
      p_user_id: user.id,
      p_amount: amount,
      p_reference: reference,
      p_phone: phone,
      p_provider: provider,
    });

    if (deductErr || !deductResult?.success) {
      const msg = deductResult?.error || deductErr?.message || "Wallet deduction failed";
      return new Response(JSON.stringify({ error: msg }), {
        status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      status: "pending",
      reference,
      message: "Withdrawal request submitted. An admin will review and process it shortly.",
    }), {
      status: 200, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("Wallet withdraw error:", err);
    return new Response(JSON.stringify({ error: err.message ?? "Internal error" }), {
      status: 500, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
    });
  }
});
