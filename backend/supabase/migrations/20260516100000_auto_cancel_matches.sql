-- ============================================================
-- Auto-cancel underfilled paid matches via pg_cron
-- Runs every minute; calls the auto-cancel-matches edge function.
-- Also seeds platform_settings for the auto-cancel config keys.
-- ============================================================

-- 1. Seed platform settings for auto-cancel (idempotent)
INSERT INTO platform_settings (key, value, description)
VALUES
  ('auto_cancel_window_minutes', '20', 'Minutes before kickoff to trigger auto-cancel for underfilled matches'),
  ('auto_cancel_min_paid_pct',   '0.5', 'Minimum fraction of core slots that must be paid to avoid auto-cancel (0.5 = 50%)')
ON CONFLICT (key) DO NOTHING;

-- 2. Schedule auto-cancel cron via pg_cron (if extension is available)
DO $$
DECLARE
  extension_exists boolean;
  supabase_url text;
  service_role_key text;
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

  -- Unschedule previous version if it exists
  BEGIN
    PERFORM cron.unschedule('auto-cancel-matches');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Schedule to run every minute via net.http_post
  -- Requires pg_net extension (enabled by default on Supabase)
  PERFORM cron.schedule(
    'auto-cancel-matches',
    '* * * * *',
    $cron$
      SELECT net.http_post(
        url := current_setting('app.supabase_url', true) || '/functions/v1/auto-cancel-matches',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.service_role_key', true),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      )
    $cron$
  );

  RAISE NOTICE 'pg_cron job auto-cancel-matches scheduled successfully (every minute).';
END $$;

-- NOTE: You must set the following Postgres settings for the cron SQL to work:
--   ALTER DATABASE postgres SET app.supabase_url = 'https://<your-project>.supabase.co';
--   ALTER DATABASE postgres SET app.service_role_key = '<your-service-role-key>';
-- Or alternatively, call the edge function from the match-reminders job pattern.
