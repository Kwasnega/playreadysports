-- Launch fixes: check-in codes, auto-cancel, match lifecycle, platform fees

-- 1. Short manual check-in code (10 chars)
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS check_in_code text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_check_in_code
  ON public.matches (check_in_code)
  WHERE check_in_code IS NOT NULL;

-- 2. Allow turf-owner lobby participants without invalid payment_status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'payment_status' AND e.enumlabel = 'exempt'
  ) THEN
    ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'exempt';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'slot_type' AND e.enumlabel = 'turf_owner'
  ) THEN
    ALTER TYPE public.slot_type ADD VALUE IF NOT EXISTS 'turf_owner';
  END IF;
END $$;

-- 3. Auto-cancel underfilled paid matches (runs every minute via pg_cron)
CREATE OR REPLACE FUNCTION public.auto_cancel_underfilled_matches()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_minutes int := 20;
  v_min_pct numeric := 1.0;
  v_match record;
  v_cancelled int := 0;
  v_entry_fee numeric;
  v_max_core int;
  v_paid_count int;
  v_venue_name text;
  v_part record;
BEGIN
  SELECT COALESCE(NULLIF(value, '')::int, 20) INTO v_window_minutes
  FROM platform_settings WHERE key = 'auto_cancel_window_minutes';

  SELECT COALESCE(NULLIF(value, '')::numeric, 1.0) INTO v_min_pct
  FROM platform_settings WHERE key = 'auto_cancel_min_paid_pct';

  FOR v_match IN
    SELECT m.id, m.join_code, m.organizer_id, m.entry_fee, m.max_core_players, m.core_paid_count,
           COALESCE(v.name, 'the venue') AS venue_name
    FROM matches m
    LEFT JOIN venues v ON v.id = m.venue_id
    WHERE m.status IN ('upcoming', 'full')
      AND COALESCE(m.entry_fee, 0) > 0
      AND (
        -- Within cancel window before kickoff
        (m.match_date > now() AND m.match_date <= now() + (v_window_minutes || ' minutes')::interval)
        OR
        -- Kickoff passed but match never went live (not full)
        (m.match_date <= now())
      )
  LOOP
    v_max_core := GREATEST(COALESCE(v_match.max_core_players, 10), 1);
    v_paid_count := COALESCE(v_match.core_paid_count, 0);
    v_entry_fee := COALESCE(v_match.entry_fee, 0);

    IF (v_paid_count::numeric / v_max_core) >= v_min_pct THEN
      CONTINUE;
    END IF;

    v_venue_name := v_match.venue_name;

    UPDATE matches
    SET status = 'cancelled', escrow_status = 'refunded'
    WHERE id = v_match.id;

    FOR v_part IN
      SELECT id, user_id
      FROM match_participants
      WHERE match_id = v_match.id AND payment_status = 'paid'
    LOOP
      PERFORM process_wallet_transaction(
        v_part.user_id,
        v_entry_fee,
        'refund',
        'auto_cancel_refund_' || v_match.id || '_' || v_part.user_id
      );
      UPDATE match_participants
      SET payment_status = 'refunded', status = 'left'
      WHERE id = v_part.id;
    END LOOP;

    UPDATE match_participants
    SET status = 'left'
    WHERE match_id = v_match.id AND status = 'active';

    UPDATE matches SET core_paid_count = 0 WHERE id = v_match.id;

    INSERT INTO notifications (user_id, title, body, type, data)
    SELECT DISTINCT uid, 'Match auto-cancelled',
      CASE WHEN uid = v_match.organizer_id
        THEN 'Your match ' || v_match.join_code || ' at ' || v_venue_name || ' was auto-cancelled — not enough players confirmed. All fees have been refunded.'
        ELSE 'Match ' || v_match.join_code || ' at ' || v_venue_name || ' was cancelled (not enough players). Your entry fee has been refunded to your wallet.'
      END,
      'match_cancel',
      jsonb_build_object('match_id', v_match.id, 'join_code', v_match.join_code, 'auto', true)
    FROM (
      SELECT v_match.organizer_id AS uid
      UNION
      SELECT user_id FROM match_participants WHERE match_id = v_match.id
    ) u;

    v_cancelled := v_cancelled + 1;
  END LOOP;

  RETURN v_cancelled;
END;
$$;

-- 4. Transition full matches to live only when kickoff time arrives
CREATE OR REPLACE FUNCTION public.transition_match_statuses()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- full -> live only at/after kickoff
  UPDATE matches
  SET status = 'live'
  WHERE status = 'full'
    AND match_date <= now();

  -- live -> completed after duration (+ 5 min grace for organizer)
  UPDATE matches
  SET status = 'completed'
  WHERE status = 'live'
    AND (match_date + ((COALESCE(duration_minutes, 60) + 5) || ' minutes')::interval) <= now();
END;
$$;

-- 5. Fix capacity trigger: never go live unless full; auto-complete after duration
CREATE OR REPLACE FUNCTION public.check_match_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match_id uuid;
  v_paid_count int;
  v_max_core int;
  v_current_status public.match_status;
BEGIN
  v_match_id := NEW.match_id;

  SELECT status, max_core_players
  INTO v_current_status, v_max_core
  FROM matches
  WHERE id = v_match_id
  FOR UPDATE;

  IF v_current_status IN ('completed', 'cancelled') THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)::int INTO v_paid_count
  FROM match_participants
  WHERE match_id = v_match_id
    AND status = 'active'
    AND payment_status = 'paid'
    AND slot_type = 'core';

  IF v_current_status = 'upcoming'
     AND v_max_core IS NOT NULL
     AND v_paid_count >= v_max_core
  THEN
    UPDATE matches SET status = 'full' WHERE id = v_match_id;
    v_current_status := 'full';
  END IF;

  IF v_current_status = 'full' AND EXISTS (
    SELECT 1 FROM matches WHERE id = v_match_id AND match_date <= now()
  ) THEN
    UPDATE matches SET status = 'live' WHERE id = v_match_id AND status = 'full';
  END IF;

  IF v_current_status = 'live' THEN
    UPDATE matches
    SET status = 'completed'
    WHERE id = v_match_id
      AND (match_date + ((COALESCE(duration_minutes, 60) + 5) || ' minutes')::interval) <= now();
  END IF;

  RETURN NEW;
END;
$$;

-- 6. Schedule cron jobs (pg_cron)
DO $$
DECLARE
  extension_exists boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') INTO extension_exists;
  IF NOT extension_exists THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_cron;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'pg_cron not available';
      RETURN;
    END;
  END IF;

  BEGIN PERFORM cron.unschedule('auto-cancel-underfilled'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('transition-match-statuses'); EXCEPTION WHEN OTHERS THEN NULL; END;

  PERFORM cron.schedule('auto-cancel-underfilled', '* * * * *', 'SELECT public.auto_cancel_underfilled_matches()');
  PERFORM cron.schedule('transition-match-statuses', '* * * * *', 'SELECT public.transition_match_statuses()');
END $$;

-- 7. Default auto-cancel to require 100% fill
INSERT INTO platform_settings (key, value, description)
VALUES ('auto_cancel_min_paid_pct', '1.0', 'Minimum fraction of core slots paid to avoid auto-cancel (1.0 = 100%)')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
