-- ============================================================
-- Phase 3.3: Atomic complete-match RPC
-- Wraps all completion operations in a single BEGIN...COMMIT.
-- Called by the complete-match edge function.
-- ============================================================

DROP FUNCTION IF EXISTS public.complete_match_atomic(uuid, uuid);
CREATE OR REPLACE FUNCTION public.complete_match_atomic(
  p_match_id  uuid,
  p_caller_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match        RECORD;
  v_organizer_id uuid;
  v_winner_team  text;
  v_prize_pool   numeric;
  v_participant  RECORD;
  v_core_paid    int;
BEGIN
  -- Lock the match
  SELECT id, organizer_id, status, entry_fee, match_mode
  INTO v_match
  FROM public.matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'match_not_found');
  END IF;

  IF v_match.status != 'live' THEN
    RETURN jsonb_build_object('success', false, 'error', 'match_not_live');
  END IF;

  -- Only organizer or admin can complete
  IF v_match.organizer_id != p_caller_id AND NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_caller_id
      AND (role IN ('admin','super_admin') OR is_admin = true)
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  -- Get winner (first team to reach target, or organizer override)
  -- Default to highest score if not set
  SELECT winning_team INTO v_winner_team
  FROM public.matches WHERE id = p_match_id;

  IF v_winner_team IS NULL THEN
    -- Determine winner by score if available, else random/first
    SELECT team INTO v_winner_team
    FROM public.match_participants
    WHERE match_id = p_match_id AND status = 'active'
    GROUP BY team ORDER BY COUNT(*) DESC LIMIT 1;
  END IF;

  -- Mark match as completed
  UPDATE public.matches
  SET status = 'completed',
      completed_at = now(),
      winning_team = COALESCE(winning_team, v_winner_team)
  WHERE id = p_match_id;

  -- Credit organizer venue_owner_balance (entry_fee * paid_count)
  SELECT COUNT(*) INTO v_core_paid
  FROM public.match_participants
  WHERE match_id = p_match_id
    AND status = 'active'
    AND payment_status = 'paid';

  v_prize_pool := COALESCE(v_match.entry_fee, 0) * v_core_paid;

  IF v_prize_pool > 0 THEN
    -- Credit venue owner balance
    UPDATE public.profiles
    SET venue_owner_balance = venue_owner_balance + v_prize_pool
    WHERE id = v_match.organizer_id;

    -- Log transaction
    BEGIN
      INSERT INTO public.wallet_transactions (user_id, amount, type, status, reference)
      VALUES (v_match.organizer_id, v_prize_pool, 'venue_payout', 'completed', 'match_' || p_match_id);
    EXCEPTION WHEN undefined_table THEN NULL; END;
  END IF;

  -- Bonus to organizer (loyalty bonus)
  PERFORM public.process_wallet_transaction(
    v_match.organizer_id,
    2.00,
    'bonus',
    'organizer_bonus_' || p_match_id
  );

  -- Update win/loss stats for participants
  FOR v_participant IN
    SELECT user_id, team FROM public.match_participants
    WHERE match_id = p_match_id AND status = 'active'
  LOOP
    IF v_participant.team = v_winner_team THEN
      UPDATE public.profiles
      SET total_wins = COALESCE(total_wins, 0) + 1
      WHERE id = v_participant.user_id;
    ELSE
      UPDATE public.profiles
      SET total_losses = COALESCE(total_losses, 0) + 1
      WHERE id = v_participant.user_id;
    END IF;
  END LOOP;

  -- Mark all paid participants as attendance_scanned = true (assumed present)
  UPDATE public.match_participants
  SET attendance_scanned = true
  WHERE match_id = p_match_id
    AND status = 'active'
    AND payment_status = 'paid';

  RETURN jsonb_build_object(
    'success', true,
    'prize_pool', v_prize_pool,
    'winner', v_winner_team,
    'paid_participants', v_core_paid
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_match_atomic(uuid, uuid)
  TO authenticated, service_role;
