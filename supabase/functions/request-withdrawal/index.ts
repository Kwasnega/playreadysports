import { createClient } from "jsr:@supabase/supabase-js@2";
import { getgetCorsHeaders() } from "../_shared/cors.ts";

// CORS is handled via getCorsHeaders() from _shared/cors.ts

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders() });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user from JWT
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await anonClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    // Verify user is a venue owner
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, venue_owner_balance")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "turf_owner") {
      return new Response(JSON.stringify({ error: "Only venue owners can request withdrawals" }), {
        status: 403, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { amount, phone, provider = "mtn" } = body;

    if (!amount || amount < 10) {
      return new Response(JSON.stringify({ error: "Minimum withdrawal is GHS 10" }), {
        status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    if (!phone || phone.trim().length < 9) {
      return new Response(JSON.stringify({ error: "Valid phone number required" }), {
        status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    const balance = profile.venue_owner_balance ?? 0;
    if (amount > balance) {
      return new Response(JSON.stringify({ error: `Insufficient balance. Available: GHS ${balance.toFixed(2)}` }), {
        status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    // Debit balance and create pending withdrawal record
    const { error: debitErr } = await supabase
      .from("profiles")
      .update({ venue_owner_balance: balance - amount })
      .eq("id", user.id);

    if (debitErr) {
      return new Response(JSON.stringify({ error: "Failed to debit balance" }), {
        status: 500, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    const { error: txErr } = await supabase
      .from("wallet_transactions")
      .insert({
        user_id: user.id,
        amount: -amount,
        type: "withdrawal",
        status: "pending",
        reference: `vo-withdraw-${user.id}-${Date.now()}`,
        metadata: { phone: phone.trim(), provider },
      } as any);

    if (txErr) {
      // Rollback balance
      await supabase.from("profiles").update({ venue_owner_balance: balance }).eq("id", user.id);
      return new Response(JSON.stringify({ error: "Failed to record withdrawal" }), {
        status: 500, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    // Notify admin
    const { data: admins } = await supabase
      .from("profiles")
      .select("id")
      .in("role", ["admin", "super_admin"]);

    const adminNotifs = (admins ?? []).map((a: any) => ({
      user_id: a.id,
      title: "New venue owner withdrawal",
      body: `GHS ${amount.toFixed(2)} requested by venue owner`,
      type: "admin_alert" as any,
      data: { user_id: user.id, amount, phone: phone.trim() },
    }));

    if (adminNotifs.length) {
      await supabase.from("notifications").insert(adminNotifs);
    }

    return new Response(JSON.stringify({ success: true, message: "Withdrawal request submitted. Admin will process within 24 hours." }), {
      status: 200, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("request-withdrawal error:", err);
    return new Response(JSON.stringify({ error: err.message ?? "Internal error" }), {
      status: 500, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
    });
  }
});
