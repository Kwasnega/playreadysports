/**
 * Moolre Disbursement Payout Function
 * 
 * Sends money to venue owners via Moolre Bulk Disbursement API
 * Supports MTN MoMo, Vodafone, AirtelTigo
 * 
 * API: POST /disburse/send
 * Returns: reference + status for webhook tracking
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { getMoolreConfig, moolrePost } from "../_shared/moolre.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

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
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const svc = createClient(supabaseUrl, serviceKey);

    // Only allow service role or admin to trigger payouts
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { request_id } = body;

    if (!request_id) {
      return new Response(JSON.stringify({ error: "Missing request_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get payout request from database
    const { data: request, error: requestErr } = await svc
      .from("venue_payout_requests")
      .select("*, profiles(phone_number)")
      .eq("id", request_id)
      .maybeSingle();

    if (requestErr || !request) {
      return new Response(JSON.stringify({ error: "Request not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only process if status is pending_moolre
    if (request.status !== "pending_moolre") {
      return new Response(
        JSON.stringify({
          error: "Request not in pending_moolre state",
          current_status: request.status,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const config = getMoolreConfig();
    const reference = `moolre_payout_${request_id}`;
    const phone = request.profiles?.phone_number;

    if (!phone) {
      await svc
        .from("venue_payout_requests")
        .update({ status: "failed", error_reason: "No phone number on file" })
        .eq("id", request_id);

      return new Response(JSON.stringify({ error: "Venue owner has no phone number" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Call Moolre Bulk Disbursement API
    try {
      // Normalize phone: convert 0XXXXXXXXX to +233XXXXXXXXX
      let normalizedPhone = phone.trim();
      if (normalizedPhone.startsWith("0")) {
        normalizedPhone = "+233" + normalizedPhone.slice(1);
      } else if (!normalizedPhone.startsWith("+233")) {
        normalizedPhone = "+233" + normalizedPhone;
      }

      const moolreData = await moolrePost<any>(
        "/disburse/send",
        {
          type: 1, // 1 = mobile money disbursement
          amount: Number(request.amount).toFixed(2),
          phone: normalizedPhone, // E.164 format: +233XXXXXXXXX
          provider: request.provider.toUpperCase(), // MTN, VODAFONE, AIRTELTIGO
          externalref: reference, // Use externalref to match webhook callback
          callback: `${supabaseUrl}/functions/v1/moolre-payout-webhook`,
          accountnumber: config.accountNumber,
          description: `Venue payout for request ${request_id}`,
        },
        "private" // Use private key for disbursements
      );

      // Check if request was successful
      const moolreRef = moolreData?.data?.reference || moolreData?.data?.externalref;
      if (Number(moolreData?.status) !== 1 || !moolreRef) {
        await svc
          .from("venue_payout_requests")
          .update({
            status: "failed",
            error_reason: moolreData?.message || "Moolre disbursement failed",
          })
          .eq("id", request_id);

        return new Response(
          JSON.stringify({
            error: moolreData?.message || "Moolre disbursement failed",
          }),
          {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Update to in_transit
      await svc
        .from("venue_payout_requests")
        .update({
          status: "in_transit",
          moolre_reference: moolreRef,
          moolre_transaction_id: moolreData.data.transactionid,
          processing_started_at: new Date().toISOString(),
        })
        .eq("id", request_id);

      return new Response(
        JSON.stringify({
          success: true,
          moolre_reference: moolreRef,
          moolre_transaction_id: moolreData.data.transactionid,
          status: "in_transit",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } catch (payoutErr: any) {
      console.error("[moolre-payout] Disbursement error:", payoutErr);

      await svc
        .from("venue_payout_requests")
        .update({
          status: "failed",
          error_reason: payoutErr.message || "Unknown error",
        })
        .eq("id", request_id);

      return new Response(JSON.stringify({ error: payoutErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err: any) {
    console.error("[moolre-payout] error:", err);
    return new Response(JSON.stringify({ error: err.message ?? "Internal error" }), {
      status: 500,
      headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
    });
  }
});
