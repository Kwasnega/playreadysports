-- Launch fix: keep capacity, substitutes, and escrow state in sync.

CREATE OR REPLACE FUNCTION public.sync_match_capacity(p_match_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $sync_match_capacity$
DECLARE
  v_paid_core INTEGER;
  v_max_core INTEGER;
  v_entry_fee NUMERIC;
  v_status public.match_status;
  v_next_status public.match_status;
  v_next_escrow public.escrow_status;
BEGIN
  SELECT
    COALESCE(max_core_players, players_per_side, 10),
    COALESCE(entry_fee, 0),
    status
  INTO v_max_core, v_entry_fee, v_status
  FROM public.matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'match_not_found');
  END IF;

  SELECT COUNT(*)::int INTO v_paid_core
  FROM public.match_participants
  WHERE match_id = p_match_id
    AND status = 'active'
    AND slot_type = 'core'
    AND payment_status = 'paid';

  IF v_status IN ('completed', 'cancelled') THEN
    UPDATE public.matches
    SET core_paid_count = LEAST(v_paid_core, v_max_core)
    WHERE id = p_match_id;
  ELSE
    v_next_status := CASE WHEN v_paid_core >= v_max_core THEN 'full' ELSE 'upcoming' END;
    v_next_escrow := CASE
      WHEN v_entry_fee > 0 AND v_paid_core >= v_max_core THEN 'holding'
      WHEN v_entry_fee > 0 THEN 'none'
      ELSE 'none'
    END;

    UPDATE public.matches
    SET core_paid_count = LEAST(v_paid_core, v_max_core),
        status = v_next_status,
        escrow_status = v_next_escrow
    WHERE id = p_match_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'paid_core_count', LEAST(v_paid_core, v_max_core),
    'max_core', v_max_core
  );
END;
$sync_match_capacity$;

CREATE OR REPLACE FUNCTION public.join_match_with_wallet(
  p_match_id UUID,
  p_user_id UUID,
  p_team TEXT,
  p_slot_type TEXT DEFAULT 'core'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $join_match_with_wallet$
DECLARE
  v_match_fee NUMERIC;
  v_max_core INTEGER;
  v_current_core INTEGER;
  v_balance NUMERIC;
  v_participant_id UUID;
  v_tx_ref TEXT;
  v_team public.team_side;
  v_waitlist_position INTEGER;
  v_requested_slot public.slot_type;
BEGIN
  v_team := public.normalize_team_side(p_team);
  v_requested_slot := COALESCE(NULLIF(p_slot_type, ''), 'core')::public.slot_type;

  SELECT entry_fee, COALESCE(max_core_players, players_per_side, 10)
  INTO v_match_fee, v_max_core
  FROM public.matches
  WHERE id = p_match_id
    AND status NOT IN ('completed', 'cancelled')
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'match_not_found');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.match_participants
    WHERE match_id = p_match_id
      AND user_id = p_user_id
      AND status IN ('active', 'waitlist')
  ) THEN
    RETURN json_build_object('success', false, 'error', 'already_joined');
  END IF;

  SELECT COUNT(*) INTO v_current_core
  FROM public.match_participants
  WHERE match_id = p_match_id
    AND slot_type = 'core'
    AND status = 'active';

  IF v_current_core >= v_max_core OR v_requested_slot = 'spare' THEN
    SELECT COALESCE(MAX(waitlist_position), 0) + 1
    INTO v_waitlist_position
    FROM public.match_participants
    WHERE match_id = p_match_id
      AND status = 'waitlist';

    INSERT INTO public.match_participants (
      match_id, user_id, team, slot_type, payment_status, status, waitlist_position
    ) VALUES (
      p_match_id, p_user_id, 'unassigned', 'spare', 'unpaid', 'waitlist', v_waitlist_position
    )
    RETURNING id INTO v_participant_id;

    RETURN json_build_object(
      'success', true,
      'waitlisted', true,
      'position', v_waitlist_position,
      'participant_id', v_participant_id
    );
  END IF;

  IF v_match_fee > 0 THEN
    SELECT balance INTO v_balance
    FROM public.wallet_balances
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'wallet_not_found');
    END IF;

    IF v_balance < v_match_fee THEN
      RETURN json_build_object('success', false, 'error', 'insufficient_balance');
    END IF;

    UPDATE public.wallet_balances
    SET balance = balance - v_match_fee,
        updated_at = now()
    WHERE user_id = p_user_id;

    v_tx_ref := 'join_' || p_match_id || '_' || extract(epoch from now());
    INSERT INTO public.wallet_transactions (user_id, amount, type, reference, match_id, description)
    VALUES (p_user_id, -v_match_fee, 'spend', v_tx_ref, p_match_id, 'Match entry fee');
  END IF;

  INSERT INTO public.match_participants (
    match_id, user_id, team, slot_type, payment_status, status
  ) VALUES (
    p_match_id, p_user_id, v_team, 'core', 'paid', 'active'
  )
  RETURNING id INTO v_participant_id;

  PERFORM public.rebalance_match_teams(p_match_id);
  PERFORM public.sync_match_capacity(p_match_id);

  RETURN json_build_object('success', true, 'participant_id', v_participant_id);
END;
$join_match_with_wallet$;

CREATE OR REPLACE FUNCTION public.process_free_join(
  p_match_id UUID,
  p_user_id UUID,
  p_team TEXT DEFAULT 'unassigned'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $process_free_join$
DECLARE
  v_max_core INTEGER;
  v_current_core INTEGER;
  v_participant_id UUID;
  v_team public.team_side;
  v_waitlist_position INTEGER;
BEGIN
  v_team := public.normalize_team_side(p_team);

  SELECT COALESCE(max_core_players, players_per_side, 10)
  INTO v_max_core
  FROM public.matches
  WHERE id = p_match_id
    AND status NOT IN ('completed', 'cancelled')
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Match not found');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.match_participants
    WHERE match_id = p_match_id
      AND user_id = p_user_id
      AND status IN ('active', 'waitlist')
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Already joined');
  END IF;

  SELECT COUNT(*) INTO v_current_core
  FROM public.match_participants
  WHERE match_id = p_match_id
    AND status = 'active'
    AND slot_type = 'core';

  IF v_current_core >= v_max_core THEN
    SELECT COALESCE(MAX(waitlist_position), 0) + 1
    INTO v_waitlist_position
    FROM public.match_participants
    WHERE match_id = p_match_id
      AND status = 'waitlist';

    INSERT INTO public.match_participants (
      match_id, user_id, team, slot_type, payment_status, status, waitlist_position
    ) VALUES (
      p_match_id, p_user_id, 'unassigned', 'spare', 'unpaid', 'waitlist', v_waitlist_position
    )
    RETURNING id INTO v_participant_id;

    RETURN json_build_object(
      'success', true,
      'waitlisted', true,
      'position', v_waitlist_position,
      'participant_id', v_participant_id
    );
  END IF;

  INSERT INTO public.match_participants (
    match_id, user_id, team, slot_type, payment_status, status
  ) VALUES (
    p_match_id, p_user_id, v_team, 'core', 'paid', 'active'
  )
  RETURNING id INTO v_participant_id;

  PERFORM public.rebalance_match_teams(p_match_id);
  PERFORM public.sync_match_capacity(p_match_id);

  RETURN json_build_object('success', true, 'participant_id', v_participant_id);
END;
$process_free_join$;

GRANT EXECUTE ON FUNCTION public.sync_match_capacity(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.join_match_with_wallet(UUID, UUID, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_free_join(UUID, UUID, TEXT) TO authenticated, service_role;
