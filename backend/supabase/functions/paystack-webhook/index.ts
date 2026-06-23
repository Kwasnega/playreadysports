import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkRateLimit } from "../_shared/rateLimiter.ts";

const PAYSTACK_SECRET = Deno.env.get("PAYSTACK_SECRET_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Startup diagnostic — visible in Supabase Edge Function logs
if (!PAYSTACK_SECRET) {
  console.warn("[paystack-webhook] PAYSTACK_SECRET_KEY is not set — webhook signature verification will fail. Register webhook at https://dashboard.paystack.com/#/settings/webhooks");
} else {
  console.log("[paystack-webhook] Initialized. Expecting events: charge.success, charge.failed, refund.processed");
}

/** Timing-safe hex-string comparison to prevent timing attacks. */
const normalizeTeamSide = (team?: string | null): "reds" | "blues" | "unassigned" => {
  const value = String(team ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["reds", "red", "team_a", "a"].includes(value)) return "reds";
  if (["blues", "blue", "team_b", "b"].includes(value)) return "blues";
  return "unassigned";
};

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders();

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const bodyString = await req.text();
    const signature = req.headers.get("x-paystack-signature") || "";

    if (!PAYSTACK_SECRET) {
      console.error("[paystack-webhook] PAYSTACK_SECRET_KEY not set");
      return new Response("Not configured", { status: 500 });
    }

    // ── 1. Verify HMAC-SHA512 signature ───────────────────────────────
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(PAYSTACK_SECRET),
      { name: "HMAC", hash: "SHA-512" },
      false,
      ["sign"]
    );
    const hashBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(bodyString));
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (!timingSafeEqual(hashHex, signature)) {
      console.error("[paystack-webhook] Signature mismatch");
      return new Response("Unauthorized", { status: 401 });
    }

    // ── 2. Parse event ────────────────────────────────────────────────
    const event = JSON.parse(bodyString);
    const eventType = event.event;
    const data = event.data;

    console.log("[paystack-webhook] Event:", eventType, "Ref:", data?.reference);

    // Admin client bypasses RLS — this endpoint is called by Paystack, not a user.
    const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Rate limit: 200 webhook calls per IP per minute
    const clientIp = req.headers.get("x-forwarded-for") || "unknown";
    const allowed = await checkRateLimit(adminSupabase, clientIp, "paystack_webhook", 200, 1);
    if (!allowed) {
      return new Response("Rate limit exceeded", { status: 429 });
    }

    // ── 3. charge.success ─────────────────────────────────────────────
    if (eventType === "charge.success") {
      const reference = data.reference;
      const metadata = data.metadata || {};
      const matchId = metadata.match_id;
      const userId = metadata.user_id;
      const team = metadata.team || "unassigned";
      const entryFeeGhs = metadata.entry_fee ?? (data.amount ? data.amount / 100 : 0);

      if (!matchId || !userId) {
        console.error("[paystack-webhook] Missing metadata:", metadata);
        return new Response("Bad metadata", { status: 400 });
      }

      // ── Atomic insert via RPC ──
      const { data: rpcResult, error: rpcErr } = await adminSupabase.rpc("process_paid_join", {
        p_match_id: matchId,
        p_user_id: userId,
        p_team: normalizeTeamSide(team),
        p_payment_reference: reference,
        p_amount: entryFeeGhs,
        p_slot_type: "core",
      });

      if (rpcErr) {
        console.error("[paystack-webhook] process_paid_join RPC error:", rpcErr.message);
        return new Response("DB error", { status: 500 });
      }

      const result = rpcResult as any;
      if (!result?.success) {
        if (result?.already_processed) {
          return new Response("Already processed", { status: 200 });
        }
        console.error("[paystack-webhook] process_paid_join returned:", result?.error);
        return new Response(result?.error || "Processing failed", { status: 400 });
      }

      // ── Load match for notifications ──
      const { data: match } = await adminSupabase
        .from("matches")
        .select("id, join_code, organizer_id, max_core_players, core_paid_count, status")
        .eq("id", matchId)
        .single();

      // ── Notify organizer ──
      if (match) {
        const { error: notifErr } = await adminSupabase.from("notifications").insert({
          user_id: match.organizer_id,
          title: "New player joined (paid)",
          body: `A player paid and joined match ${match.join_code}`,
          type: "payment_received" as any,
          data: { match_id: matchId, join_code: match.join_code },
        });
        if (notifErr) console.error("[paystack-webhook] Notif error:", notifErr.message);
      }

      // ── Check if match now fully paid ──
      const { data: updatedMatch } = await adminSupabase
        .from("matches")
        .select("core_paid_count, max_core_players, join_code")
        .eq("id", matchId)
        .single();

      const maxCore = updatedMatch?.max_core_players ?? 10;
      const paidCount = updatedMatch?.core_paid_count ?? 0;

      if (paidCount >= maxCore) {
        await adminSupabase
          .from("matches")
          .update({ escrow_status: "holding" as any })
          .eq("id", matchId);

        const { data: allParticipants } = await adminSupabase
          .from("match_participants")
          .select("user_id")
          .eq("match_id", matchId)
          .eq("status", "active");

        const notifs = (allParticipants ?? []).map((p: any) => ({
          user_id: p.user_id,
          title: "Match is confirmed!",
          body: `All slots paid for ${updatedMatch?.join_code}. See you on the pitch!`,
          type: "match_confirmed" as any,
          data: { match_id: matchId, join_code: updatedMatch?.join_code },
        }));

        if (notifs.length) {
          const { error: bulkNotifErr } = await adminSupabase.from("notifications").insert(notifs);
          if (bulkNotifErr) console.error("[paystack-webhook] Bulk notif error:", bulkNotifErr.message);
        }
      }

      return new Response("OK", { status: 200 });
    }

    // ── 4. charge.failed ──────────────────────────────────────────────
    if (eventType === "charge.failed") {
      const reference = data.reference;
      await adminSupabase
        .from("transactions")
        .update({ status: "failed" as any })
        .eq("payment_reference", reference);

      console.log("[paystack-webhook] Marked failed:", reference);
      return new Response("OK", { status: 200 });
    }

    // ── 5. refund.processed ───────────────────────────────────────────
    if (eventType === "refund.processed") {
      // data.transaction contains original reference
      const originalRef = data.transaction?.reference || data.reference;
      if (originalRef) {
        await adminSupabase
          .from("transactions")
          .update({ status: "refunded" as any })
          .eq("payment_reference", originalRef);

        // Update participant payment_status
        await adminSupabase
          .from("match_participants")
          .update({ payment_status: "refunded" as any })
          .eq("payment_reference", originalRef);

        console.log("[paystack-webhook] Marked refunded:", originalRef);
      }
      return new Response("OK", { status: 200 });
    }

    // Unknown event — return 200 so Paystack doesn't retry
    console.log("[paystack-webhook] Ignored event:", eventType);
    return new Response("Ignored", { status: 200 });
  } catch (err: any) {
    console.error("[paystack-webhook] Internal error:", err);
    return new Response("Internal error", { status: 500 });
  }
});
