-- ============================================================
-- Match Status Auto-Transition Trigger + Cron
-- Date: 2026-05-21
-- Purpose:
--   1. Add 'full' to match_status enum
--   2. Create trigger: auto-set status 'upcoming' -> 'full' when
--      active paid core participants reach max_core_players
--   3. Create trigger: auto-set status 'full' -> 'live' when
--      match_date has passed
--   4. pg_cron job to periodically transition full->live
-- ============================================================

-- ------------------------------------------------------------
-- 1. Add 'full' to match_status enum (safe, no existing rows affected)
-- ------------------------------------------------------------
ALTER TYPE public.match_status ADD VALUE IF NOT EXISTS 'full';

-- ------------------------------------------------------------
-- 2. Trigger function: check capacity on participant changes
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_match_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match_id      uuid;
  v_paid_count    int;
  v_max_core      int;
  v_current_status public.match_status;
BEGIN
  -- Only react when participant becomes active or paid
  v_match_id := NEW.match_id;

  -- Lock the match row to prevent race conditions
  SELECT status, max_core_players
  INTO v_current_status, v_max_core
  FROM public.matches
  WHERE id = v_match_id
  FOR UPDATE;

  -- If already completed or cancelled, nothing to do
  IF v_current_status IN ('completed', 'cancelled') THEN
    RETURN NEW;
  END IF;

  -- Count active paid CORE participants
  SELECT COUNT(*)::int INTO v_paid_count
  FROM public.match_participants
  WHERE match_id = v_match_id
    AND status = 'active'
    AND payment_status = 'paid'
    AND slot_type = 'core';

  -- Transition: upcoming -> full when capacity reached
  IF v_current_status = 'upcoming'
     AND v_max_core IS NOT NULL
     AND v_paid_count >= v_max_core
  THEN
    UPDATE public.matches
    SET status = 'full'
    WHERE id = v_match_id;

    -- Also update current status variable for next check
    v_current_status := 'full';
  END IF;

  -- Transition: full -> live when start time has passed
  IF v_current_status = 'full' THEN
    UPDATE public.matches
    SET status = 'live'
    WHERE id = v_match_id
      AND match_date <= now();
  END IF;

  -- Transition: live -> completed when match has ended (match_date + duration)
  IF v_current_status = 'live' THEN
    UPDATE public.matches
    SET status = 'completed'
    WHERE id = v_match_id
      AND (match_date + (duration_minutes || ' minutes')::interval) <= now();
  END IF;

  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- 3. Attach trigger to match_participants
--    Fires when a participant becomes active or their payment is recorded
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_check_match_capacity ON public.match_participants;
CREATE TRIGGER trg_check_match_capacity
  AFTER INSERT OR UPDATE ON public.match_participants
  FOR EACH ROW
  WHEN (NEW.status = 'active' OR NEW.payment_status = 'paid')
  EXECUTE FUNCTION public.check_match_capacity();

-- ------------------------------------------------------------
-- 4. Cron job: transition full -> live for matches whose start time passed
--    ( catches matches that filled while no participant trigger fired,
--      e.g. organizer manually marking participants paid )
-- ------------------------------------------------------------
DO $$
DECLARE
  extension_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) INTO extension_exists;

  IF NOT extension_exists THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_cron;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'pg_cron not available. Enable it in Supabase Dashboard → Database → Extensions → pg_cron.';
      RETURN;
    END;
  END IF;

  -- Unschedule previous version if any
  BEGIN
    PERFORM cron.unschedule('transition-full-to-live');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  PERFORM cron.schedule(
    'transition-match-status',
    '*/5 * * * *',
    $cron$
      -- full -> live when start time passed
      UPDATE public.matches
      SET status = 'live'
      WHERE status = 'full'
        AND match_date <= now();

      -- live -> completed when match has ended
      UPDATE public.matches
      SET status = 'completed'
      WHERE status = 'live'
        AND (match_date + (duration_minutes || ' minutes')::interval) <= now();
    $cron$
  );

  RAISE NOTICE 'pg_cron job transition-match-status scheduled successfully (every 5 minutes).';
END $$;
