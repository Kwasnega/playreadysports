import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkRateLimit } from "../_shared/rateLimiter.ts";
import { getMoolreConfig, moolrePost } from "../_shared/moolre.ts";

Deno.serve(async (req) => {
  const requestOrigin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(requestOrigin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const svc = createClient(supabaseUrl, serviceKey);

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const allowed = await checkRateLimit(supabase, user.id, "moolre_init", 10, 10);
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded â€” try again later" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { amount, redirectUrl } = await req.json();
    const amountNumber = Number(amount);
    if (!Number.isFinite(amountNumber) || amountNumber < 10) {
      return new Response(JSON.stringify({ error: "Minimum top-up is GHS 10" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const config = getMoolreConfig();
    const reference = `moolre_wallet_${user.id.replace(/-/g, "").slice(0, 12)}_${Date.now()}`;
    console.log("[moolre-init] Created reference:", reference, "for user:", user.id, "amount:", amountNumber);
    
    const appUrl = Deno.env.get("APP_URL") || requestOrigin || "http://localhost:5173";
    const redirectBase = redirectUrl || `${appUrl}/wallet`;
    const redirectUrlObj = new URL(redirectBase);
    redirectUrlObj.searchParams.set("moolre_ref", reference);
    const redirect = redirectUrlObj.toString();
    const callback = `${supabaseUrl}/functions/v1/moolre-webhook`;
    
    console.log("[moolre-init] Callback URL:", callback);

    // Insert wallet transaction with all necessary fields
    // This creates a pending transaction that wallet-topup will verify
    const { error: pendingErr } = await svc.from("wallet_transactions").insert({
      user_id: user.id,
      amount: amountNumber,
      type: "deposit",
      status: "pending",
      reference,
      description: `Moolre wallet top-up - ${amountNumber} GHS`,
      balance_after: 0, // Will be calculated when completed
    } as any);

    console.log("[moolre-init] Insert transaction result - error:", pendingErr);
    if (pendingErr) {
      if (pendingErr.code === "23505") {
        return new Response(JSON.stringify({ error: "Duplicate payment reference" }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw pendingErr;
    }
    
    console.log("[moolre-init] Calling Moolre /embed/link API with externalref:", reference);

    const moolreData = await moolrePost<any>("/embed/link", {
      type: 1,
      idtype: 2, // 2 = email
      amount: amountNumber.toFixed(2),
      email: user.email || "player@joinplayready.com",
      externalref: reference,
      callback,
      redirect,
      reusable: "0",
      expiration_time: 30,
      currency: "GHS",
      accountnumber: config.accountNumber,
    });

    console.log("[moolre-init] Moolre response - status:", moolreData?.status, " authorization_url:", !!moolreData?.data?.authorization_url);
    
    if (Number(moolreData?.status) !== 1 || !moolreData?.data?.authorization_url) {
      console.error("[moolre-init] Moolre failed - response:", moolreData);
      await svc
        .from("wallet_transactions")
        .update({ status: "failed" } as any)
        .eq("reference", reference);

      return new Response(JSON.stringify({ error: moolreData?.message || "Moolre payment link failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[moolre-init] SUCCESS - Authorization URL generated for reference:", reference);
    
    return new Response(JSON.stringify({
      success: true,
      authorizationUrl: moolreData.data.authorization_url,
      reference,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[moolre-init] Error:", err);
    return new Response(JSON.stringify({ error: err.message ?? "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

