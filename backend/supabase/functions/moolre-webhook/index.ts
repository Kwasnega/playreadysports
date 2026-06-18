import { createClient } from "jsr:@supabase/supabase-js@2";
import { verifyMoolrePayment } from "../_shared/moolre.ts";

function extractReference(payload: any): string | null {
  return (
    payload?.data?.externalref ||
    payload?.data?.reference ||
    payload?.externalref ||
    payload?.reference ||
    null
  );
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const payload = await req.json();
    const reference = extractReference(payload);
    if (!reference) {
      console.error("[moolre-webhook] Missing reference", payload);
      return new Response("Missing reference", { status: 400 });
    }

    const verified = await verifyMoolrePayment(reference);
    if (!verified.success) {
      console.log("[moolre-webhook] Payment not successful yet", reference, verified.message);
      return new Response("Ignored", { status: 200 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const svc = createClient(supabaseUrl, serviceKey);

    const { data: tx, error: txErr } = await svc
      .from("wallet_transactions")
      .select("user_id, amount, status")
      .eq("reference", reference)
      .maybeSingle();

    if (txErr) throw txErr;
    if (!tx) {
      console.error("[moolre-webhook] No pending wallet transaction for", reference);
      return new Response("Unknown reference", { status: 404 });
    }

    const { data: result, error: rpcErr } = await svc.rpc("complete_wallet_topup", {
      p_user_id: tx.user_id,
      p_amount: verified.amount || Number(tx.amount),
      p_reference: reference,
      p_description: "Wallet top-up via Moolre",
    });

    if (rpcErr) {
      console.error("[moolre-webhook] complete_wallet_topup failed", rpcErr.message);
      return new Response("DB error", { status: 500 });
    }

    if ((result as any)?.success === false) {
      console.error("[moolre-webhook] complete_wallet_topup returned", result);
      return new Response("Processing failed", { status: 500 });
    }

    return new Response("OK", { status: 200 });
  } catch (err: any) {
    console.error("[moolre-webhook] error:", err);
    return new Response("Internal error", { status: 500 });
  }
});
