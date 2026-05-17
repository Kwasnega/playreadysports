import { createClient } from "jsr:@supabase/supabase-js@2";
import { getgetCorsHeaders() } from "../_shared/cors.ts";

// CORS is handled via getCorsHeaders() from _shared/cors.ts

const PAYSTACK_SECRET = Deno.env.get("PAYSTACK_SECRET_KEY");

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
    const { matchId, userId, reason } = body;
    if (!matchId) {
      return new Response(JSON.stringify({ error: "Missing matchId" }), {
        status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    // Verify caller is organizer (for bulk refunds) or self (for leave refund)
    const { data: match } = await supabase
      .from("matches")
      .select("organizer_id, join_code, status, match_date, entry_fee")
      .eq("id", matchId)
      .single();

    if (!match) {
      return new Response(JSON.stringify({ error: "Match not found" }), {
        status: 404, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    const isOrganizer = match.organizer_id === user.id;
    const targetUserId = userId || user.id;
    const isSelf = targetUserId === user.id;

    if (!isOrganizer && !isSelf) {
      return new Response(JSON.stringify({ error: "Not authorized" }), {
        status: 403, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    // Self-leave: check timing (>2h before = refund, <2h = no refund)
    if (isSelf && !isOrganizer) {
      const matchTime = new Date(match.match_date!).getTime();
      const now = Date.now();
      const hoursUntil = (matchTime - now) / (1000 * 60 * 60);
      if (hoursUntil <= 2) {
        return new Response(JSON.stringify({ error: "No refund — less than 2 hours to kickoff" }), {
          status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
        });
      }
    }

    // Find the paid participant + their transaction
    const { data: participant } = await supabase
      .from("match_participants")
      .select("id, payment_reference, payment_status")
      .eq("match_id", matchId)
      .eq("user_id", targetUserId)
      .single();

    if (!participant || participant.payment_status !== "paid") {
      return new Response(JSON.stringify({ error: "No paid entry fee found" }), {
        status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    const { data: txn } = await supabase
      .from("transactions")
      .select("id, payment_reference, amount")
      .eq("payment_reference", participant.payment_reference)
      .eq("type", "entry_fee")
      .single();

    if (!txn || !txn.payment_reference) {
      return new Response(JSON.stringify({ error: "Transaction not found" }), {
        status: 404, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    // Call Paystack refund
    if (!PAYSTACK_SECRET) {
      return new Response(JSON.stringify({ error: "Paystack not configured" }), {
        status: 500, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    const refundRes = await fetch("https://api.paystack.co/refund", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transaction: txn.payment_reference,
        reason: reason || "Match cancellation",
      }),
    });

    const refundData = await refundRes.json();

    // Even if Paystack refund is pending, mark locally as refunded
    await supabase
      .from("match_participants")
      .update({ payment_status: "refunded" as any })
      .eq("id", participant.id);

    // Insert refund transaction
    await supabase.from("transactions").insert({
      match_id: matchId,
      user_id: targetUserId,
      amount: txn.amount,
      type: "refund" as any,
      status: refundData.status ? "completed" as any : "pending" as any,
      payment_reference: `refund-${txn.payment_reference}`,
    });

    return new Response(JSON.stringify({
      success: true,
      refunded: true,
      paystackStatus: refundData.status ? "submitted" : "failed",
    }), {
      status: 200, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("Edge function error:", err);
    return new Response(JSON.stringify({ error: err.message ?? "Internal error" }), {
      status: 500, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
    });
  }
});
