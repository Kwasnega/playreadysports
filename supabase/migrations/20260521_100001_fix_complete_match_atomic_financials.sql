-- ============================================================
-- Migration: Fix complete_match_atomic financial logic
-- Date: 2026-05-21
-- Purpose:
--   1. Add new wallet_transaction_type enum values (venue_cut, organizer_profit)
--   2. Add organizer_profit_amount to matches table
--   3. Update process_wallet_transaction to support match_id + description
--   4. Rewrite complete_match_atomic with correct business-model payouts:
--        - venue owner gets total_collected minus commission minus organizer profit
--        - organizer gets their declared profit amount
--        - platform commission is recorded in platform_revenue
--        - free matches: no financial transactions
-- ============================================================

-- ------------------------------------------------------------
-- 1. Add new enum values for wallet transaction types
-- ------------------------------------------------------------
ALTER TYPE public.wallet_transaction_type ADD VALUE IF NOT EXISTS 'venue_cut';
ALTER TYPE public.wallet_transaction_type ADD VALUE IF NOT EXISTS 'organizer_profit';

-- ------------------------------------------------------------
-- 2. Add organizer_profit_amount to matches table
-- ------------------------------------------------------------
ALTER TABLE public.matches
ADD COLUMN IF NOT EXISTS organizer_profit_amount numeric(10,2) NOT NULL DEFAULT 0;

-- ------------------------------------------------------------
-- 3. Update process_wallet_transaction to support match_id and description
--    Drop old signatures first to avoid overloading ambiguity.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.process_wallet_transaction(uuid, numeric, public.wallet_transaction_type, text);
DROP FUNCTION IF EXISTS public.process_wallet_transaction(uuid, numeric, text, text);

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
  -- Guard: ensure audit table exists before moving money
  IF NOT EXISTS (
    SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'wallet_transactions'
  ) THEN
    RAISE EXCEPTION 'wallet_transactions table missing';
  END IF;

  -- Validate and cast type (raise on invalid — no silent swallow)
  v_type_enum := p_type::public.wallet_transaction_type;

  SELECT wallet_balance INTO v_current
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found for user %', p_user_id;
  END IF;

  IF p_amount < 0 AND (v_current + p_amount) < 0 THEN
    RAISE EXCEPTION 'Insufficient wallet balance for user %', p_user_id;
  END IF;

  UPDATE public.profiles
  SET wallet_balance = wallet_balance + p_amount
  WHERE id = p_user_id;

  v_new_balance := v_current + p_amount;

  -- Log to wallet_transactions
  BEGIN
    INSERT INTO public.wallet_transactions (
      user_id, amount, type, status, reference, match_id, description, balance_after
    ) VALUES (
      p_user_id, p_amount, v_type_enum, 'completed', p_reference, p_match_id, p_description, v_new_balance
    );
  EXCEPTION WHEN undefined_table THEN
    RAISE EXCEPTION 'wallet_transactions table does not exist. Run migrations first.';
  END;

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_wallet_transaction(uuid, numeric, text, text, uuid, text)
  TO authenticated, service_role;

-- ------------------------------------------------------------
-- 4. Rewrite complete_match_atomic with correct financial logic
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

  -- Get winner (organizer override or team with most active players)
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

  -- ============================================
  -- PAID MATCH: Distribute collected funds
  -- ============================================
  IF v_total_collected > 0 THEN
    -- Get commission rate (default 5% if missing)
    v_commission_rate := get_commission_rate();
    IF v_commission_rate IS NULL THEN
      v_commission_rate := 0.05;
    END IF;

    -- STEP 1: Calculate amounts
    v_commission := v_total_collected * v_commission_rate;
    v_organizer_profit := COALESCE(v_match.organizer_profit_amount, 0);
    v_venue_owner_payment := v_total_collected - v_commission - v_organizer_profit;

    -- Safety floor: venue owner payment cannot go negative
    IF v_venue_owner_payment < 0 THEN
      v_venue_owner_payment := 0;
    END IF;

    -- STEP 2: Fetch venue owner id
    SELECT owner_id INTO v_venue_owner_id
    FROM public.venues
    WHERE id = v_match.venue_id;

    -- STEP 3: Credit the venue owner
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

    -- STEP 4: Credit the organizer their profit (only if > 0)
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

    -- STEP 5: Record platform commission
    INSERT INTO public.platform_revenue (match_id, amount, commission_rate, created_at)
    VALUES (p_match_id, v_commission, v_commission_rate, NOW());
  END IF;

  -- Free match (entry_fee = 0): total_collected = 0, no financial transactions needed.

  -- Organizer completion bonus (legacy loyalty bonus)
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
    'total_collected', v_total_collected,
    'commission', v_commission,
    'organizer_profit', v_organizer_profit,
    'venue_owner_payment', v_venue_owner_payment,
    'winner', v_winner_team,
    'paid_participants', v_core_paid
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_match_atomic(uuid, uuid)
  TO authenticated, service_role;
