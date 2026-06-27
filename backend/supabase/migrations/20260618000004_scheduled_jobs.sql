-- ============================================================
-- Sprint 2: Scheduled Jobs & Cron Configuration
-- Auto-triggers for auto-cancel, auto-complete, refund retry
-- Date: 2026-06-18
-- ============================================================

-- 1. ENABLE pg_cron EXTENSION (if not already enabled)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant permissions to postgres user
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;


-- 2. CREATE SCHEDULED JOB: Auto-Cancel Low Player Matches
-- ============================================================

-- Run every 5 minutes to check for insufficient players 20 min before kickoff
SELECT cron.schedule(
  'auto_cancel_low_players_job',
  '*/5 * * * *',  -- Every 5 minutes
  $$
  SELECT auto_cancel_low_player_matches();
  $$
);


-- 3. CREATE SCHEDULED JOB: Auto-Complete Expired Bookings (SAFE)
-- ============================================================

-- Run every 5 minutes to complete matches past their booking duration
SELECT cron.schedule(
  'auto_complete_bookings_safe_job',
  '*/5 * * * *',  -- Every 5 minutes
  $$
  SELECT * FROM auto_complete_expired_bookings_safe();
  $$
);


-- 4. CREATE SCHEDULED JOB: Process Refund Retry Queue
-- ============================================================

-- Run every 10 minutes to retry failed refunds
SELECT cron.schedule(
  'process_refund_queue_job',
  '*/10 * * * *',  -- Every 10 minutes
  $$
  SELECT * FROM process_refund_retry_queue();
  $$
);


-- 5. CREATE SCHEDULED JOB: Send Match Reminders
-- ============================================================

-- Run every minute to send reminders to participants
SELECT cron.schedule(
  'send_match_reminders_job',
  '* * * * *',  -- Every minute
  $$
  WITH match_reminders AS (
    SELECT DISTINCT m.id, mp.user_id
    FROM public.matches m
    JOIN public.match_participants mp ON m.id = mp.match_id
    WHERE m.status IN ('upcoming', 'confirmed')
      AND m.auto_cancelled_at IS NULL
      AND mp.status = 'confirmed'
      AND NOT EXISTS (
        SELECT 1 FROM public.smart_notifications
        WHERE user_id = mp.user_id
          AND match_id = m.id
          AND notification_type LIKE 'reminder_%'
          AND created_at > now() - INTERVAL '5 minutes'
      )
  )
  INSERT INTO public.smart_notifications (
    user_id, match_id, notification_type, title, message, action_url, action_label
  )
  SELECT 
    mr.user_id,
    mr.id,
    CASE 
      WHEN EXTRACT(EPOCH FROM (m.match_date - now())) / 60 > 50 AND EXTRACT(EPOCH FROM (m.match_date - now())) / 60 <= 65
        THEN 'reminder_60m'
      WHEN EXTRACT(EPOCH FROM (m.match_date - now())) / 60 > 25 AND EXTRACT(EPOCH FROM (m.match_date - now())) / 60 <= 35
        THEN 'reminder_30m'
      WHEN EXTRACT(EPOCH FROM (m.match_date - now())) / 60 > 10 AND EXTRACT(EPOCH FROM (m.match_date - now())) / 60 <= 20
        THEN 'reminder_15m'
      WHEN EXTRACT(EPOCH FROM (m.match_date - now())) / 60 > 0 AND EXTRACT(EPOCH FROM (m.match_date - now())) / 60 <= 10
        THEN 'reminder_5m'
      ELSE NULL
    END,
    CASE 
      WHEN EXTRACT(EPOCH FROM (m.match_date - now())) / 60 > 50 THEN 'Match in 1 Hour'
      WHEN EXTRACT(EPOCH FROM (m.match_date - now())) / 60 > 25 THEN 'Match in 30 Minutes'
      WHEN EXTRACT(EPOCH FROM (m.match_date - now())) / 60 > 10 THEN 'Match in 15 Minutes'
      WHEN EXTRACT(EPOCH FROM (m.match_date - now())) / 60 > 0 THEN 'Match Starting Very Soon!'
      ELSE NULL
    END,
    'Your match is ' ||
    CASE 
      WHEN EXTRACT(EPOCH FROM (m.match_date - now())) / 60 > 50 THEN 'starting in 1 hour'
      WHEN EXTRACT(EPOCH FROM (m.match_date - now())) / 60 > 25 THEN 'starting in 30 minutes'
      WHEN EXTRACT(EPOCH FROM (m.match_date - now())) / 60 > 10 THEN 'starting in 15 minutes'
      WHEN EXTRACT(EPOCH FROM (m.match_date - now())) / 60 > 0 THEN 'starting very soon!'
      ELSE NULL
    END || '. Be on time!',
    '/matches/' || mr.id::text,
    'View Match'
  FROM match_reminders mr
  JOIN public.matches m ON mr.id = m.id
  WHERE (
    EXTRACT(EPOCH FROM (m.match_date - now())) / 60 BETWEEN 0 AND 65
  )
  ON CONFLICT (user_id, notification_type, match_id) DO NOTHING;
  $$
);


