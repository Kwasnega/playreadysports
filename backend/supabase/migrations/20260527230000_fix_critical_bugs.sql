-- ============================================================
-- Migration: Fix Critical Database Bugs (C1, C2, C3)
-- ============================================================

-- ------------------------------------------------------------
-- C1. Unify Wallet Balance System (use wallet_balances table)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.process_wallet_transaction(
  p_user_id     uuid,
  p_amount      numeric,
  p_type        text,
  p_reference   text DEFAULT NULL,
  p_match_id    uuid DEFAULT NULL,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current       numeric;
  v_type_enum     public.wallet_transaction_type;
  v_new_balance   numeric;
BEGIN
  -- Guard: ensure wallet_transactions table exists before moving money
  IF NOT EXISTS (
    SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'wallet_transactions'
  ) THEN
    RAISE EXCEPTION 'wallet_transactions table missing';
  END IF;

  -- Validate and cast type
  v_type_enum := p_type::public.wallet_transaction_type;

  -- Read and Lock wallet balance
  SELECT balance INTO v_current
  FROM public.wallet_balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- If no wallet balance row exists, create one on the fly
  IF NOT FOUND THEN
    INSERT INTO public.wallet_balances (user_id, balance)
    VALUES (p_user_id, 0.00)
    ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
    RETURNING balance INTO v_current;
  END IF;

  IF p_amount < 0 AND (v_current + p_amount) < 0 THEN
    RAISE EXCEPTION 'Insufficient wallet balance';
  END IF;

  -- Update wallet balance table
  UPDATE public.wallet_balances
  SET balance = balance + p_amount,
      updated_at = now()
  WHERE user_id = p_user_id;

  v_new_balance := v_current + p_amount;

  -- Log to wallet_transactions
  INSERT INTO public.wallet_transactions (
    user_id, amount, type, status, reference, match_id, description, balance_after
  ) VALUES (
    p_user_id, p_amount, v_type_enum, 'completed', p_reference, p_match_id, p_description, v_new_balance
  );

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$;


-- ------------------------------------------------------------
-- C2. Fix Free Match Venue Fees Distribution
-- ------------------------------------------------------------

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
  v_match               RECORD;
  v_winner_team         text;
  v_participant         RECORD;
  v_core_paid           int;
  v_total_collected     numeric := 0;
  v_commission          numeric := 0;
  v_commission_rate     numeric;
  v_organizer_profit    numeric := 0;
  v_venue_owner_payment numeric := 0;
  v_venue_owner_id      uuid;
  v_tx_result           jsonb;
BEGIN
  -- Lock the match
  SELECT id, organizer_id, venue_id, status, entry_fee, match_mode,
         organizer_venue_fee, organizer_profit_amount, title
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

  -- Get winner
  SELECT winning_team INTO v_winner_team
  FROM public.matches WHERE id = p_match_id;

  IF v_winner_team IS NULL THEN
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

  -- Count paid core participants
  SELECT COUNT(*) INTO v_core_paid
  FROM public.match_participants
  WHERE match_id = p_match_id
    AND status = 'active'
    AND payment_status = 'paid';

  v_total_collected := COALESCE(v_match.entry_fee, 0) * v_core_paid;

  -- Payout logic based on match cost type
  IF v_total_collected > 0 THEN
    -- 1. Paid match: distribute collected player fees
    v_commission_rate := get_commission_rate();
    IF v_commission_rate IS NULL THEN
      v_commission_rate := 0.05;
    END IF;

    v_commission := v_total_collected * v_commission_rate;
    v_organizer_profit := COALESCE(v_match.organizer_profit_amount, 0);
    v_venue_owner_payment := v_total_collected - v_commission - v_organizer_profit;

    IF v_venue_owner_payment < 0 THEN
      v_venue_owner_payment := 0;
    END IF;

    SELECT owner_id INTO v_venue_owner_id
    FROM public.venues
    WHERE id = v_match.venue_id;

    IF v_venue_owner_id IS NOT NULL AND v_venue_owner_payment > 0 THEN
      SELECT public.process_wallet_transaction(
        v_venue_owner_id,
        v_venue_owner_payment,
        'venue_cut',
        'Turf earnings — ' || v_match.title,
        p_match_id,
        'Venue owner earnings for match: ' || v_match.title
      ) INTO v_tx_result;

      IF (v_tx_result->>'success')::boolean = false THEN
        RAISE EXCEPTION 'Venue owner payout failed: %', v_tx_result->>'error';
      END IF;
    END IF;

    IF v_organizer_profit > 0 THEN
      SELECT public.process_wallet_transaction(
        v_match.organizer_id,
        v_organizer_profit,
        'organizer_profit',
        'Organizer earnings — ' || v_match.title,
        p_match_id,
        'Organizer profit for match: ' || v_match.title
      ) INTO v_tx_result;

      IF (v_tx_result->>'success')::boolean = false THEN
        RAISE EXCEPTION 'Organizer profit payout failed: %', v_tx_result->>'error';
      END IF;
    END IF;

    INSERT INTO public.platform_revenue (match_id, amount, commission_rate, created_at)
    VALUES (p_match_id, v_commission, v_commission_rate, NOW());

  ELSIF COALESCE(v_match.organizer_venue_fee, 0) > 0 THEN
    -- 2. Free match with prepaid venue cost: distribute upfront fee to venue owner
    SELECT owner_id INTO v_venue_owner_id
    FROM public.venues
    WHERE id = v_match.venue_id;

    IF v_venue_owner_id IS NOT NULL THEN
      v_venue_owner_payment := v_match.organizer_venue_fee;

      SELECT public.process_wallet_transaction(
        v_venue_owner_id,
        v_venue_owner_payment,
        'venue_cut',
        'Turf earnings (Free Match) — ' || v_match.title,
        p_match_id,
        'Venue owner earnings for free match: ' || v_match.title
      ) INTO v_tx_result;

      IF (v_tx_result->>'success')::boolean = false THEN
        RAISE EXCEPTION 'Venue owner free match payout failed: %', v_tx_result->>'error';
      END IF;
    END IF;
  END IF;

  -- Organizer completion bonus
  SELECT public.process_wallet_transaction(
    v_match.organizer_id,
    2.00,
    'bonus',
    'organizer_bonus_' || p_match_id,
    p_match_id,
    'Organizer completion bonus'
  ) INTO v_tx_result;

  IF (v_tx_result->>'success')::boolean = false THEN
    RAISE EXCEPTION 'Organizer bonus payout failed: %', v_tx_result->>'error';
  END IF;

  -- Update win/loss stats
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

  -- Scan attendance
  UPDATE public.match_participants
  SET attendance_scanned = true
  WHERE match_id = p_match_id
    AND status = 'active'
    AND payment_status = 'paid';

  RETURN jsonb_build_object(
    'success', true,
    'total_collected', v_total_collected,
    'commission', v_commission,
    'organizer_profit', v_organizer_profit,
    'venue_owner_payment', v_venue_owner_payment,
    'winner', v_winner_team,
    'paid_participants', v_core_paid
  );
END;
$$;


-- ------------------------------------------------------------
-- C3. Match Capacity Guard Trigger (serialize core spots checks)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_match_capacity()
RETURNS trigger AS $$
DECLARE
  v_max_core int;
  v_current_core int;
BEGIN
  -- Validate active core participant slots
  IF NEW.status = 'active' AND NEW.slot_type = 'core' THEN
    -- Lock the match row to serialize concurrent joins on this match
    SELECT COALESCE(max_core_players, 10)
    INTO v_max_core
    FROM public.matches
    WHERE id = NEW.match_id
    FOR UPDATE;

    -- Count active core participants
    SELECT COUNT(*) INTO v_current_core
    FROM public.match_participants
    WHERE match_id = NEW.match_id
      AND status = 'active'
      AND slot_type = 'core'
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

    IF v_current_core >= v_max_core THEN
      RAISE EXCEPTION 'Match core slots are full';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_match_capacity ON public.match_participants;
CREATE TRIGGER trg_check_match_capacity
  BEFORE INSERT OR UPDATE ON public.match_participants
  FOR EACH ROW EXECUTE FUNCTION public.check_match_capacity();
