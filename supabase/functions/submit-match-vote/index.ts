import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders();
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. JWT / Authentication check
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Parse request body
    const body = await req.json();
    const { match_id, nominee_id, vote_category, raw_score } = body;

    // Presence validation
    if (!match_id || !nominee_id || !vote_category || raw_score === undefined) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // raw_score validation (integer 1-5 inclusive)
    if (!Number.isInteger(raw_score) || raw_score < 1 || raw_score > 5) {
      return new Response(JSON.stringify({ error: "Score must be 1–5" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // vote_category validation
    if (vote_category !== "king_of_match" && vote_category !== "second_king_of_match") {
      return new Response(JSON.stringify({ error: "Invalid vote category" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // voter_id != nominee_id validation
    if (user.id === nominee_id) {
      return new Response(JSON.stringify({ error: "You cannot vote for yourself" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create Service Role Client for database queries and updates
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const svc = createClient(supabaseUrl, serviceKey);

    // 3. Database validations

    // Validate voter is participant in match_id (status = 'active')
    const { data: voterParticipant, error: voterErr } = await svc
      .from("match_participants")
      .select("status")
      .eq("match_id", match_id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!voterParticipant) {
      return new Response(JSON.stringify({ error: "You were not in this match" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate nominee is participant in the same match (status = 'active')
    const { data: nomineeParticipant, error: nomineeErr } = await svc
      .from("match_participants")
      .select("status")
      .eq("match_id", match_id)
      .eq("user_id", nominee_id)
      .eq("status", "active")
      .maybeSingle();

    if (!nomineeParticipant) {
      return new Response(JSON.stringify({ error: "Invalid nominee" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate voting window is open
    const { data: window, error: windowErr } = await svc
      .from("match_voting_windows")
      .select("voting_opens_at, voting_closes_at")
      .eq("match_id", match_id)
      .maybeSingle();

    const now = new Date();
    if (!window || now < new Date(window.voting_opens_at) || now > new Date(window.voting_closes_at)) {
      return new Response(JSON.stringify({ error: "Voting is closed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate voter hasn't already voted in this category for this match
    const { data: existingVote, error: existingVoteErr } = await svc
      .from("match_votes")
      .select("id")
      .eq("match_id", match_id)
      .eq("voter_id", user.id)
      .eq("vote_category", vote_category)
      .maybeSingle();

    if (existingVote) {
      return new Response(JSON.stringify({ error: "You already submitted a vote for this category" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Retrieve voter's credibility score
    const { data: credibilityData, error: credibilityErr } = await svc
      .from("player_credibility_scores")
      .select("credibility_score")
      .eq("player_id", user.id)
      .maybeSingle();

    const credibility_score = credibilityData?.credibility_score ?? 50.0;

    // 5. Insert vote row using service role client
    const { data: insertedVote, error: insertErr } = await svc
      .from("match_votes")
      .insert({
        match_id,
        voter_id: user.id,
        nominee_id,
        vote_category,
        raw_score,
        voter_credibility_at_time_of_vote: credibility_score,
      })
      .select("weighted_score")
      .single();

    if (insertErr) {
      return new Response(JSON.stringify({ error: insertErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        weighted_score: insertedVote.weighted_score,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (err: any) {
    console.error("Submit vote edge function error:", err);
    return new Response(JSON.stringify({ error: err.message ?? "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
