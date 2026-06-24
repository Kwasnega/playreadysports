-- ============================================================
-- Migration: 20260624000001_organizer_5match_milestone_bonus.sql
-- Fix: Organizers only receive completion bonus on every 5th completed match.
-- ============================================================

CREATE OR REPLACE FUNCTION public.complete_match_atomic(
  p_match_id     uuid,
  p_caller_id    uuid,
  p_winning_team text DEFAULT NULL
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
  v_completed_count     int;
BEGIN
  -- Lock the match row
  SELECT id, organizer_id, venue_id, status, entry_fee, match_mode,
         organizer_venue_fee, organizer_profit_amount, title
  INTO v_match
  FROM public.matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'match_not_found');
  END IF;

  -- H8: accept both 'live' (in-progress) and 'full' (at capacity, not yet started)
  IF v_match.status NOT IN ('live', 'full') THEN
    RETURN jsonb_build_object('success', false, 'error', 'match_not_live');
  END IF;

  -- Only organizer or admin can complete
  IF v_match.organizer_id != p_caller_id AND NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_caller_id
      AND (role IN ('admin', 'super_admin') OR is_admin = true)
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  -- Resolve winning team: caller override → stored value → majority vote
  v_winner_team := p_winning_team;

  IF v_winner_team IS NULL THEN
    SELECT winning_team INTO v_winner_team
    FROM public.matches WHERE id = p_match_id;
  END IF;

  IF v_winner_team IS NULL THEN
    SELECT team INTO v_winner_team
    FROM public.match_participants
    WHERE match_id = p_match_id
      AND status = 'active'
      AND team NOT IN ('unassigned', 'spectator')
      AND team IS NOT NULL
    GROUP BY team ORDER BY COUNT(*) DESC LIMIT 1;
  END IF;

  -- Mark match completed
  UPDATE public.matches
  SET status       = 'completed',
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

  -- ── Financial distribution ──────────────────────────────────
  IF v_total_collected > 0 THEN
    -- Paid match: distribute collected player fees
    v_commission_rate := get_commission_rate();
    IF v_commission_rate IS NULL THEN
      v_commission_rate := 0.05;
    END IF;

    v_commission       := v_total_collected * v_commission_rate;
    v_organizer_profit := COALESCE(v_match.organizer_profit_amount, 0);
    v_venue_owner_payment := GREATEST(0, v_total_collected - v_commission - v_organizer_profit);

    SELECT owner_id INTO v_venue_owner_id
    FROM public.venues WHERE id = v_match.venue_id;

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
    VALUES (p_match_id, v_commission, v_commission_rate, NOW())
    ON CONFLICT DO NOTHING;

  ELSIF COALESCE(v_match.organizer_venue_fee, 0) > 0 THEN
    -- Free match with prepaid venue cost: release venue fee to venue owner
    SELECT owner_id INTO v_venue_owner_id
    FROM public.venues WHERE id = v_match.venue_id;

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

  -- ── Organizer 5-Match Milestone Bonus ───────────────────────
  -- Count completed matches by this organizer (including the one just marked completed above)
  SELECT COUNT(*) INTO v_completed_count
  FROM public.matches
  WHERE organizer_id = v_match.organizer_id
    AND status = 'completed';

  IF v_completed_count > 0 AND v_completed_count % 5 = 0 THEN
    SELECT public.process_wallet_transaction(
      v_match.organizer_id,
      10.00, -- 10 GHS bonus for every 5 matches
      'bonus',
      'organizer_milestone_' || p_match_id || '_' || v_completed_count,
      p_match_id,
      '5-Match Milestone Bonus (Completed ' || v_completed_count || ' matches)'
    ) INTO v_tx_result;

    IF (v_tx_result->>'success')::boolean = false THEN
      RAISE EXCEPTION 'Organizer milestone bonus payout failed: %', v_tx_result->>'error';
    END IF;
  END IF;

  -- ── Win/Loss stats ──────────────────────────────────────────
  -- M9: skip 'unassigned', 'spectator', and NULL teams so only
  -- actual playing participants get win/loss counted.
  FOR v_participant IN
    SELECT user_id, team FROM public.match_participants
    WHERE match_id = p_match_id
      AND status   = 'active'
      AND team NOT IN ('unassigned', 'spectator')
      AND team IS NOT NULL
  LOOP
    IF v_winner_team IS NOT NULL AND v_participant.team = v_winner_team THEN
      UPDATE public.profiles
      SET total_wins = COALESCE(total_wins, 0) + 1
      WHERE id = v_participant.user_id;
    ELSIF v_winner_team IS NOT NULL THEN
      -- Only record a loss when there was a winner (not for draws)
      UPDATE public.profiles
      SET total_losses = COALESCE(total_losses, 0) + 1
      WHERE id = v_participant.user_id;
    END IF;
  END LOOP;

  -- Mark paid attendees as present (assumed attended)
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
    'venueOwnerId', v_venue_owner_id,
    'venueCut', v_venue_owner_payment,
    'winner', v_winner_team,
    'paid_participants', v_core_paid
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_match_atomic(uuid, uuid, text)
  TO authenticated, service_role;
