-- ============================================================
-- Alternative vote-resolution cron (direct SQL, no Edge Function)
-- This is a more reliable fallback that doesn't require
-- app.supabase_url / app.service_role_key settings.
-- It directly calls resolve_all_expired_voting_windows() in SQL.
-- ============================================================

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

  -- Unschedule any previous direct-cron version
  BEGIN
    PERFORM cron.unschedule('resolve-votes-direct');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Schedule direct SQL resolution every 5 minutes
  PERFORM cron.schedule(
    'resolve-votes-direct',
    '*/5 * * * *',
    $cron$
      SELECT public.resolve_all_expired_voting_windows();
    $cron$
  );

  RAISE NOTICE 'pg_cron job resolve-votes-direct scheduled successfully (every 5 minutes, direct SQL).';
END $$;
