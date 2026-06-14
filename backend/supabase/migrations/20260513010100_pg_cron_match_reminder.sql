-- ============================================================
-- pg_cron match reminder job
-- ============================================================
-- IMPORTANT: pg_cron must be enabled first via the Supabase Dashboard
--   Database → Extensions → pg_cron → Enable
--   (Requires at least a Pro plan on some Supabase orgs.)
--
-- If you get "schema cron does not exist", the extension is not enabled.
-- Enable it in the Dashboard, then run this script.
-- ============================================================

DO $$
DECLARE
  extension_exists boolean;
BEGIN
  -- Check if pg_cron extension is available/installed
  SELECT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) INTO extension_exists;

  IF NOT extension_exists THEN
    -- Try to create it (only works if superuser / via Dashboard toggle)
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_cron;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'pg_cron extension not installed. Enable it in Supabase Dashboard → Database → Extensions → pg_cron, then re-run this migration.';
      RETURN;
    END;
  END IF;

  -- Schedule the reminder job (idempotent — unschedule first to avoid duplicates)
  BEGIN
    PERFORM cron.unschedule('match-reminders');
  EXCEPTION WHEN OTHERS THEN
    -- Job may not exist yet; ignore
    NULL;
  END;

  PERFORM cron.schedule('match-reminders', '*/15 * * * *', $$
    INSERT INTO notifications (user_id, title, body, type, data)
    SELECT
      mp.user_id,
      'Kickoff in 1 hour! ⚽',
      v.name || ', ' || to_char(m.match_date AT TIME ZONE 'Africa/Accra', 'HH12:MI AM'),
      'match_reminder',
      jsonb_build_object('match_id', m.id, 'join_code', m.join_code)
    FROM match_participants mp
    JOIN matches m ON mp.match_id = m.id
    JOIN venues v ON m.venue_id = v.id
    WHERE mp.status = 'active'
      AND m.status = 'upcoming'
      AND m.match_date BETWEEN (now() + interval '55 minutes') AND (now() + interval '65 minutes')
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.user_id = mp.user_id
          AND n.type = 'match_reminder'
          AND (n.data->>'match_id')::uuid = m.id
      )
  $$);

  RAISE NOTICE 'pg_cron job match-reminders scheduled successfully.';
END $$;

-- To verify the job is scheduled:
-- SELECT * FROM cron.job;

-- To unschedule:
-- SELECT cron.unschedule('match-reminders');
