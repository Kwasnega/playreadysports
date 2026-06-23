// filepath: backend/supabase/functions/test-helpers/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { getCorsHeaders } from "../_shared/cors.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_ANON_KEY") || ""
);

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
);

interface TestRequest {
  action: string;
  matchId?: string;
  count?: number;
  percentage?: number;
  userId?: string;
  amount?: number;
  [key: string]: any;
}

interface TestResponse {
  success: boolean;
  message?: string;
  data?: any;
  error?: string;
}

// Get or create test account
async function getTestAccount(role: "player" | "organizer" | "turf_owner", name: string) {
  const email = `test_${role}_${Date.now()}_${Math.random().toString(36).slice(2)}@playready.test`;
  const password = "TestPass123!";

  try {
    const { data, error: signUpError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      user_metadata: { full_name: name, role },
    });

    if (signUpError || !data.user) {
      return { error: signUpError?.message || "Failed to create user" };
    }

    // Create profile
    await supabaseAdmin
      .from("profiles")
      .insert({
        id: data.user.id,
        full_name: name,
        username: `test_${role}_${Math.random().toString(36).slice(2, 7)}`,
        role: role === "turf_owner" ? "owner" : role,
        is_admin: false,
      });

    // Ensure wallet
    await supabaseAdmin
      .from("wallet_balances")
      .upsert({ user_id: data.user.id, balance: 0, updated_at: new Date() });

    return { userId: data.user.id, email, password };
  } catch (err: any) {
    return { error: err.message };
  }
}

// Bulk fill match with test players
async function fillMatch(matchId: string, playerCount: number) {
  try {
    const { data: match, error: matchErr } = await supabaseAdmin
      .from("matches")
      .select("*")
      .eq("id", matchId)
      .single();

    if (matchErr || !match) return { error: "Match not found" };

    const entryFee = match.entry_fee || 0;
    const results = {
      joined: 0,
      failed: 0,
      errors: [] as string[],
      totalSpent: 0,
    };

    for (let i = 0; i < playerCount; i++) {
      try {
        // Create test player
        const testPlayer = await getTestAccount("player", `Test Player ${i + 1}`);
        if (testPlayer.error) {
          results.failed++;
          results.errors.push(testPlayer.error);
          continue;
        }

        const playerId = testPlayer.userId!;

        // Top up wallet if needed
        if (entryFee > 0) {
          await supabaseAdmin
            .from("wallet_balances")
            .update({ balance: entryFee + 100 })
            .eq("user_id", playerId);
        }

        // Randomly assign to team
        const team = Math.random() > 0.5 ? "reds" : "blues";

        // Join match
        const { error: joinErr } = await supabaseAdmin.rpc("join_match_with_wallet", {
          p_match_id: matchId,
          p_user_id: playerId,
          p_team: team,
          p_slot_type: "core",
        });

        if (joinErr) {
          results.failed++;
          results.errors.push(`Player ${i + 1}: ${joinErr.message}`);
        } else {
          results.joined++;
          results.totalSpent += entryFee;
        }
      } catch (err: any) {
        results.failed++;
        results.errors.push(`Player ${i + 1}: ${err.message}`);
      }
    }

    return results;
  } catch (err: any) {
    return { error: err.message };
  }
}

