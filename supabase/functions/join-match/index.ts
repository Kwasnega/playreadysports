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
    const { matchId, team: requestedTeam, slotType = "core" } = body;
    if (!matchId) {
      return new Response(JSON.stringify({ error: "Missing matchId" }), {
        status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    // Load match + venue + organizer
    const { data: match, error: matchErr } = await supabase
      .from("matches")
      .select("*, venue:venues(name, city), organizer:profiles(full_name, username)")
      .eq("id", matchId)
      .single();

    if (matchErr || !match) {
      return new Response(JSON.stringify({ error: "Match not found" }), {
        status: 404, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    if (match.status !== "upcoming" && match.status !== "live") {
      return new Response(JSON.stringify({ error: "Match is not open for joining" }), {
        status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    // Check if user is already a participant (active or waitlisted)
    const { data: existing } = await supabase
      .from("match_participants")
      .select("id, status")
      .eq("match_id", matchId)
      .eq("user_id", user.id)
      .in("status", ["active", "waitlist"] as any)
      .maybeSingle();

    if (existing) {
      const msg = existing.status === "waitlist" ? "Already on the waitlist" : "Already joined this match";
      return new Response(JSON.stringify({ error: msg }), {
        status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    const maxCore = match.max_core_players ?? match.players_per_side ?? 10;

    // Count current active core players
    const { count: activeCount } = await supabase
      .from("match_participants")
      .select("*", { count: "exact", head: true })
      .eq("match_id", matchId)
      .eq("status", "active")
      .eq("slot_type", "core");

    const isFull = (activeCount ?? 0) >= maxCore;

    // If full → add to waitlist
    if (isFull) {
      // Get next waitlist position
      const { data: lastWaitlist } = await supabase
        .from("match_participants")
        .select("waitlist_position")
        .eq("match_id", matchId)
        .eq("status", "waitlist" as any)
        .order("waitlist_position", { ascending: false })
        .limit(1);

      const nextPos = ((lastWaitlist?.[0] as any)?.waitlist_position ?? 0) + 1;

      const { data: waitlistEntry, error: wErr } = await supabase
        .from("match_participants")
        .insert({
          match_id: matchId,
          user_id: user.id,
          slot_type: "core" as any,
          team: "unassigned" as any,
          status: "waitlist" as any,
          payment_status: "unpaid" as any,
          waitlist_position: nextPos,
        })
        .select("id, waitlist_position")
        .single();

      if (wErr) {
        return new Response(JSON.stringify({ error: wErr.message }), {
          status: 500, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
        });
      }

      await supabase.from("notifications").insert({
        user_id: user.id,
        title: "Added to waitlist",
        body: `Match ${match.join_code} is full. You're #${nextPos} on the waitlist — we'll notify you if a spot opens.`,
        type: "match_update" as any,
        data: { match_id: matchId, join_code: match.join_code, waitlist_position: nextPos },
      });

      return new Response(
        JSON.stringify({ waitlisted: true, position: nextPos, participant: waitlistEntry }),
        { status: 200, headers: { ...getCorsHeaders(), "Content-Type": "application/json" } },
      );
    }

    // Not full → normal join
    // Determine team: auto-assign for public matches, manual for private
    let assignedTeam = requestedTeam;
    if (!assignedTeam || match.match_type === "public") {
      const teamA = (match.team_color_a ?? "red").toLowerCase();
      const teamB = (match.team_color_b ?? "blue").toLowerCase();
      const { data: teamCounts } = await supabase
        .from("match_participants")
        .select("team")
        .eq("match_id", matchId)
        .eq("status", "active")
        .eq("slot_type", "core");
      const countA = (teamCounts ?? []).filter((p: any) => p.team === teamA).length;
      const countB = (teamCounts ?? []).filter((p: any) => p.team === teamB).length;
      assignedTeam = countA <= countB ? teamA : teamB;
    }
    if (!assignedTeam) assignedTeam = "reds";

    // Insert participant
    const { data: participant, error: pErr } = await supabase
      .from("match_participants")
      .insert({
        match_id: matchId,
        user_id: user.id,
        slot_type: slotType as any,
        team: assignedTeam as any,
        status: "active" as any,
        payment_status: (match.entry_fee === 0 ? "paid" : "unpaid") as any,
      })
      .select("id")
      .single();

    if (pErr) {
      return new Response(JSON.stringify({ error: pErr.message }), {
        status: 500, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    // Notify organizer
    const joinerName = match.organizer?.full_name || match.organizer?.username || "Someone";
    const paidCount = (match.core_paid_count ?? 0) + 1;

    await supabase.from("notifications").insert({
      user_id: match.organizer_id,
      title: "New player joined",
      body: `${joinerName} joined your match (${paidCount}/${maxCore})`,
      type: "match_join" as any,
      data: { match_id: matchId, join_code: match.join_code },
    });

    // Re-count to check if now full
    const { count: newActiveCount } = await supabase
      .from("match_participants")
      .select("*", { count: "exact", head: true })
      .eq("match_id", matchId)
      .eq("status", "active")
      .eq("slot_type", "core");

    if ((newActiveCount ?? 0) >= maxCore) {
      await supabase.from("matches").update({ status: "live" as any }).eq("id", matchId);

      const { data: participants } = await supabase
        .from("match_participants")
        .select("user_id")
        .eq("match_id", matchId)
        .eq("status", "active");

      const notifs = (participants ?? []).map((p: any) => ({
        user_id: p.user_id,
        title: "Match is full!",
        body: `Match ${match.join_code} is full — it's on!`,
        type: "match_confirmed" as any,
        data: { match_id: matchId, join_code: match.join_code },
      }));

      if (notifs.length) {
        await supabase.from("notifications").insert(notifs);
      }
    }

    return new Response(JSON.stringify({ participant }), {
      status: 200, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Edge function error:", err);
    return new Response(JSON.stringify({ error: err.message ?? "Internal error" }), {
      status: 500, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
    });
  }
});
