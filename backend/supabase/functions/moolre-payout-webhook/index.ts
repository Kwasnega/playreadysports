/**
 * Moolre Payout Webhook Handler
 * 
 * Receives disbursement status callbacks from Moolre
 * Updates venue_payout_requests status + notifies venue owner
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

function extractReference(payload: any): string | null {
  return (
    payload?.data?.reference ||
    payload?.reference ||
    payload?.externalref ||
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

    if (!reference || !reference.startsWith("moolre_payout_")) {
      console.warn("[moolre-payout-webhook] Invalid reference:", reference);
      return new Response("Invalid reference", { status: 400 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const svc = createClient(supabaseUrl, serviceKey);

    // Extract request_id from reference
    const request_id = reference.replace("moolre_payout_", "");

    // Get disbursement status from Moolre payload
    const txStatus = Number(payload?.data?.txstatus ?? 0);
    const finalStatus = txStatus === 1 ? "completed" : "failed";
    const message = payload?.data?.message || payload?.message;

    console.log(
      `[moolre-payout-webhook] Processing payout ${request_id}: ${finalStatus}`
    );

    // Update payout request status
    const { error: updateErr } = await svc
      .from("venue_payout_requests")
      .update({
        status: finalStatus,
        completed_at: finalStatus === "completed" ? new Date().toISOString() : null,
        error_reason: finalStatus === "failed" ? message : null,
        moolre_transaction_id: payload?.data?.transactionid,
      })
      .eq("id", request_id);

    if (updateErr) {
      console.error("[moolre-payout-webhook] Update failed:", updateErr);
      return new Response("DB error", { status: 500 });
    }

    // Fetch payout details to notify owner
    const { data: request } = await svc
      .from("venue_payout_requests")
      .select("owner_id, amount, status")
      .eq("id", request_id)
      .maybeSingle();

    if (request && request.owner_id) {
      // Notify venue owner
      const notificationTitle =
        finalStatus === "completed"
          ? "✅ Your Withdrawal is Complete!"
          : "❌ Withdrawal Failed";

      const notificationBody =
        finalStatus === "completed"
          ? `₵${Number(request.amount).toFixed(2)} has been sent to your mobile money account.`
          : `Your withdrawal request failed: ${message || "Please try again."}`;

      await svc.from("notifications").insert({
        user_id: request.owner_id,
        type: finalStatus === "completed" ? "payout_completed" : "payout_failed",
        title: notificationTitle,
        body: notificationBody,
        data: {
          request_id,
          status: finalStatus,
          amount: request.amount,
        },
      });

      console.log(`[moolre-payout-webhook] Notified owner ${request.owner_id}`);
    }

    return new Response("OK", { status: 200 });
  } catch (err: any) {
    console.error("[moolre-payout-webhook] error:", err);
    return new Response("Internal error", { status: 500 });
  }
});