// Auto-assign lineup
async function autoAssignLineup(matchId: string) {
  try {
    const positions = [
      "goalkeeper",
      "defender",
      "defender",
      "midfielder",
      "midfielder",
      "forward",
    ];

    // Get players by team
    const { data: participants, error: fetchErr } = await supabaseAdmin
      .from("match_participants")
      .select("*")
      .eq("match_id", matchId)
      .eq("status", "active");

    if (fetchErr || !participants) return { error: "Failed to fetch participants" };

    const reds = participants.filter((p) => p.team === "reds");
    const blues = participants.filter((p) => p.team === "blues");

    let assigned = 0;

    // Assign to reds
    for (let i = 0; i < Math.min(reds.length, positions.length); i++) {
      const { error } = await supabaseAdmin
        .from("lineups")
        .upsert({
          match_id: matchId,
          player_id: reds[i].user_id,
          team: "reds",
          position: positions[i % positions.length],
        });
      if (!error) assigned++;
    }

    // Assign to blues
    for (let i = 0; i < Math.min(blues.length, positions.length); i++) {
      const { error } = await supabaseAdmin
        .from("lineups")
        .upsert({
          match_id: matchId,
          player_id: blues[i].user_id,
          team: "blues",
          position: positions[i % positions.length],
        });
      if (!error) assigned++;
    }

    return { assigned };
  } catch (err: any) {
    return { error: err.message };
  }
}

// Simulate check-ins
async function simulateCheckins(matchId: string, percentage: number) {
  try {
    const { data: participants, error: fetchErr } = await supabaseAdmin
      .from("match_participants")
      .select("*")
      .eq("match_id", matchId)
      .eq("status", "active");

    if (fetchErr || !participants) return { error: "Failed to fetch participants" };

    const countToCheckin = Math.ceil((participants.length * percentage) / 100);
    let checkedIn = 0;

    for (let i = 0; i < countToCheckin; i++) {
      const { error } = await supabaseAdmin
        .from("match_participants")
        .update({
          attendance_scanned: true,
          scanned_at: new Date(),
        })
        .eq("id", participants[i].id);

      if (!error) checkedIn++;
    }

    return { checkedIn, total: participants.length };
  } catch (err: any) {
    return { error: err.message };
  }
}

// Force match completion
async function forceCompleteMatch(matchId: string) {
  try {
    const { data: match, error: matchErr } = await supabaseAdmin
      .from("matches")
      .select("*")
      .eq("id", matchId)
      .single();

    if (matchErr || !match) return { error: "Match not found" };

    // Update match status to completed
    const { error: updateErr } = await supabaseAdmin
      .from("matches")
      .update({
        status: "completed",
        completed_at: new Date(),
      })
      .eq("id", matchId);

    if (updateErr) return { error: updateErr.message };

    // Get all participants
    const { data: participants, error: fetchErr } = await supabaseAdmin
      .from("match_participants")
      .select("*")
      .eq("match_id", matchId)
      .eq("status", "active");

    if (fetchErr || !participants) return { error: "Failed to fetch participants" };

    // Award wins/losses randomly
    let updated = 0;
    for (const participant of participants) {
      const won = Math.random() > 0.5;
      const { error } = await supabaseAdmin
        .from("profiles")
        .update({
          total_wins: won ? (participant.total_wins || 0) + 1 : participant.total_wins,
          total_losses: !won ? (participant.total_losses || 0) + 1 : participant.total_losses,
        })
        .eq("id", participant.user_id);

      if (!error) updated++;
    }

    // Payout to organizer
    const totalCollected = (match.entry_fee || 0) * participants.length;
    const platformFee = totalCollected * 0.05;
    const organizerShare = totalCollected - platformFee;

    const { error: payoutErr } = await supabaseAdmin
      .from("wallet_balances")
      .update({ balance: organizerShare })
      .eq("user_id", match.organizer_id);

    return {
      completed: true,
      participantsUpdated: updated,
      totalCollected,
      platformFee,
      organizerShare,
    };
  } catch (err: any) {
    return { error: err.message };
  }
}

