-- Normalize display team labels before casting to the team_side enum.
-- Older match rows can store labels like "Team A" / "Team B" in
-- matches.team_color_a/b, while match_participants.team expects
-- public.team_side ('reds', 'blues', 'unassigned').

CREATE OR REPLACE FUNCTION public.normalize_team_side(p_team TEXT)
RETURNS public.team_side
LANGUAGE plpgsql
IMMUTABLE
AS $normalize_team_side$
DECLARE
    v_team TEXT := lower(regexp_replace(trim(coalesce(p_team, '')), '[\s-]+', '_', 'g'));
BEGIN
    IF v_team IN ('reds', 'red', 'team_a', 'a') THEN
        RETURN 'reds'::public.team_side;
    ELSIF v_team IN ('blues', 'blue', 'team_b', 'b') THEN
        RETURN 'blues'::public.team_side;
    END IF;

    RETURN 'unassigned'::public.team_side;
END;
$normalize_team_side$;

CREATE OR REPLACE FUNCTION public.rebalance_match_teams(p_match_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $rebalance_match_teams$
BEGIN
    WITH ordered_players AS (
        SELECT
            id,
            row_number() OVER (ORDER BY joined_at ASC NULLS LAST, id ASC) AS rn
        FROM public.match_participants
        WHERE match_id = p_match_id
          AND slot_type = 'core'
          AND status = 'active'
    )
    UPDATE public.match_participants mp
    SET team = CASE
        WHEN ordered_players.rn % 2 = 1 THEN 'reds'::public.team_side
        ELSE 'blues'::public.team_side
    END
    FROM ordered_players
    WHERE mp.id = ordered_players.id;
END;
$rebalance_match_teams$;

CREATE OR REPLACE FUNCTION public.join_match_with_wallet(
    p_match_id UUID,
    p_user_id  UUID,
    p_team     TEXT,
    p_slot_type TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $join_match_with_wallet$
DECLARE
    v_match_fee       NUMERIC;
    v_max_core        INTEGER;
    v_current_core    INTEGER;
    v_balance         NUMERIC;
    v_participant_id  UUID;
    v_tx_ref          TEXT;
    v_new_paid_count  INTEGER;
    v_team            public.team_side;
BEGIN
    v_team := public.normalize_team_side(p_team);

    -- 1. Lock and read match
    SELECT entry_fee, COALESCE(max_core_players, players_per_side, 10)
    INTO v_match_fee, v_max_core
    FROM public.matches
    WHERE id = p_match_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'match_not_found');
    END IF;

    -- 2. Check capacity
    SELECT COUNT(*) INTO v_current_core
    FROM public.match_participants
    WHERE match_id = p_match_id
      AND slot_type = 'core'
      AND status   = 'active';

    IF v_current_core >= v_max_core THEN
        RETURN json_build_object('success', false, 'error', 'match_full');
    END IF;

    -- 3. Deduct from wallet if paid match
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
        SET balance    = balance - v_match_fee,
            updated_at = now()
        WHERE user_id = p_user_id;

        v_tx_ref := 'join_' || p_match_id || '_' || extract(epoch from now());
        INSERT INTO public.wallet_transactions (user_id, amount, type, reference, match_id)
        VALUES (p_user_id, -v_match_fee, 'spend', v_tx_ref, p_match_id);
    END IF;

    -- 4. Insert participant - 'paid' for both free and paid matches
    INSERT INTO public.match_participants (
        match_id, user_id, team, slot_type, payment_status, status
    ) VALUES (
        p_match_id,
        p_user_id,
        v_team,
        p_slot_type::public.slot_type,
        'paid'::public.payment_status,
        'active'::public.participant_status
    ) RETURNING id INTO v_participant_id;

    PERFORM public.rebalance_match_teams(p_match_id);

    -- 5. Increment paid count for paid core slots and check if match is now full
    IF p_slot_type = 'core' AND v_match_fee > 0 THEN
        UPDATE public.matches
        SET core_paid_count = core_paid_count + 1
        WHERE id = p_match_id
        RETURNING core_paid_count INTO v_new_paid_count;

        IF v_new_paid_count >= v_max_core THEN
            UPDATE public.matches
            SET status = 'full'
            WHERE id = p_match_id
              AND status NOT IN ('completed', 'cancelled', 'full');
        END IF;
    END IF;

    RETURN json_build_object('success', true, 'participant_id', v_participant_id);
END;
$join_match_with_wallet$;

CREATE OR REPLACE FUNCTION public.process_paid_join(
  p_match_id uuid,
  p_user_id uuid,
  p_team text,
  p_payment_reference text,
  p_amount decimal,
  p_slot_type text DEFAULT 'core'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $process_paid_join$
DECLARE
  v_count int;
  v_max int;
  v_status text;
  v_participant_id uuid;
  v_existing_status text;
  v_team public.team_side;
BEGIN
  v_team := public.normalize_team_side(p_team);

  SELECT max_core_players, status, core_paid_count
  INTO v_max, v_status, v_count
  FROM public.matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'match_not_found');
  END IF;

  IF v_status != 'upcoming' THEN
    RETURN jsonb_build_object('success', false, 'error', 'match_not_upcoming');
  END IF;

  IF v_count >= v_max AND p_slot_type = 'core' THEN
    RETURN jsonb_build_object('success', false, 'error', 'match_full');
  END IF;

  SELECT status INTO v_existing_status
  FROM public.transactions
  WHERE payment_reference = p_payment_reference
  LIMIT 1;

  IF v_existing_status = 'completed' THEN
    RETURN jsonb_build_object('success', true, 'already_processed', true);
  END IF;

  INSERT INTO public.match_participants (
    match_id, user_id, team, slot_type, payment_status, payment_reference, status
  )
  VALUES (
    p_match_id,
    p_user_id,
    v_team,
    p_slot_type::public.slot_type,
    'paid'::public.payment_status,
    p_payment_reference,
    'active'::public.participant_status
  )
  ON CONFLICT (match_id, user_id)
  DO UPDATE SET
    payment_status = 'paid'::public.payment_status,
    payment_reference = p_payment_reference,
    status = 'active'::public.participant_status,
    team = v_team
  RETURNING id INTO v_participant_id;

  PERFORM public.rebalance_match_teams(p_match_id);

  IF v_existing_status = 'pending' THEN
    UPDATE public.transactions
    SET status = 'completed', amount = p_amount, updated_at = now()
    WHERE payment_reference = p_payment_reference;
  ELSE
    INSERT INTO public.transactions (
      match_id, user_id, amount, type, status, payment_reference
    )
    VALUES (
      p_match_id, p_user_id, p_amount, 'entry_fee', 'completed', p_payment_reference
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'participant_id', v_participant_id);
END;
$process_paid_join$;

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
    v_exists INTEGER;
    v_participant_id UUID;
    v_new_paid_count INTEGER;
    v_team public.team_side;
BEGIN
    v_team := public.normalize_team_side(p_team);

    SELECT COALESCE(max_core_players, players_per_side, 10)
    INTO v_max_core
    FROM public.matches
    WHERE id = p_match_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Match not found');
    END IF;

    SELECT COUNT(*) INTO v_exists
    FROM public.match_participants
    WHERE match_id = p_match_id AND user_id = p_user_id AND status = 'active';

    IF v_exists > 0 THEN
        RETURN json_build_object('success', false, 'error', 'Already joined');
    END IF;

    SELECT COUNT(*) INTO v_current_core
    FROM public.match_participants
    WHERE match_id = p_match_id AND status = 'active' AND slot_type = 'core';

    IF v_current_core >= v_max_core THEN
        RETURN json_build_object('success', false, 'error', 'Match is full');
    END IF;

    INSERT INTO public.match_participants (
        match_id, user_id, team, slot_type, payment_status, status
    ) VALUES (
        p_match_id,
        p_user_id,
        v_team,
        'core'::public.slot_type,
        'paid'::public.payment_status,
        'active'::public.participant_status
    )
    RETURNING id INTO v_participant_id;

    PERFORM public.rebalance_match_teams(p_match_id);

    UPDATE public.matches
    SET core_paid_count = LEAST(COALESCE(core_paid_count, 0) + 1, v_max_core)
    WHERE id = p_match_id
    RETURNING core_paid_count INTO v_new_paid_count;

    IF v_new_paid_count >= v_max_core THEN
        UPDATE public.matches
        SET status = 'full'
        WHERE id = p_match_id
          AND status NOT IN ('completed', 'cancelled', 'full');
    END IF;

    RETURN json_build_object('success', true, 'participant_id', v_participant_id);
END;
$process_free_join$;

CREATE OR REPLACE FUNCTION public.initialize_match_lineup(
  p_match_id UUID,
  p_team_side TEXT,
  p_rows JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $initialize_match_lineup$
DECLARE
  v_row JSONB;
  v_lineup_id UUID;
  v_inserted INTEGER := 0;
BEGIN
  IF p_team_side NOT IN ('team_a', 'team_b') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_team_side');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.matches m
    WHERE m.id = p_match_id
      AND m.organizer_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'organizer_required');
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb))
  LOOP
    INSERT INTO public.match_lineups (
      match_id,
      team_side,
      player_id,
      assigned_position,
      x_position,
      y_position,
      formation,
      is_starting_player,
      jersey_number,
      updated_by,
      updated_at
    )
    VALUES (
      p_match_id,
      p_team_side,
      (v_row->>'player_id')::uuid,
      COALESCE(v_row->>'assigned_position', 'CM'),
      NULLIF(v_row->>'x_position', '')::int,
      NULLIF(v_row->>'y_position', '')::int,
      COALESCE(v_row->>'formation', '5-side'),
      COALESCE((v_row->>'is_starting_player')::boolean, true),
      NULLIF(v_row->>'jersey_number', '')::int,
      auth.uid(),
      now()
    )
    ON CONFLICT (match_id, team_side, player_id)
    DO UPDATE SET
      assigned_position = EXCLUDED.assigned_position,
      x_position = EXCLUDED.x_position,
      y_position = EXCLUDED.y_position,
      formation = EXCLUDED.formation,
      is_starting_player = EXCLUDED.is_starting_player,
      jersey_number = EXCLUDED.jersey_number,
      updated_by = auth.uid(),
      updated_at = now()
    RETURNING id INTO v_lineup_id;

    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'count', v_inserted);
END;
$initialize_match_lineup$;

GRANT EXECUTE ON FUNCTION public.normalize_team_side(TEXT)
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.rebalance_match_teams(UUID)
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.join_match_with_wallet(UUID, UUID, TEXT, TEXT)
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.process_paid_join(uuid, uuid, text, text, decimal, text)
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.process_free_join(UUID, UUID, TEXT)
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.initialize_match_lineup(UUID, TEXT, JSONB)
  TO authenticated, service_role;

DO $rebalance_existing_matches$
DECLARE
  v_match RECORD;
BEGIN
  FOR v_match IN
    SELECT DISTINCT match_id
    FROM public.match_participants
    WHERE slot_type = 'core'
      AND status = 'active'
  LOOP
    PERFORM public.rebalance_match_teams(v_match.match_id);
  END LOOP;
END;
$rebalance_existing_matches$;
