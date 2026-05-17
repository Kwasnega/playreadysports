import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkRateLimit } from "../_shared/rateLimiter.ts";

// CORS headers for browser calls
// CORS is handled via getCorsHeaders() from _shared/cors.ts

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders() });
  }

  try {
    // ------------------------------------------------------------------
    // 1. Auth — verify JWT from the request
    // ------------------------------------------------------------------
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    // Create a Supabase client with the user's JWT so RLS applies
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    // Rate limit: 5 creates per user per 60 minutes
    const allowed = await checkRateLimit(supabase, user.id, "create_match", 5, 60);
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded — try again later" }), {
        status: 429, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    // ------------------------------------------------------------------
    // 2. Validate payload
    // ------------------------------------------------------------------
    const body = await req.json();
    const {
      venueId,
      matchType,
      matchMode,
      format,
      matchDate,
      durationMinutes,
      entryFee,
      notes,
      teamColorA,
      teamColorB,
    } = body;

    if (!venueId || !matchType || !matchMode || !format || !matchDate) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    // matchDate must be in the future
    const kickoff = new Date(matchDate);
    if (isNaN(kickoff.getTime()) || kickoff.getTime() <= Date.now()) {
      return new Response(JSON.stringify({ error: "Match date must be in the future" }), {
        status: 400,
        headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    if (typeof entryFee !== "number" || entryFee < 0) {
      return new Response(JSON.stringify({ error: "Entry fee must be >= 0" }), {
        status: 400,
        headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    // ------------------------------------------------------------------
    // 3. Check user is not banned
    // ------------------------------------------------------------------
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("is_banned, banned_until")
      .eq("id", user.id)
      .single();

    if (profileErr) {
      return new Response(JSON.stringify({ error: "Failed to load profile" }), {
        status: 500,
        headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    if (profile?.is_banned || (profile?.banned_until && new Date(profile.banned_until) > new Date())) {
      return new Response(JSON.stringify({ error: "Account is banned" }), {
        status: 403,
        headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    // ------------------------------------------------------------------
    // 4. Fetch venue city for code prefix
    // ------------------------------------------------------------------
    const { data: venue, error: venueErr } = await supabase
      .from("venues")
      .select("city")
      .eq("id", venueId)
      .single();

    if (venueErr || !venue) {
      return new Response(JSON.stringify({ error: "Venue not found" }), {
        status: 404,
        headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    const cityPrefixMap: Record<string, string> = {
      accra: "ACC",
      kumasi: "KSI",
      tamale: "TMA",
      takoradi: "TAK",
    };
    const cityLower = (venue.city ?? "").trim().toLowerCase();
    const prefix = cityPrefixMap[cityLower] ?? "PRS";

    // ------------------------------------------------------------------
    // 5. Generate unique join code
    // ------------------------------------------------------------------
    let joinCode = "";
    for (let attempt = 0; attempt < 10; attempt++) {
      const n = Math.floor(100 + Math.random() * 900);
      const candidate = `${prefix}-${n}`;

      const { data: existing } = await supabase
        .from("matches")
        .select("id")
        .eq("join_code", candidate)
        .maybeSingle();

      if (!existing) {
        joinCode = candidate;
        break;
      }
    }

    if (!joinCode) {
      return new Response(JSON.stringify({ error: "Could not generate unique join code" }), {
        status: 500,
        headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    // ------------------------------------------------------------------
    // 6. Derive numbers from format string (e.g. "6v6" → 6)
    // ------------------------------------------------------------------
    const formatStr: string = format;
    const playersPerSide = parseInt(formatStr.split("v")[0] || "6", 10);
    const maxCore = playersPerSide * 2;

    const qrSecret = [...crypto.getRandomValues(new Uint8Array(24))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // ------------------------------------------------------------------
    // 7. Insert match
    // ------------------------------------------------------------------
    const { data: match, error: insertErr } = await supabase
      .from("matches")
      .insert({
        join_code: joinCode,
        organizer_id: user.id,
        venue_id: venueId,
        match_type: matchType as any,
        match_mode: matchMode as any,
        format: formatStr as any,
        players_per_side: playersPerSide,
        max_core_players: maxCore,
        match_date: matchDate,
        duration_minutes: durationMinutes ?? 60,
        entry_fee: entryFee ?? 0,
        notes: notes ?? null,
        status: "upcoming" as any,
        escrow_status: "none" as any,
        core_paid_count: 0,
        qr_code_secret: qrSecret,
        team_color_a: teamColorA ?? "Red",
        team_color_b: teamColorB ?? "Blue",
      })
      .select("*")
      .single();

    if (insertErr || !match) {
      console.error("Insert match error:", insertErr);
      return new Response(JSON.stringify({ error: insertErr?.message ?? "Failed to create match" }), {
        status: 500,
        headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    // ------------------------------------------------------------------
    // 8. Insert organizer as first participant
    // ------------------------------------------------------------------
    const { error: participantErr } = await supabase
      .from("match_participants")
      .insert({
        match_id: match.id,
        user_id: user.id,
        slot_type: "core" as any,
        team: (teamColorA ?? "reds").toLowerCase() as any,
        status: "active" as any,
        payment_status: (entryFee === 0 ? "paid" : "unpaid") as any,
      });

    if (participantErr) {
      console.error("Insert participant error:", participantErr);
      // Best-effort: don't fail the whole request, just log it
    }

    // ------------------------------------------------------------------
    // 9. Return created match
    // ------------------------------------------------------------------
    return new Response(JSON.stringify({ match }), {
      status: 200,
      headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Edge function error:", err);
    return new Response(JSON.stringify({ error: err.message ?? "Internal error" }), {
      status: 500,
      headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
    });
  }
});
