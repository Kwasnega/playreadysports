--- Phase 3.3: Atomic match completion RPC
--- Wraps all critical financial operations in a single PostgreSQL transaction.
--- Prevents partial failure (e.g., organizer credited but venue owner not credited).

CREATE OR REPLACE FUNCTION public.complete_match_atomic(
  p_match_id     UUID,
  p_caller_id    UUID,
  p_qr_bypass    BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match           RECORD;
  v_is_admin        BOOLEAN;
  v_paid_core       INTEGER;
  v_unscanned       INTEGER;
  v_kickoff         TIMESTAMPTZ;
  v_duration_ms     BIGINT;
  v_deadline        TIMESTAMPTZ;
  v_can_bypass_qr   BOOLEAN;
  v_entry_fee       NUMERIC;
  v_gross           NUMERIC;
  v_paid_count      INTEGER;
  v_default_incentive TEXT;
  v_organizer_incentive NUMERIC;
  v_commission_rate TEXT;
  v_platform_fee    NUMERIC;
  v_venue_cut       NUMERIC;
  v_venue           RECORD;
  v_venue_owner_id  UUID;
  v_result          JSONB;
BEGIN
  -- ── 1. Lock match row ─────────────────────────────────────────
  SELECT * INTO v_match
  FROM public.matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Match not found');
  END IF;

  -- ── 2. Verify caller is organizer or admin ──────────────────
  v_is_admin := EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_caller_id AND role IN ('admin', 'super_admin')
  );

  IF v_match.organizer_id <> p_caller_id AND NOT v_is_admin THEN
    RETURN jsonb_build_object('error', 'Only the organizer or admin can complete this match');
  END IF;

  -- ── 3. Check escrow not already released ─────────────────────
  IF v_match.escrow_released_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'Escrow already released for this match');
  END IF;

  -- ── 4. Check match status ─────────────────────────────────────
  IF v_match.status IN ('completed', 'cancelled') THEN
    RETURN jsonb_build_object('error', 'Match already ended');
  END IF;

  IF v_match.status NOT IN ('upcoming', 'live') THEN
    RETURN jsonb_build_object('error', 'Match must be upcoming or live before marking complete');
  END IF;

  -- ── 5. QR check-in requirement ───────────────────────────────
  v_kickoff       := v_match.match_date;
  v_duration_ms   := (COALESCE(v_match.duration_minutes, 60) * 60 * 1000);
  v_can_bypass_qr := (NOW() > (v_kickoff + (v_duration_ms || ' milliseconds')::INTERVAL + '30 minutes'::INTERVAL));

  SELECT COUNT(*) INTO v_unscanned
  FROM public.match_participants
  WHERE match_id = p_match_id
    AND status = 'active'
    AND slot_type = 'core'
    AND payment_status = 'paid'
    AND attendance_scanned = FALSE;

  IF NOT v_can_bypass_qr AND v_unscanned > 0 THEN
    RETURN jsonb_build_object(
      'error', 'Waiting for ' || v_unscanned || ' paid player(s) to scan venue QR before release',
      'waitingForQr', TRUE,
      'unscannedCount', v_unscanned
    );
  END IF;

  -- ── 6. Calculate financials ──────────────────────────────────
  v_entry_fee     := COALESCE(v_match.entry_fee, 0);
  v_paid_count    := COALESCE(v_match.core_paid_count, 0);
  v_gross         := ROUND(v_entry_fee * v_paid_count, 2);

  -- Load platform settings
  SELECT value INTO v_default_incentive
  FROM public.platform_settings WHERE key = 'organizer_incentive_amount';
  v_organizer_incentive := COALESCE(v_match.organizer_incentive_amount, v_default_incentive::NUMERIC, 5.00);
  v_organizer_incentive := LEAST(v_organizer_incentive, v_gross);

  SELECT value INTO v_commission_rate
  FROM public.platform_settings WHERE key = 'commission_rate';
  v_platform_fee := ROUND(v_gross * LEAST(1, GREATEST(0, COALESCE(v_commission_rate::NUMERIC, 0.05))), 2);
  v_venue_cut    := GREATEST(0, ROUND(v_gross - v_organizer_incentive - v_platform_fee, 2));

  -- ── 7. Resolve venue owner ───────────────────────────────────
  SELECT id, owner_id, owner_email INTO v_venue
  FROM public.venues WHERE id = v_match.venue_id;

  v_venue_owner_id := v_venue.owner_id;
  IF v_venue_owner_id IS NULL AND v_venue.owner_email IS NOT NULL THEN
    SELECT id INTO v_venue_owner_id
    FROM public.profiles
    WHERE email = TRIM(v_venue.owner_email)
    LIMIT 1;
  END IF;

  -- ── 8. Credit organizer wallet ───────────────────────────────
  IF v_organizer_incentive > 0 AND v_match.organizer_id IS NOT NULL THEN
    UPDATE public.profiles
    SET play_wallet_balance = COALESCE(play_wallet_balance, 0) + v_organizer_incentive
    WHERE id = v_match.organizer_id;

    INSERT INTO public.wallet_transactions (
      user_id, amount, type, status, reference, description
    ) VALUES (
      v_match.organizer_id,
      v_organizer_incentive,
      'bonus'::public.wallet_transaction_type,
      'completed',
      'organizer_incentive_' || p_match_id,
      'Organizer incentive for match ' || COALESCE(v_match.join_code, '')
    );
  END IF;

  -- ── 9. Credit venue owner balance ────────────────────────────
  IF v_venue_cut > 0 AND v_venue_owner_id IS NOT NULL THEN
    UPDATE public.profiles
    SET venue_owner_balance = COALESCE(venue_owner_balance, 0) + v_venue_cut
    WHERE id = v_venue_owner_id;
  END IF;

  -- ── 10. Update match status ──────────────────────────────────
  UPDATE public.matches
  SET
    status                    = 'completed',
    escrow_status             = 'released',
    escrow_released_at        = NOW(),
    organizer_incentive_amount = v_organizer_incentive
  WHERE id = p_match_id;

  -- ── 11. Insert payout transaction records ────────────────────
  IF v_organizer_incentive > 0 THEN
    INSERT INTO public.transactions (
      match_id, user_id, amount, type, status, payment_reference
    ) VALUES (
      p_match_id,
      v_match.organizer_id,
      v_organizer_incentive,
      'payout',
      'completed',
      'organizer-incentive-' || COALESCE(v_match.join_code, '') || '-' || EXTRACT(EPOCH FROM NOW())::BIGINT
    );
  END IF;

  IF v_venue_cut > 0 AND v_venue_owner_id IS NOT NULL THEN
    INSERT INTO public.transactions (
      match_id, user_id, amount, type, status, payment_reference
    ) VALUES (
      p_match_id,
      v_venue_owner_id,
      v_venue_cut,
      'payout',
      'completed',
      'venue-payout-' || COALESCE(v_match.join_code, '') || '-' || EXTRACT(EPOCH FROM NOW())::BIGINT
    );
  END IF;

  -- ── 12. Build result ─────────────────────────────────────────
  RETURN jsonb_build_object(
    'success',             TRUE,
    'gross',               v_gross,
    'organizerIncentive',  v_organizer_incentive,
    'venueCut',            v_venue_cut,
    'platformFee',         v_platform_fee,
    'venueOwnerId',        v_venue_owner_id,
    'qrBypassed',          v_can_bypass_qr AND v_unscanned > 0
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_match_atomic(UUID, UUID, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_match_atomic(UUID, UUID, BOOLEAN) TO authenticated;