-- 6. CREATE SCHEDULED JOB: Clean Up Old Notifications
-- ============================================================

-- Run daily at 2 AM to delete expired notifications
SELECT cron.schedule(
  'cleanup_old_notifications_job',
  '0 2 * * *',  -- Daily at 2 AM
  $$
  DELETE FROM public.smart_notifications
  WHERE expires_at < now();
  $$
);


-- 7. CREATE SCHEDULED JOB: Update Status Last Checked Timestamp
-- ============================================================

-- Run every hour to update status check timestamps for admin monitoring
SELECT cron.schedule(
  'update_status_check_timestamps_job',
  '0 * * * *',  -- Every hour
  $$
  UPDATE public.matches SET
    last_status_check_at = now()
  WHERE last_status_check_at IS NULL
    OR last_status_check_at < now() - INTERVAL '1 hour';
  $$
);


-- 8. CREATE AUDIT LOGGING FOR SCHEDULED JOBS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.scheduled_job_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL,
  status TEXT DEFAULT 'started',
  -- 'started', 'completed', 'failed'
  error_message TEXT,
  rows_affected INT,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_seconds NUMERIC
);

CREATE INDEX IF NOT EXISTS idx_scheduled_job_log_name ON public.scheduled_job_log(job_name);
CREATE INDEX IF NOT EXISTS idx_scheduled_job_log_started ON public.scheduled_job_log(started_at DESC);


-- 9. WRAP SCHEDULED JOBS WITH LOGGING
-- ============================================================

CREATE OR REPLACE FUNCTION public.log_and_run_auto_cancel()
RETURNS void AS $$
DECLARE
  v_job_id uuid;
  v_start_time TIMESTAMPTZ := now();
  v_row_count INT;
BEGIN
  v_job_id := gen_random_uuid();
  
  BEGIN
    -- Run auto-cancel
    WITH results AS (
      SELECT * FROM auto_cancel_low_player_matches()
    )
    SELECT COUNT(*) INTO v_row_count FROM results;

    -- Log success
    INSERT INTO public.scheduled_job_log (
      id, job_name, status, rows_affected, completed_at, duration_seconds
    ) VALUES (
      v_job_id,
      'auto_cancel_low_players_job',
      'completed',
      COALESCE(v_row_count, 0),
      now(),
      EXTRACT(EPOCH FROM (now() - v_start_time))
    );

  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.scheduled_job_log (
      id, job_name, status, error_message, completed_at, duration_seconds
    ) VALUES (
      v_job_id,
      'auto_cancel_low_players_job',
      'failed',
      SQLERRM,
      now(),
      EXTRACT(EPOCH FROM (now() - v_start_time))
    );
  END;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION public.log_and_run_auto_complete()
RETURNS void AS $$
DECLARE
  v_job_id uuid;
  v_start_time TIMESTAMPTZ := now();
  v_row_count INT;
BEGIN
  v_job_id := gen_random_uuid();
  
  BEGIN
    -- Run auto-complete
    WITH results AS (
      SELECT * FROM auto_complete_expired_bookings_safe()
    )
    SELECT COUNT(*) INTO v_row_count FROM results;

    -- Log success
    INSERT INTO public.scheduled_job_log (
      id, job_name, status, rows_affected, completed_at, duration_seconds
    ) VALUES (
      v_job_id,
      'auto_complete_bookings_safe_job',
      'completed',
      COALESCE(v_row_count, 0),
      now(),
      EXTRACT(EPOCH FROM (now() - v_start_time))
    );

  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.scheduled_job_log (
      id, job_name, status, error_message, completed_at, duration_seconds
    ) VALUES (
      v_job_id,
      'auto_complete_bookings_safe_job',
      'failed',
      SQLERRM,
      now(),
      EXTRACT(EPOCH FROM (now() - v_start_time))
    );
  END;
END;
$$ LANGUAGE plpgsql;


-- 10. MONITOR SCHEDULED JOB HEALTH
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_scheduled_job_health()
RETURNS JSONB AS $$
DECLARE
  v_health JSONB;
BEGIN
  SELECT jsonb_object_agg(
    job_name,
    jsonb_build_object(
      'last_run', MAX(started_at)::text,
      'last_status', (array_agg(status ORDER BY started_at DESC))[1],
      'consecutive_failures', COUNT(*) FILTER (WHERE status = 'failed'),
      'last_error', (array_agg(error_message ORDER BY started_at DESC))[1],
      'avg_duration_seconds', ROUND(AVG(duration_seconds)::numeric, 2)
    )
  ) INTO v_health
  FROM public.scheduled_job_log
  WHERE started_at > now() - INTERVAL '7 days'
  GROUP BY job_name;

  RETURN COALESCE(v_health, '{}'::jsonb);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM);
END;
$$ LANGUAGE plpgsql STABLE;
