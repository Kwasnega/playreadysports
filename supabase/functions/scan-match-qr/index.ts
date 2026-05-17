import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkRateLimit } from "../_shared/rateLimiter.ts";

// CORS is handled via getCorsHeaders() from _shared/cors.ts

const WINDOW_BEFORE_MS = 2 * 60 * 60 * 1000;
const WINDOW_AFTER_BUFFER_MS = 2 * 60 * 60 * 1000;

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
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) {
      return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
        status: 500, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    const allowed = await checkRateLimit(supabase, user.id, "scan_match_qr", 80, 60);
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Too many check-in attempts — try again later" }), {
        status: 429, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const token = (body?.token as string | undefined)?.trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing token" }), {
        status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    let matchId = "";
    let secret = "";
    try {
      const decoded = atob(token);
      const idx = decoded.indexOf(":");
      if (idx <= 0) throw new Error("bad");
      matchId = decoded.slice(0, idx);
      secret = decoded.slice(idx + 1);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid check-in code" }), {
        status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    const svc = createClient(supabaseUrl, serviceKey);

    const { data: match, error: mErr } = await svc
      .from("matches")
      .select("id, join_code, venue_id, match_date, duration_minutes, status, qr_code_secret, entry_fee")
      .eq("id", matchId)
      .maybeSingle();

    if (mErr || !match || !match.qr_code_secret || match.qr_code_secret !== secret) {
      return new Response(JSON.stringify({ error: "Invalid or expired check-in code" }), {
        status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    if (match.status !== "upcoming" && match.status !== "live") {
      return new Response(JSON.stringify({ error: "This match is not open for check-in" }), {
        status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    const start = new Date(match.match_date as string).getTime();
    const durationMs = (Number(match.duration_minutes) || 60) * 60 * 1000;
    const now = Date.now();
    if (now < start - WINDOW_BEFORE_MS || now > start + durationMs + WINDOW_AFTER_BUFFER_MS) {
      return new Response(JSON.stringify({ error: "Check-in is only available around match time" }), {
        status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    const entryFee = Number(match.entry_fee ?? 0);

    const { data: participant, error: pErr } = await svc
      .from("match_participants")
      .select("id, status, payment_status, attendance_scanned")
      .eq("match_id", matchId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (pErr || !participant) {
      return new Response(JSON.stringify({ error: "You are not registered for this match" }), {
        status: 403, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    if (participant.status !== "active") {
      return new Response(JSON.stringify({ error: "Only active players can check in" }), {
        status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    const paidOk = participant.payment_status === "paid" ||
      (entryFee <= 0 && participant.payment_status !== "refunded");
    if (!paidOk) {
      return new Response(JSON.stringify({ error: "Complete payment before checking in" }), {
        status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    if (participant.attendance_scanned) {
      return new Response(JSON.stringify({ success: true, already: true, message: "You are already checked in!" }), {
        status: 200, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    const scannedAt = new Date().toISOString();
    await svc
      .from("match_participants")
      .update({ attendance_scanned: true as any, checked_in_at: scannedAt })
      .eq("id", participant.id);

    await svc.from("match_checkin_events").insert({
      match_id: matchId,
      venue_id: match.venue_id,
      user_id: user.id,
      scanned_at: scannedAt,
    });

    const { data: scannerProfile } = await svc
      .from("profiles")
      .select("full_name, username")
      .eq("id", user.id)
      .maybeSingle();
    const scannerName = scannerProfile?.full_name || scannerProfile?.username || "A player";

    const { data: venue } = match.venue_id
      ? await svc
        .from("venues")
        .select("owner_id, owner_email, name")
        .eq("id", match.venue_id)
        .maybeSingle()
      : { data: null };

    const notifs: { user_id: string; title: string; body: string; type: string; data: Record<string, unknown> }[] = [];

    if (venue?.owner_id) {
      notifs.push({
        user_id: venue.owner_id,
        title: "Player checked in",
        body: `${scannerName} scanned the pitch QR for ${match.join_code}${venue.name ? ` at ${venue.name}` : ""}.`,
        type: "match_update",
        data: { match_id: matchId, join_code: match.join_code },
      });
    } else if (venue?.owner_email) {
      const { data: ownerProf } = await svc.from("profiles").select("id").eq("email", venue.owner_email.trim()).maybeSingle();
      if (ownerProf?.id) {
        notifs.push({
          user_id: ownerProf.id,
          title: "Player checked in",
          body: `${scannerName} scanned the pitch QR for ${match.join_code}${venue.name ? ` at ${venue.name}` : ""}.`,
          type: "match_update",
          data: { match_id: matchId, join_code: match.join_code },
        });
      }
    }

    if (notifs.length) {
      await svc.from("notifications").insert(notifs as any);
    }

    return new Response(JSON.stringify({ success: true, message: "You are checked in!" }), {
      status: 200, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("scan-match-qr:", err);
    return new Response(JSON.stringify({ error: err.message ?? "Internal error" }), {
      status: 500, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
    });
  }
});
