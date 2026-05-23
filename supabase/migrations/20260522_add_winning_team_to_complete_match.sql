-- ============================================================
-- Add winning_team parameter to complete_match_atomic
-- Date: 2026-05-22
-- Purpose:
--   Allow organizer to explicitly declare the winning team
--   when submitting a match result from the UI.
-- ============================================================

CREATE OR REPLACE FUNCTION public.complete_match_atomic(
  p_match_id      uuid,
  p_caller_id     uuid,
  p_winning_team  text DEFAULT NULL
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

  -- Use organizer-provided winner if given; otherwise fall back to DB value or team with most players
  IF p_winning_team IS NOT NULL THEN
    v_winner_team := p_winning_team;
  ELSE
    SELECT winning_team INTO v_winner_team
    FROM public.matches WHERE id = p_match_id;

    IF v_winner_team IS NULL THEN
      SELECT team INTO v_winner_team
      FROM public.match_participants
      WHERE match_id = p_match_id AND status = 'active'
      GROUP BY team ORDER BY COUNT(*) DESC LIMIT 1;
    END IF;
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
        'venue-cut-' || p_match_id,
        p_match_id,
        'Venue share for completed match'
      ) INTO v_tx_result;
    END IF;

    -- STEP 4: Record platform commission
    IF v_commission > 0 THEN
      INSERT INTO public.platform_revenue (
        match_id, amount, type, description
      ) VALUES (
        p_match_id, v_commission, 'commission',
        'Platform commission on match completion'
      );
    END IF;

    -- STEP 5: Credit organizer profit
    IF v_match.organizer_id IS NOT NULL AND v_organizer_profit > 0 THEN
      SELECT public.process_wallet_transaction(
        v_match.organizer_id,
        v_organizer_profit,
        'organizer_profit',
        'Organizer profit — ' || v_match.title,
        'organizer-profit-' || p_match_id,
        p_match_id,
        'Organizer declared profit for completed match'
      ) INTO v_tx_result;
    END IF;

    -- STEP 6: Award prizes (best-effort: skip if no winner)
    IF v_winner_team IS NOT NULL THEN
      FOR v_participant IN
        SELECT user_id, team
        FROM public.match_participants
        WHERE match_id = p_match_id
          AND status = 'active'
          AND team = v_winner_team
      LOOP
        SELECT public.process_wallet_transaction(
          v_participant.user_id,
          v_match.entry_fee,
          'prize_won',
          'Match prize — ' || v_match.title,
          'prize-' || p_match_id || '-' || v_participant.user_id,
          p_match_id,
          'Prize for winning team'
        ) INTO v_tx_result;
      END LOOP;
    END IF;

  END IF;

  -- Update participant status to completed
  UPDATE public.match_participants
  SET status = 'completed'
  WHERE match_id = p_match_id
    AND status = 'active';

  RETURN jsonb_build_object(
    'success', true,
    'match_id', p_match_id,
    'winning_team', v_winner_team,
    'total_collected', v_total_collected,
    'commission', v_commission,
    'organizer_profit', v_organizer_profit,
    'venue_owner_payment', v_venue_owner_payment,
    'venueOwnerId', v_venue_owner_id,
    'venueCut', v_venue_owner_payment
  );
END;
$$;
