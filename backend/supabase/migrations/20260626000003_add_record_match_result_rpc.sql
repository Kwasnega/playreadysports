-- Migration: Add record_match_result RPC function
-- Fixes issue: Failed to record result when organizer tries to update match winning_team directly

CREATE OR REPLACE FUNCTION public.record_match_result(
  p_match_id     uuid,
  p_winning_team text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
  v_participant RECORD;
  v_tx_result jsonb;
BEGIN
  -- Select and lock match
  SELECT id, organizer_id, status, winning_team, entry_fee, title
  INTO v_match
  FROM public.matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'match_not_found');
  END IF;

  -- Only organizer or admin can record
  IF v_match.organizer_id != auth.uid() AND NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (role IN ('admin', 'super_admin') OR is_admin = true)
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  -- Only allow if match is completed
  IF v_match.status != 'completed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'match_not_completed');
  END IF;

  IF v_match.winning_team IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'result_already_recorded');
  END IF;

  -- Update winning team
  UPDATE public.matches
  SET winning_team = p_winning_team,
      result_submitted_at = now()
  WHERE id = p_match_id;

  -- Award prizes (since complete_match_atomic skipped it because winning_team was null)
  IF p_winning_team IS NOT NULL AND p_winning_team != 'draw' AND COALESCE(v_match.entry_fee, 0) > 0 THEN
    FOR v_participant IN
      SELECT user_id FROM public.match_participants
      WHERE match_id = p_match_id
        AND status = 'active'
        AND team = p_winning_team
    LOOP
      SELECT public.process_wallet_transaction(
        v_participant.user_id,
        v_match.entry_fee,
        'prize_won',
        'Match prize — ' || v_match.title,
        p_match_id,
        'Prize for winning team'
      ) INTO v_tx_result;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_match_result(uuid, text) TO authenticated, service_role;
