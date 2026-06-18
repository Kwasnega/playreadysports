import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkRateLimit } from "../_shared/rateLimiter.ts";

// CORS headers for browser calls
// CORS is handled via getCorsHeaders() from _shared/cors.ts

Deno.serve(async (req) => {
  const requestOrigin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(requestOrigin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
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
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) {
      return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const svc = createClient(supabaseUrl, serviceKey);

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    // Rate limit: 5 creates per user per 60 minutes
    // Disabled while debugging match creation issues.
    // const allowed = await checkRateLimit(supabase, user.id, "create_match", 5, 60);
    // if (!allowed) {
    //   return new Response(JSON.stringify({
    //     error: "Rate limit exceeded",
    //     type: "rate_limit",
    //     message: "You have reached the match creation limit. Please wait a few minutes and try again.",
    //   }), {
    //     status: 429,
    //     headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
    //   });
    // }

    // ------------------------------------------------------------------
    // 2. Validate payload
    // ------------------------------------------------------------------
    const body = await req.json();
    const {
      title,
      sportType,
      venueId,
      matchType,
      matchMode,
      format,
      matchDate,
      durationMinutes,
      entryFee,
      maxCore,
      profitAmount,
      notes,
      teamColorA,
      teamColorB,
    } = body;

    if (!venueId || !matchType || !matchMode || !format || !matchDate) {
      return new Response(JSON.stringify({ error: "VALIDATION_ERROR", field: "required", message: "Missing required fields" }), {
        status: 400,
        headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    // Title
    if (!title || typeof title !== "string") {
      return new Response(JSON.stringify({ error: "VALIDATION_ERROR", field: "title", message: "Match title is required" }), {
        status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }
    if (title.trim().length < 3) {
      return new Response(JSON.stringify({ error: "VALIDATION_ERROR", field: "title", message: "Title must be at least 3 characters" }), {
        status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }
    if (title.trim().length > 60) {
      return new Response(JSON.stringify({ error: "VALIDATION_ERROR", field: "title", message: "Title must be 60 characters or less" }), {
        status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    // Match type allowlist
    const ALLOWED_MATCH_TYPES = ["public", "private"];
    if (!matchType || !ALLOWED_MATCH_TYPES.includes(matchType)) {
      return new Response(JSON.stringify({ error: "VALIDATION_ERROR", field: "matchType", message: "Invalid match type" }), {
        status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    // Match mode allowlist
    const ALLOWED_MATCH_MODES = ["two_team", "gala"];
    if (!matchMode || !ALLOWED_MATCH_MODES.includes(matchMode)) {
      return new Response(JSON.stringify({ error: "VALIDATION_ERROR", field: "matchMode", message: "Invalid match mode" }), {
        status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    // Sport
    if (!sportType || typeof sportType !== "string") {
      return new Response(JSON.stringify({ error: "VALIDATION_ERROR", field: "sportType", message: "Please select a sport" }), {
        status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    // Entry fee
    const feeNum = Number(entryFee);
    if (isNaN(feeNum) || feeNum < 0) {
      return new Response(JSON.stringify({ error: "VALIDATION_ERROR", field: "entryFee", message: "Entry fee must be a number >= 0" }), {
        status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }
    if (feeNum > 10000) {
      return new Response(JSON.stringify({ error: "VALIDATION_ERROR", field: "entryFee", message: "Entry fee cannot exceed 10000" }), {
        status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    // Max players
    const maxCoreNum = Number(maxCore);
    if (!Number.isInteger(maxCoreNum) || maxCoreNum < 2) {
      return new Response(JSON.stringify({ error: "VALIDATION_ERROR", field: "maxCore", message: "Max players must be at least 2" }), {
        status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }
    if (maxCoreNum > 100) {
      return new Response(JSON.stringify({ error: "VALIDATION_ERROR", field: "maxCore", message: "Max players cannot exceed 100" }), {
        status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    // Profit is no longer supported — always set to 0
    const profitNum = 0;

    // Date — must be at least 30 minutes in the future
    const kickoff = new Date(matchDate);
    if (isNaN(kickoff.getTime()) || kickoff.getTime() <= Date.now() + 30 * 60 * 1000) {
      return new Response(JSON.stringify({ error: "VALIDATION_ERROR", field: "matchDate", message: "Match must be scheduled at least 30 minutes from now" }), {
        status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
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
    // 4. Fetch venue details for code prefix, blockout check, and turf owner
    // ------------------------------------------------------------------
    const { data: venue, error: venueErr } = await supabase
      .from("venues")
      .select("city, owner_id, owner_email, open_time, close_time, price_per_hour")
      .eq("id", venueId)
      .single();

    if (venueErr || !venue) {
      return new Response(JSON.stringify({ error: "Venue not found" }), {
        status: 404,
        headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    // ------------------------------------------------------------------
    // 4b. Check venue operating hours (Africa/Accra — Ghana)
    // ------------------------------------------------------------------
    if (venue.open_time && venue.close_time) {
      const tz = "Africa/Accra";
      const kickoffParts = new Intl.DateTimeFormat("en-GB", {
        timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
      }).formatToParts(kickoff);
      const kickoffH = Number(kickoffParts.find((p) => p.type === "hour")?.value ?? 0);
      const kickoffM = Number(kickoffParts.find((p) => p.type === "minute")?.value ?? 0);
      const matchEnd = new Date(kickoff.getTime() + (durationMinutes ?? 60) * 60_000);
      const endParts = new Intl.DateTimeFormat("en-GB", {
        timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
      }).formatToParts(matchEnd);
      const endH = Number(endParts.find((p) => p.type === "hour")?.value ?? 0);
      const endM = Number(endParts.find((p) => p.type === "minute")?.value ?? 0);

      const openMin = (venue.open_time.split(":").map(Number)[0] ?? 0) * 60 + (venue.open_time.split(":").map(Number)[1] ?? 0);
      const closeMin = (venue.close_time.split(":").map(Number)[0] ?? 0) * 60 + (venue.close_time.split(":").map(Number)[1] ?? 0);
      const startMin = kickoffH * 60 + kickoffM;
      const endMinVal = endH * 60 + endM;

      const withinHours = openMin <= closeMin
        ? (startMin >= openMin && endMinVal <= closeMin)
        : (startMin >= openMin || endMinVal <= closeMin);

      if (!withinHours) {
        return new Response(JSON.stringify({
          error: `This venue is only open ${venue.open_time.slice(0, 5)} – ${venue.close_time.slice(0, 5)} (Ghana time). Please pick a time within operating hours.`,
        }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ------------------------------------------------------------------
    // 4c. Check for blockout overlap
    // ------------------------------------------------------------------
    const kickoffDate = kickoff.toISOString().split("T")[0];
    const blockoutKickoffTime = kickoff.toTimeString().slice(0, 8); // HH:MM:SS
    const blockoutMatchEnd = new Date(kickoff.getTime() + (durationMinutes ?? 60) * 60_000);
    const blockoutEndTime = blockoutMatchEnd.toTimeString().slice(0, 8);

    const { data: blockouts } = await supabase
      .from("venue_blockouts")
      .select("block_date, start_time, end_time, reason")
      .eq("venue_id", venueId)
      .eq("block_date", kickoffDate);

    for (const b of blockouts ?? []) {
      // Full-day blockout (no start/end times)
      if (!b.start_time || !b.end_time) {
        return new Response(JSON.stringify({
          error: `This venue is blocked on ${kickoffDate}${b.reason ? ` — ${b.reason}` : ""}. Please pick another date or time.`
        }), {
          status: 409,
          headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
        });
      }
      // Partial blockout — check overlap
      if (blockoutKickoffTime < b.end_time && blockoutEndTime > b.start_time) {
        return new Response(JSON.stringify({
          error: `This venue is blocked from ${b.start_time} to ${b.end_time} on ${kickoffDate}${b.reason ? ` — ${b.reason}` : ""}. Please pick another time.`
        }), {
          status: 409,
          headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
        });
      }
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

    const qrSecret = [...crypto.getRandomValues(new Uint8Array(24))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const CHECKIN_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let checkInCode = "";
    for (let attempt = 0; attempt < 10; attempt++) {
      const bytes = crypto.getRandomValues(new Uint8Array(10));
      const candidate = Array.from(bytes, (b) => CHECKIN_CHARS[b % CHECKIN_CHARS.length]).join("");
      const { data: existingCode } = await svc
        .from("matches")
        .select("id")
        .eq("check_in_code", candidate)
        .maybeSingle();
      if (!existingCode) {
        checkInCode = candidate;
        break;
      }
    }
    if (!checkInCode) {
      return new Response(JSON.stringify({ error: "Could not generate check-in code" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve sport identifier: for now, only "football" is supported
    // sportType can be "football", the numeric id, or a uuid
    let resolvedSportId: any = null;
    
    const sportLower = String(sportType).trim().toLowerCase();
    
    if (sportLower === "football" || sportLower === "⚽") {
      // Hardcoded for football (the only sport for now)
      // Fetch the actual ID from the database
      const { data: football } = await svc.from("sports").select("id").ilike("name", "football").single();
      resolvedSportId = football?.id ?? 1; // fallback to 1 if not found
      console.log(`[create-match] Football resolved to ID: ${resolvedSportId}`);
    } else {
      // Try to lookup by name or ID
      const asNum = Number(sportType);
      if (!isNaN(asNum) && asNum > 0) {
        resolvedSportId = asNum;
        console.log(`[create-match] Sport resolved to numeric ID: ${resolvedSportId}`);
      } else {
        const { data: sport } = await svc.from("sports").select("id").ilike("name", sportLower).single();
        if (sport) {
          resolvedSportId = sport.id;
          console.log(`[create-match] Sport matched: ${sportLower} → ${resolvedSportId}`);
        }
      }
    }

    if (!resolvedSportId) {
      console.error(`[create-match] Could not resolve sport: ${sportType}`);
      return new Response(JSON.stringify({ 
        error: "VALIDATION_ERROR", 
        field: "sportType", 
        message: "Only 'football' is currently supported." 
      }), {
        status: 400,
        headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    // ------------------------------------------------------------------
    // 7. Insert match
    // ------------------------------------------------------------------
    const { data: match, error: insertErr } = await supabase
      .from("matches")
      .insert({
        title: title.trim(),
        sport_id: resolvedSportId,
        join_code: joinCode,
        organizer_id: user.id,
        venue_id: venueId,
        match_type: matchType as any,
        match_mode: matchMode as any,
        format: formatStr as any,
        players_per_side: playersPerSide,
        max_core_players: maxCoreNum,
        match_date: matchDate,
        duration_minutes: durationMinutes ?? 60,
        entry_fee: feeNum,
        organizer_profit_amount: 0,
        notes: notes ?? null,
        status: "upcoming" as any,
        escrow_status: "none" as any,
        core_paid_count: 0,
        qr_code_secret: qrSecret,
        check_in_code: checkInCode,
        team_color_a: "Team A",
        team_color_b: "Team B",
      })
      .select("*")
      .single();

    if (insertErr || !match) {
      return new Response(JSON.stringify({ error: insertErr?.message ?? "Failed to create match" }), {
        status: 500,
        headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    // ------------------------------------------------------------------
    // 8. Insert organizer as first participant
    // ------------------------------------------------------------------
    const organizerTeam = Math.random() > 0.5 ? "reds" : "blues";
    const { error: participantErr } = await supabase
      .from("match_participants")
      .insert({
        match_id: match.id,
        user_id: user.id,
        slot_type: "core" as any,
        team: organizerTeam as any,
        status: "active" as any,
        payment_status: (feeNum === 0 ? "paid" : "unpaid") as any,
      });

    if (participantErr) {
      // Cannot leave a match with no organizer participant — roll back
      await svc.from("matches").delete().eq("id", match.id);
      return new Response(
        JSON.stringify({ error: `Match created but failed to add you as participant: ${participantErr.message}. Match has been cancelled.` }),
        { status: 500, headers: { ...getCorsHeaders(), "Content-Type": "application/json" } }
      );
    }

    // ------------------------------------------------------------------
    // 8a. Charge organizer entry fee (auto-pay on creation)
    // ------------------------------------------------------------------
    if (feeNum > 0) {
      const ref = `create_match_${match.id}_${Date.now()}`;
      const { error: txErr } = await svc.rpc("process_wallet_transaction", {
        p_user_id: user.id,
        p_amount: -feeNum,
        p_type: "spend",
        p_reference: ref,
        p_match_id: match.id,
        p_description: `Entry fee for match: ${match.title}`,
      });

      if (txErr) {
        // Rollback: remove match and participant so the user isn't left with an unpaid match
        await svc.from("match_participants").delete().eq("match_id", match.id).eq("user_id", user.id);
        await svc.from("matches").delete().eq("id", match.id);
        return new Response(
          JSON.stringify({ error: `Insufficient wallet balance. You need ₵${feeNum} to create this match. Please top up your wallet.` }),
          { status: 402, headers: { ...getCorsHeaders(), "Content-Type": "application/json" } }
        );
      }

      // Mark organizer as paid and increment paid count
      await svc
        .from("match_participants")
        .update({ payment_status: "paid" as any })
        .eq("match_id", match.id)
        .eq("user_id", user.id);

      await svc
        .from("matches")
        .update({ core_paid_count: 1 })
        .eq("id", match.id);
    } else {
      // Free match: organizer still counts as a paid core player
      await svc
        .from("matches")
        .update({ core_paid_count: 1 })
        .eq("id", match.id);
    }

    // ------------------------------------------------------------------
    // 8c. If match is free but venue has a price, organizer pays venue cost
    // ------------------------------------------------------------------
    if (feeNum === 0) {
      const pricePerHour = Number(venue?.price_per_hour ?? 0);
      if (pricePerHour > 0) {
        const hrs = (durationMinutes ?? 60) / 60;
        const organizerVenueFee = pricePerHour * hrs;
        const ref = `venue_cost_${match.id}_${Date.now()}`;

        const { error: txErr } = await svc.rpc("process_wallet_transaction", {
          p_user_id: user.id,
          p_amount: -organizerVenueFee,
          p_type: "spend",
          p_reference: ref,
          p_match_id: match.id,
          p_description: `Venue cost for free match: ${match.title}`,
        });

        if (txErr) {
          // Rollback: remove match and participant
          await svc.from("match_participants").delete().eq("match_id", match.id).eq("user_id", user.id);
          await svc.from("matches").delete().eq("id", match.id);
          return new Response(
            JSON.stringify({ error: `Insufficient wallet balance. You need ₵${organizerVenueFee.toFixed(2)} to cover the venue cost for this free match.` }),
            { status: 402, headers: { ...getCorsHeaders(), "Content-Type": "application/json" } },
          );
        }

        // Update match with organizer_venue_fee
        await svc
          .from("matches")
          .update({ organizer_venue_fee: organizerVenueFee })
          .eq("id", match.id);

        // Ensure organizer is marked paid for covering venue cost
        await svc
          .from("match_participants")
          .update({ payment_status: "paid" as any })
          .eq("match_id", match.id)
          .eq("user_id", user.id);
      }
    }

    // ------------------------------------------------------------------
    // 8b. Auto-add turf owner as participant (for lobby chat visibility)
    // ------------------------------------------------------------------
    let turfOwnerId: string | null = venue.owner_id ?? null;
    if (!turfOwnerId && venue.owner_email) {
      const { data: ownerProf } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", venue.owner_email.trim())
        .maybeSingle();
      turfOwnerId = ownerProf?.id ?? null;
    }
    if (turfOwnerId && turfOwnerId !== user.id) {
      await supabase.from("match_participants").insert({
        match_id: match.id,
        user_id: turfOwnerId,
        slot_type: "turf_owner" as any,
        team: "unassigned" as any,
        status: "active" as any,
        payment_status: "exempt" as any,
      });
    }

    // ------------------------------------------------------------------
    // 9. Return created match
    // ------------------------------------------------------------------
    return new Response(JSON.stringify({ match }), {
      status: 200,
      headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("create-match error:", err);
    console.error("Error stack:", err.stack);
    console.error("Error details:", {
      name: err.name,
      message: err.message,
      toString: String(err),
    });
    // Return error and stack for debugging (remove in production)
    return new Response(JSON.stringify({ error: err.message ?? "Internal error", stack: err.stack ?? null }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
