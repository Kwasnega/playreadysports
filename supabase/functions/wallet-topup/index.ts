import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

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
    const { reference } = body;
    if (!reference) {
      return new Response(JSON.stringify({ error: "Missing reference" }), {
        status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    // Verify with Paystack
    if (!PAYSTACK_SECRET) {
      return new Response(JSON.stringify({ error: "Paystack not configured" }), {
        status: 500, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
    });
    const verifyData = await verifyRes.json();

    if (!verifyData.status || verifyData.data.status !== "success") {
      return new Response(JSON.stringify({ error: verifyData.message || "Payment not verified" }), {
        status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
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
      p_reference: reference
    });

    if (rpcError) {
      // Check if it's a unique constraint violation (duplicate top-up attempt)
      if (rpcError.message?.includes("wallet_transactions_reference_key") || rpcError.code === '23505') {
        return new Response(JSON.stringify({ success: true, message: "Already processed" }), {
          status: 200, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
        });
      }
      throw rpcError;
    }

    return new Response(JSON.stringify({ success: true, newBalance: amountInCedis }), {
      status: 200, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("Wallet top-up error:", err);
    return new Response(JSON.stringify({ error: err.message ?? "Internal error" }), {
      status: 500, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
    });
  }
});
