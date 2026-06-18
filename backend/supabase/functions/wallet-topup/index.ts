import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { verifyMoolrePayment } from "../_shared/moolre.ts";

// CORS is handled via getCorsHeaders() from _shared/cors.ts

const PAYSTACK_SECRET = Deno.env.get("PAYSTACK_SECRET_KEY");

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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { reference, provider } = body;
    if (!reference) {
      return new Response(JSON.stringify({ error: "Missing reference" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const paymentProvider = provider || Deno.env.get("PAYMENT_PROVIDER") || "paystack";

    if (paymentProvider === "moolre") {
      const { data: pendingTx, error: pendingErr } = await svc
        .from("wallet_transactions")
        .select("user_id, amount, status")
        .eq("reference", reference)
        .maybeSingle();

      if (pendingErr) throw pendingErr;
      if (!pendingTx) {
        return new Response(JSON.stringify({ error: "Top-up reference not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (pendingTx.user_id !== user.id) {
        return new Response(JSON.stringify({ error: "Top-up reference does not belong to this user" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (pendingTx.status === "completed") {
        return new Response(JSON.stringify({
          success: true,
          alreadyProcessed: true,
        }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const verified = await verifyMoolrePayment(reference);
      console.log("[wallet-topup] Moolre verification result:", { reference, verified });
      
      if (verified.pending) {
        return new Response(JSON.stringify({
          success: false,
          pending: true,
          message: "Payment is still processing",
        }), {
          status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!verified.success) {
        console.error("[wallet-topup] Moolre verification failed:", { reference, message: verified.message, raw: verified.raw });
        return new Response(JSON.stringify({ error: verified.message || "Payment not verified" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const expectedAmount = Number(pendingTx.amount);
      if (expectedAmount > 0 && Math.abs(verified.amount - expectedAmount) > 0.01) {
        return new Response(JSON.stringify({ error: "Payment amount mismatch" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: result, error: rpcError } = await svc.rpc("complete_wallet_topup", {
        p_user_id: user.id,
        p_amount: verified.amount || expectedAmount,
        p_reference: reference,
        p_description: "Wallet top-up via Moolre",
      });

      if (rpcError) throw rpcError;

      const rpcResult = result as any;
      if (rpcResult?.success === false) {
        return new Response(JSON.stringify({ error: rpcResult.error || "Top-up failed" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        alreadyProcessed: !!rpcResult?.already_processed,
        newBalance: rpcResult?.new_balance,
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
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

    // Amount from Paystack is in pesewas (e.g. 5000 = 50 GHS)
    // Always trust Paystack's verified amount
    const amountInCedis = verifyData.data.amount / 100;

    // Call RPC to securely deposit to wallet
    const { error: rpcError } = await supabase.rpc("process_wallet_transaction", {
      p_user_id: user.id,
      p_amount: amountInCedis,
      p_type: 'deposit',
      p_reference: reference,
      p_match_id: null,
      p_description: "Wallet top-up via Paystack",
    } as any);

    if (rpcError) {
      // Check if it's a unique constraint violation (duplicate top-up attempt)
      if (rpcError.message?.includes("wallet_transactions_reference_key") || rpcError.code === '23505') {
        return new Response(JSON.stringify({ success: true, message: "Already processed" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw rpcError;
    }

    return new Response(JSON.stringify({ success: true, newBalance: amountInCedis }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("Wallet top-up error:", err);
    return new Response(JSON.stringify({ error: err.message ?? "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
