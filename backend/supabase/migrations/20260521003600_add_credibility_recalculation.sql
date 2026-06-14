-- ============================================================
-- CREDIBILITY SCORE RECALCULATION
-- Migration to add recalculate_credibility function and resolution trigger.
-- ============================================================

-- Function to recalculate a player's credibility score.
CREATE OR REPLACE FUNCTION public.recalculate_credibility(player_uuid UUID)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eligible int;
  v_voted int;
  v_participation_rate numeric;
  v_bias_penalty numeric := 0.0;
  v_final_score numeric;
  
  -- Variables for bias checking
  v_kom_total int;
  v_kom_max_nominee_votes int;
  v_skom_total int;
  v_skom_max_nominee_votes int;
  v_kom_ratio numeric := 0.0;
  v_skom_ratio numeric := 0.0;
  v_max_ratio numeric := 0.0;
BEGIN
  -- 1. Ensure credibility scores row exists and fetch stats
  INSERT INTO public.player_credibility_scores (player_id)
  VALUES (player_uuid)
  ON CONFLICT (player_id) DO NOTHING;

  SELECT total_matches_eligible, total_matches_voted, participation_rate
  INTO v_eligible, v_voted, v_participation_rate
  FROM public.player_credibility_scores
  WHERE player_id = player_uuid;

  -- 2. Bootstrap check: fewer than 3 eligible matches => default score 50
  IF v_eligible < 3 THEN
    UPDATE public.player_credibility_scores
    SET credibility_score = 50.0,
        bias_penalty = 0.0,
        updated_at = now()
    WHERE player_id = player_uuid;
    RETURN 50.0;
  END IF;

  -- 3. Calculate Bias Penalty
  -- Category: king_of_match (kom)
  WITH last_votes AS (
    SELECT nominee_id
    FROM public.match_votes
    WHERE voter_id = player_uuid
      AND vote_category = 'king_of_match'
    ORDER BY created_at DESC
    LIMIT 10
  ),
  counts AS (
    SELECT nominee_id, count(*)::integer as nominee_vote_count,
           (SELECT count(*)::integer FROM last_votes) as total_votes
    FROM last_votes
    GROUP BY nominee_id
  )
  SELECT nominee_vote_count, total_votes
  INTO v_kom_max_nominee_votes, v_kom_total
  FROM counts
  ORDER BY nominee_vote_count DESC
  LIMIT 1;

  IF v_kom_total > 0 AND v_kom_max_nominee_votes IS NOT NULL THEN
    v_kom_ratio := v_kom_max_nominee_votes::numeric / v_kom_total::numeric;
  END IF;

  -- Category: second_king_of_match (skom)
  WITH last_votes AS (
    SELECT nominee_id
    FROM public.match_votes
    WHERE voter_id = player_uuid
      AND vote_category = 'second_king_of_match'
    ORDER BY created_at DESC
    LIMIT 10
  ),
  counts AS (
    SELECT nominee_id, count(*)::integer as nominee_vote_count,
           (SELECT count(*)::integer FROM last_votes) as total_votes
    FROM last_votes
    GROUP BY nominee_id
  )
  SELECT nominee_vote_count, total_votes
  INTO v_skom_max_nominee_votes, v_skom_total
  FROM counts
  ORDER BY nominee_vote_count DESC
  LIMIT 1;

  IF v_skom_total > 0 AND v_skom_max_nominee_votes IS NOT NULL THEN
    v_skom_ratio := v_skom_max_nominee_votes::numeric / v_skom_total::numeric;
  END IF;

  -- Get the maximum bias ratio across both categories
  v_max_ratio := GREATEST(v_kom_ratio, v_skom_ratio);

  -- Determine Bias Penalty based on max ratio:
  -- 60–70% (0.60 to 0.70) same nominee -> -10 points
  -- 70–85% (0.70 to 0.85) same nominee -> -20 points
  -- 85–100% (0.85 to 1.00) same nominee -> -35 points
  IF v_max_ratio >= 0.85 THEN
    v_bias_penalty := 35.0;
  ELSIF v_max_ratio >= 0.70 THEN
    v_bias_penalty := 20.0;
  ELSIF v_max_ratio >= 0.60 THEN
    v_bias_penalty := 10.0;
  ELSE
    v_bias_penalty := 0.0;
  END IF;

  -- 4. Calculate Final Formula: credibility_score = GREATEST(0, participation_rate - bias_penalty)
  v_final_score := GREATEST(0.0, v_participation_rate - v_bias_penalty);

  -- 5. Update record
  UPDATE public.player_credibility_scores
  SET credibility_score = v_final_score,
      bias_penalty = v_bias_penalty,
      updated_at = now()
  WHERE player_id = player_uuid;

  RETURN v_final_score;
END;
$$;

-- Trigger function: handle voting resolved
CREATE OR REPLACE FUNCTION public.handle_voting_resolved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participant RECORD;
BEGIN
  IF NEW.is_resolved = true AND (OLD.is_resolved IS DISTINCT FROM true) THEN
    -- Recalculate credibility for all active participants
    FOR v_participant IN
      SELECT user_id
      FROM public.match_participants
      WHERE match_id = NEW.match_id AND status = 'active'
    LOOP
      PERFORM public.recalculate_credibility(v_participant.user_id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger on match_voting_windows
DROP TRIGGER IF EXISTS trg_voting_resolved_credibility ON public.match_voting_windows;
CREATE TRIGGER trg_voting_resolved_credibility
  AFTER UPDATE ON public.match_voting_windows
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_voting_resolved();

-- Grant execute on recalculate function
GRANT EXECUTE ON FUNCTION public.recalculate_credibility(UUID) TO authenticated, service_role;
