import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

async function logVotePoints(svc: any, matchId: string, result: any) {
  const { data: matchRow } = await svc
    .from("matches")
    .select("title")
    .eq("id", matchId)
    .maybeSingle();
  const matchTitle = matchRow?.title ?? "Match";

  const king = result?.king_of_match;
  if (king?.winner_id) {
    await svc.from("wallet_transactions").insert({
      user_id: king.winner_id,
      amount: 5,
      type: "leaderboard_points" as any,
      reference: `King of the Match — ${matchTitle}`,
      status: "completed" as any,
    });
  }

  const second = result?.second_king_of_match;
  if (second?.winner_id) {
    await svc.from("wallet_transactions").insert({
      user_id: second.winner_id,
      amount: 3,
      type: "leaderboard_points" as any,
      reference: `2nd King of the Match — ${matchTitle}`,
      status: "completed" as any,
    });
  }
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders();
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Authorization check
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = authHeader.replace(/^bearer\s+/i, "");

    const isServiceRole = token === serviceKey;

    if (!isServiceRole) {
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const supabase = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 2. Parse request body
    const body = await req.json().catch(() => ({}));
    const { match_id } = body;

    const svc = createClient(supabaseUrl, serviceKey);

    if (match_id) {
      // Case A: Resolve specific match
      const { data, error } = await svc.rpc("resolve_match_votes_atomic", {
        p_match_id: match_id,
      });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!data.success) {
        return new Response(JSON.stringify({ error: data.error }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Log leaderboard points into wallet_transactions
      await logVotePoints(svc, match_id, data);

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      // Case B: Cron trigger to resolve all expired match voting windows
      // Reject if not service role key
      if (!isServiceRole) {
        return new Response(JSON.stringify({ error: "Forbidden: Only service role can trigger batch resolution" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data, error } = await svc.rpc("resolve_all_expired_voting_windows");

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Log points for every resolved match
      const results = data?.results ?? [];
      for (const item of results) {
        const mid = item?.match_id;
        const res = item?.result;
        if (mid && res?.success) {
          await logVotePoints(svc, mid, res);
        }
      }

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message ?? "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
