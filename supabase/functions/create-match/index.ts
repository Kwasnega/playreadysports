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
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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

    // Profit
    const profitNum = Number(profitAmount ?? 0);
    if (profitNum < 0) {
      return new Response(JSON.stringify({ error: "VALIDATION_ERROR", field: "profitAmount", message: "Profit cannot be negative" }), {
        status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }
    if (profitNum >= feeNum * maxCoreNum) {
      return new Response(JSON.stringify({ error: "VALIDATION_ERROR", field: "profitAmount", message: "Profit must be less than total pot (entry fee × max players)" }), {
        status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

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
    // 4b. Check venue operating hours
    // ------------------------------------------------------------------
    if (venue.open_time && venue.close_time) {
      const kickoffTime = kickoff.toTimeString().slice(0, 8);
      const matchEnd = new Date(kickoff.getTime() + (durationMinutes ?? 60) * 60_000);
      const endTime = matchEnd.toTimeString().slice(0, 8);

      const openMin = (venue.open_time.split(":").map(Number)[0] ?? 0) * 60 + (venue.open_time.split(":").map(Number)[1] ?? 0);
      const closeMin = (venue.close_time.split(":").map(Number)[0] ?? 0) * 60 + (venue.close_time.split(":").map(Number)[1] ?? 0);
      const startMin = kickoff.getHours() * 60 + kickoff.getMinutes();
      const endMin = matchEnd.getHours() * 60 + matchEnd.getMinutes();

      const withinHours = openMin <= closeMin
        ? (startMin >= openMin && endMin <= closeMin)
        : (startMin >= openMin || endMin <= closeMin);

      if (!withinHours) {
        return new Response(JSON.stringify({
          error: `This venue is only open ${venue.open_time.slice(0, 5)} – ${venue.close_time.slice(0, 5)}. Your match (${kickoffTime.slice(0, 5)} – ${endTime.slice(0, 5)}) falls outside these hours.`,
        }), {
          status: 409,
          headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
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

    // ------------------------------------------------------------------
    // 7. Insert match
    // ------------------------------------------------------------------
    const { data: match, error: insertErr } = await supabase
      .from("matches")
      .insert({
        title: title.trim(),
        sport_id: sportType,
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
        organizer_profit_amount: profitNum,
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
      // Best-effort: don't fail the whole request, silently continue
    }

    // ------------------------------------------------------------------
    // 8a. Charge organizer entry fee (auto-pay on creation)
    // ------------------------------------------------------------------
    const svc = createClient(supabaseUrl, serviceKey);

    if (feeNum > 0) {
      const { data: walletRow } = await svc
        .from("wallet_balances")
        .select("balance")
        .eq("user_id", user.id)
        .single();

      const currentBalance = Number(walletRow?.balance ?? 0);
      if (currentBalance < feeNum) {
        // Rollback: remove match and participant so the user isn't left with an unpaid match
        await svc.from("match_participants").delete().eq("match_id", match.id).eq("user_id", user.id);
        await svc.from("matches").delete().eq("id", match.id);
        return new Response(
          JSON.stringify({ error: `Insufficient wallet balance. You need ₵${feeNum} to create this match. Please top up your wallet.` }),
          { status: 402, headers: { ...getCorsHeaders(), "Content-Type": "application/json" } },
        );
      }

      // Deduct fee
      await svc
        .from("wallet_balances")
        .update({ balance: currentBalance - feeNum })
        .eq("user_id", user.id);

      // Log spend transaction
      await svc.from("wallet_transactions").insert({
        user_id: user.id,
        amount: -feeNum,
        type: "spend" as any,
        reference: `create_match_${match.id}_${Date.now()}`,
        status: "completed" as any,
      });

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

        const { data: walletRow } = await svc
          .from("wallet_balances")
          .select("balance")
          .eq("user_id", user.id)
          .single();

        const currentBalance = Number(walletRow?.balance ?? 0);
        if (currentBalance < organizerVenueFee) {
          // Rollback: remove match and participant
          await svc.from("match_participants").delete().eq("match_id", match.id).eq("user_id", user.id);
          await svc.from("matches").delete().eq("id", match.id);
          return new Response(
            JSON.stringify({ error: `Insufficient wallet balance. You need ₵${organizerVenueFee.toFixed(2)} to cover the venue cost for this free match.` }),
            { status: 402, headers: { ...getCorsHeaders(), "Content-Type": "application/json" } },
          );
        }

        // Deduct venue cost
        await svc
          .from("wallet_balances")
          .update({ balance: currentBalance - organizerVenueFee })
          .eq("user_id", user.id);

        // Log spend transaction
        await svc.from("wallet_transactions").insert({
          user_id: user.id,
          amount: -organizerVenueFee,
          type: "spend" as any,
          reference: `venue_cost_${match.id}_${Date.now()}`,
          status: "completed" as any,
        });

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
    return new Response(JSON.stringify({ error: err.message ?? "Internal error" }), {
      status: 500,
      headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
    });
  }
});
