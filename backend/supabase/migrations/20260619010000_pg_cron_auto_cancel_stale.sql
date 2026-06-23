-- ============================================================
-- pg_cron auto-cancel-stale-matches job
-- ============================================================
-- Automatically cancels matches that have passed their scheduled
-- time but are still marked as 'upcoming'
-- Run every 5 minutes
-- ============================================================

-- Step 1: Create function to handle auto-cancellation
CREATE OR REPLACE FUNCTION public.auto_cancel_stale_matches()
RETURNS void AS $$
BEGIN
  -- Update stale matches to cancelled
  UPDATE public.matches 
  SET 
    status = 'cancelled'::match_status,
    intelligent_status = 'cancelled'::intelligent_match_status,
    escrow_status = 'refunded'::escrow_status,
    cancelled_reason = 'auto_cancelled_stale',
    status_last_updated_at = NOW()
  WHERE status IN ('upcoming', 'full')
    AND match_date < NOW()
    AND intelligent_status NOT IN ('cancelled', 'ended', 'archived');

  -- Record in history
  INSERT INTO public.match_status_history (
    match_id, old_status, new_status, triggered_by, reason, metadata
  )
  SELECT m.id, 'upcoming', 'cancelled', 'system',
    'Auto-cancelled: match passed scheduled time',
    jsonb_build_object('auto_cancelled_at', NOW())
  FROM public.matches m
  WHERE m.status = 'cancelled'
    AND m.match_date < NOW()
    AND m.cancelled_reason = 'auto_cancelled_stale'
    AND m.status_last_updated_at > NOW() - INTERVAL '1 minute'
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Schedule the function
DO $$
DECLARE
  extension_exists boolean;
BEGIN
  -- Check if pg_cron extension is available
  SELECT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) INTO extension_exists;

  IF NOT extension_exists THEN
    RAISE NOTICE 'pg_cron extension not installed. Enable it in Supabase Dashboard → Database → Extensions → pg_cron';
    RETURN;
  END IF;

  -- Unschedule first to avoid duplicates
  BEGIN
    PERFORM cron.unschedule('auto-cancel-stale-matches');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Schedule the function to run every 5 minutes
  PERFORM cron.schedule(
    'auto-cancel-stale-matches',
    '*/5 * * * *',
    'SELECT public.auto_cancel_stale_matches();'
  );

  RAISE NOTICE 'Scheduled auto-cancel-stale-matches job every 5 minutes';
END $$;
