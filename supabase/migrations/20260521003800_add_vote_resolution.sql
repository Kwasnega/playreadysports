-- ============================================================
-- VOTE RESOLUTION AND LEADERBOARD POINTS
-- Migration to support vote calculations, tie breakers, and cron scheduling.
-- ============================================================

-- 1. Helper function: Get the winner for a specific category
CREATE OR REPLACE FUNCTION public.get_match_vote_winner(p_match_id UUID, p_category public.vote_category)
RETURNS TABLE (
  winner_id UUID,
  weighted_average numeric,
  total_votes bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_divisor numeric;
BEGIN
  -- Get the total number of unique voters who cast a vote in this category for this match
  SELECT COUNT(DISTINCT voter_id)::numeric INTO v_divisor
  FROM public.match_votes
  WHERE match_id = p_match_id AND vote_category = p_category;

  IF v_divisor IS NULL OR v_divisor = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    nominee_id,
    (SUM(weighted_score) / v_divisor)::numeric as weighted_average,
    COUNT(nominee_id)::bigint as total_votes
  FROM public.match_votes
  WHERE match_id = p_match_id AND vote_category = p_category
  GROUP BY nominee_id
  ORDER BY (SUM(weighted_score) / v_divisor) DESC, COUNT(nominee_id) DESC, random()
  LIMIT 1;
END;
$$;

-- 2. Main function: Resolve votes for a single match atomically
CREATE OR REPLACE FUNCTION public.resolve_match_votes_atomic(p_match_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window public.match_voting_windows%ROWTYPE;
  v_kom_winner UUID;
  v_kom_avg numeric;
  v_kom_votes bigint;
  v_skom_winner UUID;
  v_skom_avg numeric;
  v_skom_votes bigint;
BEGIN
  -- Fetch and lock the voting window row
  SELECT * INTO v_window
  FROM public.match_voting_windows
  WHERE match_id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Voting window not found');
  END IF;

  IF v_window.is_resolved THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match already resolved');
  END IF;

  IF v_window.voting_closes_at > now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Voting window is still open');
  END IF;

  -- Resolve King of the Match ('king_of_match')
  SELECT winner_id, weighted_average, total_votes
  INTO v_kom_winner, v_kom_avg, v_kom_votes
  FROM public.get_match_vote_winner(p_match_id, 'king_of_match');

  IF v_kom_winner IS NOT NULL THEN
    -- Insert result
    INSERT INTO public.match_vote_results (match_id, winner_id, category, final_weighted_average)
    VALUES (p_match_id, v_kom_winner, 'king_of_match', v_kom_avg)
    ON CONFLICT (match_id, category) DO NOTHING;

    -- Award points
    UPDATE public.profiles
    SET reputation_score = COALESCE(reputation_score, 0.0) + 5.0
    WHERE id = v_kom_winner;
  END IF;

  -- Resolve Second King of the Match ('second_king_of_match')
  SELECT winner_id, weighted_average, total_votes
  INTO v_skom_winner, v_skom_avg, v_skom_votes
  FROM public.get_match_vote_winner(p_match_id, 'second_king_of_match');

  IF v_skom_winner IS NOT NULL THEN
    -- Insert result
    INSERT INTO public.match_vote_results (match_id, winner_id, category, final_weighted_average)
    VALUES (p_match_id, v_skom_winner, 'second_king_of_match', v_skom_avg)
    ON CONFLICT (match_id, category) DO NOTHING;

    -- Award points
    UPDATE public.profiles
    SET reputation_score = COALESCE(reputation_score, 0.0) + 3.0
    WHERE id = v_skom_winner;
  END IF;

  -- Mark window as resolved
  UPDATE public.match_voting_windows
  SET is_resolved = true,
      resolved_at = now()
  WHERE match_id = p_match_id;

  RETURN jsonb_build_object(
    'success', true,
    'king_of_match', CASE WHEN v_kom_winner IS NOT NULL THEN jsonb_build_object('winner_id', v_kom_winner, 'weighted_average', v_kom_avg, 'total_votes', v_kom_votes) ELSE NULL END,
    'second_king_of_match', CASE WHEN v_skom_winner IS NOT NULL THEN jsonb_build_object('winner_id', v_skom_winner, 'weighted_average', v_skom_avg, 'total_votes', v_skom_votes) ELSE NULL END
  );
END;
$$;

-- 3. Cron helper function: Resolve all expired, unresolved windows
CREATE OR REPLACE FUNCTION public.resolve_all_expired_voting_windows()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
  v_res jsonb;
  v_resolved_count int := 0;
  v_results jsonb := jsonb_build_array();
BEGIN
  FOR v_match IN
    SELECT match_id
    FROM public.match_voting_windows
    WHERE is_resolved = false AND voting_closes_at < now()
  LOOP
    v_res := public.resolve_match_votes_atomic(v_match.match_id);
    IF (v_res->>'success')::boolean THEN
      v_resolved_count := v_resolved_count + 1;
      v_results := v_results || jsonb_build_object('match_id', v_match.match_id, 'result', v_res);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('resolved_count', v_resolved_count, 'results', v_results);
END;
$$;

-- 4. Register pg_cron job to trigger the Edge Function every 5 minutes
DO $$
DECLARE
  extension_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) INTO extension_exists;

  IF NOT extension_exists THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_cron;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'pg_cron not available. Enable it in Supabase Dashboard → Database → Extensions → pg_cron.';
      RETURN;
    END;
  END IF;

  -- Unschedule previous version if it exists
  BEGIN
    PERFORM cron.unschedule('resolve-match-votes');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Schedule resolve-match-votes to run every 5 minutes
  PERFORM cron.schedule(
    'resolve-match-votes',
    '*/5 * * * *',
    $cron$
      SELECT net.http_post(
        url := current_setting('app.supabase_url', true) || '/functions/v1/resolve-match-votes',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.service_role_key', true),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      )
    $cron$
  );

  RAISE NOTICE 'pg_cron job resolve-match-votes scheduled successfully (every 5 minutes).';
END $$;