// Force match cancellation with refunds
async function forceCancelMatch(matchId: string) {
  try {
    const { data: match, error: matchErr } = await supabaseAdmin
      .from("matches")
      .select("*")
      .eq("id", matchId)
      .single();

    if (matchErr || !match) return { error: "Match not found" };

    // Update match status
    const { error: updateErr } = await supabaseAdmin
      .from("matches")
      .update({
        status: "cancelled",
        cancelled_at: new Date(),
      })
      .eq("id", matchId);

    if (updateErr) return { error: updateErr.message };

    // Refund all participants
    const { data: participants, error: fetchErr } = await supabaseAdmin
      .from("match_participants")
      .select("*")
      .eq("match_id", matchId)
      .eq("payment_status", "paid");

    if (fetchErr) return { error: "Failed to fetch participants" };

    let refunded = 0;
    const refundAmount = match.entry_fee || 0;

    for (const participant of participants || []) {
      const { error: refundErr } = await supabaseAdmin
        .from("wallet_balances")
        .update({
          balance: (await supabaseAdmin
            .from("wallet_balances")
            .select("balance")
            .eq("user_id", participant.user_id)
            .single()
            .then((r) => r.data?.balance || 0)) + refundAmount,
        })
        .eq("user_id", participant.user_id);

      if (!refundErr) refunded++;
    }

    return { cancelled: true, refunded, totalRefunded: refunded * refundAmount };
  } catch (err: any) {
    return { error: err.message };
  }
}

// Bulk top-up wallets
async function bulkTopupWallets(amount: number) {
  try {
    // Get all test accounts (created in last hour)
    const { data: testProfiles, error: fetchErr } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .like("username", "test_%");

    if (fetchErr) return { error: "Failed to fetch test accounts" };

    let toppedup = 0;
    for (const profile of testProfiles || []) {
      const { error } = await supabaseAdmin
        .from("wallet_balances")
        .update({ balance: amount })
        .eq("user_id", profile.id);

      if (!error) toppedup++;
    }

    return { toppedup, amount };
  } catch (err: any) {
    return { error: err.message };
  }
}

// Get match breakdown
async function getMatchBreakdown(matchId: string) {
  try {
    const { data: match, error: matchErr } = await supabaseAdmin
      .from("matches")
      .select("*, organizer:profiles(*), venue:venues(*)")
      .eq("id", matchId)
      .single();

    if (matchErr || !match) return { error: "Match not found" };

    const { data: participants, error: fetchErr } = await supabaseAdmin
      .from("match_participants")
      .select("*, profile:profiles(*)")
      .eq("match_id", matchId);

    if (fetchErr) return { error: "Failed to fetch participants" };

    const totalCollected = (match.entry_fee || 0) * (participants?.length || 0);
    const platformFee = totalCollected * 0.05;
    const venueShare = totalCollected * 0.5;
    const organizerShare = totalCollected - platformFee - venueShare;

    return {
      matchId,
      title: match.title,
      status: match.status,
      participantCount: participants?.length || 0,
      checkedIn: participants?.filter((p: any) => p.attendance_scanned).length || 0,
      totalCollected,
      platformFee,
      venueShare,
      organizerShare,
      organizer: match.organizer?.full_name,
      venue: match.venue?.name,
      entryFee: match.entry_fee,
    };
  } catch (err: any) {
    return { error: err.message };
  }
}

Deno.serve(async (req) => {
  const requestOrigin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(requestOrigin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { action, ...params } = (await req.json()) as TestRequest;

    let result: TestResponse = { success: false, error: "Unknown action" };

    switch (action) {
      case "fill-match":
        result = { success: true, data: await fillMatch(params.matchId, params.count || 10) };
        break;
      case "auto-lineup":
        result = { success: true, data: await autoAssignLineup(params.matchId) };
        break;
      case "simulate-checkins":
        result = { success: true, data: await simulateCheckins(params.matchId, params.percentage || 100) };
        break;
      case "force-complete":
        result = { success: true, data: await forceCompleteMatch(params.matchId) };
        break;
      case "force-cancel":
        result = { success: true, data: await forceCancelMatch(params.matchId) };
        break;
      case "bulk-topup":
        result = { success: true, data: await bulkTopupWallets(params.amount || 500) };
        break;
      case "match-breakdown":
        result = { success: true, data: await getMatchBreakdown(params.matchId) };
        break;
      default:
        result = { success: false, error: `Unknown action: ${action}` };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
