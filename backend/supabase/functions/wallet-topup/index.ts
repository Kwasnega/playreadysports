import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { verifyMoolrePayment } from "../_shared/moolre.ts";

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
    let { reference, provider } = body;
    
    console.log("[wallet-topup] Request for reference:", reference, "provider:", provider, "user:", user.id);
    
    // If reference is "latest", fetch the most recent pending wallet transaction for this user
    if (reference === "latest") {
      const { data: pendingTx, error: pendingErr } = await svc
        .from("wallet_transactions")
        .select("reference")
        .eq("user_id", user.id)
        .eq("status", "pending")
        .eq("type", "deposit")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      console.log("[wallet-topup] Fetched latest pending tx - error:", pendingErr, " tx:", pendingTx);
      if (pendingErr) throw pendingErr;
      if (!pendingTx) {
        return new Response(JSON.stringify({ error: "No pending wallet transaction found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      reference = pendingTx.reference;
      console.log("[wallet-topup] Using latest reference:", reference);
    }
    
    if (!reference) {
      return new Response(JSON.stringify({ error: "Missing reference" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const paymentProvider = provider || Deno.env.get("PAYMENT_PROVIDER") || "paystack";
    console.log("[wallet-topup] Using payment provider:", paymentProvider);

    if (paymentProvider === "moolre") {
      console.log("[wallet-topup] Checking Moolre transaction for reference:", reference);
      const { data: pendingTx, error: pendingErr } = await svc
        .from("wallet_transactions")
        .select("user_id, amount, status, reference")
        .eq("reference", reference)
        .maybeSingle();

      console.log("[wallet-topup] DB query result - error:", pendingErr, " tx:", pendingTx);
      
      if (pendingErr) {
        console.error("[wallet-topup] DB error:", pendingErr.message);
        throw pendingErr;
      }
      
      if (!pendingTx) {
        console.log("[wallet-topup] Transaction not found for reference:", reference);
        console.log("[wallet-topup] Will attempt direct Moolre verification without DB transaction");
        
        // Try to verify directly with Moolre even if no DB record
        try {
          const moolreStatus = await verifyMoolrePayment(reference, user.email);
          console.log("[wallet-topup] Direct Moolre check - success:", moolreStatus.success, "pending:", moolreStatus.pending);
          
          if (!moolreStatus.success && !moolreStatus.pending) {
            console.log("[wallet-topup] Moolre payment failed:", moolreStatus.message);
            return new Response(JSON.stringify({ error: moolreStatus.message || "Payment verification failed" }), {
              status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          
          if (moolreStatus.pending) {
            console.log("[wallet-topup] Payment still pending, retry later");
            return new Response(JSON.stringify({ success: false, pending: true }), {
              status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          
          // Payment succeeded, create transaction and credit wallet
          if (moolreStatus.success) {
            console.log("[wallet-topup] Creating transaction after Moolre confirmation");
            await svc.from("wallet_transactions").insert({
              user_id: user.id,
              amount: moolreStatus.amount || 0,
              type: "deposit",
              status: "completed",
              reference,
            });
            
            const { data: result, error: rpcErr } = await svc.rpc("complete_wallet_topup", {
              p_user_id: user.id,
              p_amount: moolreStatus.amount || 0,
              p_reference: reference,
              p_description: "Wallet top-up via Moolre",
            } as any);

            if (rpcErr) {
              console.error("[wallet-topup] RPC error:", rpcErr);
              return new Response(JSON.stringify({ error: "Failed to credit wallet" }), {
                status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }

            const { data: balanceData } = await svc
              .from("wallet_balances")
              .select("balance")
              .eq("user_id", user.id)
              .maybeSingle();

            return new Response(JSON.stringify({
              success: true,
              newBalance: Number(balanceData?.balance),
            }), {
              status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } catch (err) {
          console.error("[wallet-topup] Direct Moolre verification failed:", err);
        }
        
        return new Response(JSON.stringify({ error: "Top-up reference not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      if (pendingTx.user_id !== user.id) {
        console.log("[wallet-topup] User mismatch - tx user:", pendingTx.user_id, "request user:", user.id);
        return new Response(JSON.stringify({ error: "Top-up reference does not belong to this user" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log("[wallet-topup] Transaction status:", pendingTx.status);
      // If already completed, return success
      if (pendingTx.status === "completed") {
        console.log("[wallet-topup] SUCCESS - Transaction already completed");
        const { data: balanceData } = await svc
          .from("wallet_balances")
          .select("balance")
          .eq("user_id", user.id)
          .maybeSingle();
        return new Response(JSON.stringify({
          success: true,
          alreadyProcessed: true,
          newBalance: Number(balanceData?.balance || pendingTx.amount),
        }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // If still pending, actively check with Moolre's API
      if (pendingTx.status === "pending") {
        console.log("[wallet-topup] PENDING - Actively verifying with Moolre API for reference:", reference);
        
        try {
          const moolreStatus = await verifyMoolrePayment(reference, user.email);
          console.log("[wallet-topup] Moolre API response - success:", moolreStatus.success, "pending:", moolreStatus.pending, "message:", moolreStatus.message);

          if (moolreStatus.success) {
            console.log("[wallet-topup] Moolre says payment SUCCESSFUL! Processing wallet credit...");
            const amount = moolreStatus.amount || Number(pendingTx.amount);
            
            // Use the idempotent RPC that handles new wallets gracefully
            const { data: result, error: rpcErr } = await svc.rpc("complete_wallet_topup", {
              p_user_id: user.id,
              p_amount: amount,
              p_reference: reference,
              p_description: "Wallet top-up via Moolre",
            } as any);

            if (rpcErr) {
              console.error("[wallet-topup] RPC error:", rpcErr);
              return new Response(JSON.stringify({ error: `Failed to process: ${rpcErr.message}` }), {
                status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }

            const resultData = result as any;
            if (resultData?.success === false) {
              return new Response(JSON.stringify({ error: resultData.error || "Processing failed" }), {
                status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }

            const { data: balanceData } = await svc
              .from("wallet_balances")
              .select("balance")
              .eq("user_id", user.id)
              .maybeSingle();

            console.log("[wallet-topup] SUCCESS - Wallet credited after Moolre verification");
            return new Response(JSON.stringify({
              success: true,
              newBalance: Number(balanceData?.balance || amount),
            }), {
              status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          if (moolreStatus.pending) {
            console.log("[wallet-topup] Moolre says still pending - returning 202");
            return new Response(JSON.stringify({
              success: false,
              pending: true,
              message: "Payment is being verified. Please wait...",
            }), {
              status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          // Moolre says payment failed
          console.log("[wallet-topup] Moolre says payment FAILED - marking transaction as failed");
          await svc
            .from("wallet_transactions")
            .update({ status: "failed", reason: moolreStatus.message || "Moolre payment verification failed" } as any)
            .eq("reference", reference);

          return new Response(JSON.stringify({
            error: moolreStatus.message || "Payment was not successful. Please try again.",
          }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } catch (moolreErr: any) {
          console.error("[wallet-topup] Moolre API verification error:", moolreErr.message);
          // If Moolre API is unreachable or returns an error, return pending so the frontend can retry
          return new Response(JSON.stringify({
            success: false,
            pending: true,
            message: "Payment verification temporarily unavailable. Please check back.",
          }), {
            status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // If marked as failed, return error
      console.log("[wallet-topup] FAILED - Transaction status is not completed or pending");
      return new Response(JSON.stringify({ 
        error: "Payment failed. Please try again."
      }), {
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

    // Amount from Paystack is in pesewas (e.g. 5000 = 50 GHS)
    const amountInCedis = verifyData.data.amount / 100;

    // Use the idempotent RPC that handles missing wallet rows gracefully
    const { data: result, error: rpcError } = await svc.rpc("complete_wallet_topup", {
      p_user_id: user.id,
      p_amount: amountInCedis,
      p_reference: reference,
      p_description: "Wallet top-up via Paystack",
    } as any);

    if (rpcError) {
      console.error("[wallet-topup] RPC error:", rpcError);
      throw rpcError;
    }

    const resultData = result as any;
    if (resultData?.success === false) {
      return new Response(JSON.stringify({ error: resultData.error || "Processing failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      newBalance: resultData?.new_balance || amountInCedis,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[wallet-topup] Error:", err);
    return new Response(JSON.stringify({ error: err.message ?? "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

