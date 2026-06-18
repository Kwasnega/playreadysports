/**
 * Admin: Approve Venue Payout Requests
 * 
 * Allows admins to approve pending payouts and trigger Moolre disbursement
 * Query: GET /moolre-admin-payouts?request_id=<id>&action=approve
 * or POST with request_id
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders();

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

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || !["admin", "super_admin"].includes(profile.role)) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get request_id from query or body
    let requestId: string | null = null;
    
    if (req.method === "POST") {
      const body = await req.json();
      requestId = body?.request_id;
    } else if (req.method === "GET") {
      const url = new URL(req.url);
      requestId = url.searchParams.get("request_id");
    }

    if (!requestId) {
      return new Response(JSON.stringify({ error: "Missing request_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Approve the payout request via RPC
    const { data: approvalResult, error: approvalErr } = await svc.rpc(
      "approve_payout_request",
      {
        p_request_id: requestId,
        p_approved_by_user_id: user.id,
      }
    );

    if (approvalErr || !approvalResult?.success) {
      return new Response(
        JSON.stringify({ error: approvalResult?.error || approvalErr?.message }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Now trigger the moolre-payout edge function
    const moolrePayoutUrl = `${supabaseUrl}/functions/v1/moolre-payout`;
    const payoutResponse = await fetch(moolrePayoutUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ request_id: requestId }),
    });

    const payoutResult = await payoutResponse.json();

    if (!payoutResponse.ok) {
      // Payout failed - revert status back to pending
      await svc
        .from("venue_payout_requests")
        .update({
          status: "pending",
          error_reason: payoutResult?.error || "Moolre disbursement failed",
        })
        .eq("id", requestId);

      return new Response(
        JSON.stringify({
          error: "Payout initiation failed",
          details: payoutResult?.error,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Payout approved and disbursement initiated",
        moolre_reference: payoutResult.moolre_reference,
        status: "in_transit",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("[moolre-admin-payouts] error:", err);
    return new Response(JSON.stringify({ error: err.message ?? "Internal error" }), {
      status: 500,
      headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
    });
  }
});
