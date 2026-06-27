import { createClient } from "jsr:@supabase/supabase-js@2";

function extractReference(payload: any): string | null {
  return (
    payload?.data?.externalref ||
    payload?.data?.reference ||
    payload?.externalref ||
    payload?.reference ||
    null
  );
}

function extractAmount(payload: any): number {
  return (
    Number(payload?.data?.amount) ||
    Number(payload?.data?.value) ||
    Number(payload?.amount) ||
    0
  );
}

function isPaymentSuccess(payload: any): boolean {
  // Check various possible success indicators in Moolre webhook
  return (
    payload?.data?.txstatus === 1 ||
    payload?.data?.status === 1 ||
    payload?.status === "success" ||
    payload?.data?.status === "success" ||
    false
  );
}

Deno.serve(async (req) => {
  // Allow CORS preflight for external callers
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    console.log("[moolre-webhook] ===== WEBHOOK INVOKED =====");
    const payload = await req.json();
    console.log("[moolre-webhook] Full payload:", JSON.stringify(payload, null, 2));
    console.log("[moolre-webhook] Extracted: externalref=", payload?.data?.externalref, " txstatus=", payload?.data?.txstatus);
    
    const reference = extractReference(payload);
    console.log("[moolre-webhook] Reference after extraction:", reference);
    if (!reference) {
      console.error("[moolre-webhook] Missing reference, full payload:", payload);
      return new Response("Missing reference", { status: 400 });
    }

    // Check if payment was successful from the webhook payload
    const isSuccess = isPaymentSuccess(payload);
    console.log("[moolre-webhook] Payment success check result:", isSuccess, "txstatus:", payload?.data?.txstatus);
    if (!isSuccess) {
      console.log("[moolre-webhook] Payment not successful yet", reference, "txstatus:", payload?.data?.txstatus);
      return new Response("Ignored - payment not successful", { status: 200 });
    }

    const amount = extractAmount(payload);
    console.log("[moolre-webhook] Extracted amount:", amount);
    if (!amount || amount <= 0) {
      console.error("[moolre-webhook] Invalid amount", reference, amount);
      return new Response("Invalid amount", { status: 400 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const svc = createClient(supabaseUrl, serviceKey);
    console.log("[moolre-webhook] Initialized Supabase client, looking for reference:", reference);

    const { data: tx, error: txErr } = await svc
      .from("wallet_transactions")
      .select("user_id, amount, status")
      .eq("reference", reference)
      .maybeSingle();

    console.log("[moolre-webhook] DB query result - error:", txErr, " tx:", tx);
    if (txErr) {
      console.error("[moolre-webhook] DB error fetching transaction:", txErr);
      throw txErr;
    }
    if (!tx) {
      console.error("[moolre-webhook] No pending wallet transaction found for reference:", reference);
      return new Response("Unknown reference", { status: 404 });
    }
    console.log("[moolre-webhook] Found transaction for user:", tx.user_id, "status:", tx.status);

    console.log("[moolre-webhook] Calling complete_wallet_topup RPC with amount:", amount);
    const { data: result, error: rpcErr } = await svc.rpc("complete_wallet_topup", {
      p_user_id: tx.user_id,
      p_amount: amount,
      p_reference: reference,
      p_description: "Wallet top-up via Moolre",
    } as any);

    console.log("[moolre-webhook] RPC result - error:", rpcErr, " result:", result);
    if (rpcErr) {
      console.error("[moolre-webhook] complete_wallet_topup failed:", rpcErr.message);
      
      // Update transaction status to failed with error reason
      await svc.from("wallet_transactions")
        .update({ 
          status: "failed", 
          reason: `RPC Error: ${rpcErr.message}` 
        } as any)
        .eq("reference", reference)
        .catch(err => console.error("[moolre-webhook] Failed to update transaction status:", err));
      
      return new Response("RPC Error", { status: 500 });
    }

    const resultData = result as any;
    if (resultData?.success === false) {
      console.error("[moolre-webhook] complete_wallet_topup returned error:", resultData.error);
      
      // Update transaction status to failed
      await svc.from("wallet_transactions")
        .update({ 
          status: "failed", 
          reason: resultData.error || "Processing failed" 
        } as any)
        .eq("reference", reference)
        .catch(err => console.error("[moolre-webhook] Failed to update transaction status:", err));
      
      return new Response("Processing failed", { status: 500 });
    }

    console.log("[moolre-webhook] ===== WEBHOOK COMPLETED SUCCESSFULLY =====", reference);
    return new Response("OK", { status: 200 });
  } catch (err: any) {
    console.error("[moolre-webhook] error:", err);
    return new Response("Internal error", { status: 500 });
  }
});
