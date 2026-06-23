-- ============================================================
-- Smart Match Status System
-- Transforms app from stale UI to real-time, intelligent, professional
-- Date: 2026-06-18
-- ============================================================

-- 1. ENUMS
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'intelligent_match_status') THEN
    CREATE TYPE public.intelligent_match_status AS ENUM (
      'upcoming',      -- More than 20 minutes until kickoff
      'soon',          -- Within 20 minutes of kickoff
      'live_now',      -- Match is currently active (within booking duration)
      'ended',         -- Past match end time
      'cancelled',     -- Auto-cancelled or manually cancelled
      'archived'       -- Completed and old
    );
  END IF;
END $$;

-- 2. ADD COLUMNS TO matches TABLE
-- ============================================================

-- Booking & Timing Intelligence
ALTER TABLE public.matches 
  ADD COLUMN IF NOT EXISTS booking_duration_minutes INT DEFAULT 60;

ALTER TABLE public.matches 
  ADD COLUMN IF NOT EXISTS min_players_required INT;  
-- If NULL, use max_core_players

-- Auto-Lifecycle Management
ALTER TABLE public.matches 
  ADD COLUMN IF NOT EXISTS auto_cancelled_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE public.matches 
  ADD COLUMN IF NOT EXISTS auto_completed_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE public.matches 
  ADD COLUMN IF NOT EXISTS cancelled_reason TEXT;
-- 'auto_low_players', 'organizer_cancel', 'manual_admin', etc.

ALTER TABLE public.matches 
  ADD COLUMN IF NOT EXISTS final_status TEXT;
-- Stores permanent status for archival: 'completed', 'cancelled', 'archived'

-- Status Tracking
ALTER TABLE public.matches 
  ADD COLUMN IF NOT EXISTS intelligent_status public.intelligent_match_status DEFAULT 'upcoming';

ALTER TABLE public.matches 
  ADD COLUMN IF NOT EXISTS status_last_updated_at TIMESTAMPTZ DEFAULT now();

-- Caching & Performance
ALTER TABLE public.matches 
  ADD COLUMN IF NOT EXISTS current_participants_count INT DEFAULT 0;

ALTER TABLE public.matches 
  ADD COLUMN IF NOT EXISTS is_full BOOLEAN DEFAULT FALSE;

-- Escrow & Payment Safety
ALTER TABLE public.matches 
  ADD COLUMN IF NOT EXISTS refund_issued_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE public.matches 
  ADD COLUMN IF NOT EXISTS refund_notes TEXT;

-- 3. NEW TABLES
-- ============================================================

-- Audit trail for status changes
CREATE TABLE IF NOT EXISTS public.match_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT,
  intelligent_status_before public.intelligent_match_status,
  intelligent_status_after public.intelligent_match_status,
  triggered_by TEXT NOT NULL,  
  -- 'auto_cancel', 'auto_complete', 'user_organizer', 'admin', 'system'
  triggered_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason TEXT,  
  -- "Insufficient players", "Booking duration expired", "Organizer manual", etc.
  created_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB  
  -- Additional context: { participant_count, min_required, refund_amount, etc }
);

CREATE INDEX IF NOT EXISTS idx_match_status_history_match 
  ON public.match_status_history(match_id);
CREATE INDEX IF NOT EXISTS idx_match_status_history_created 
  ON public.match_status_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_match_status_history_trigger 
  ON public.match_status_history(triggered_by);


-- Enhanced notifications system for auto-actions
CREATE TABLE IF NOT EXISTS public.smart_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  match_id uuid REFERENCES public.matches(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,  
  -- 'auto_cancel', 'auto_complete', 'reminder_60m', 'reminder_30m', 
  -- 'reminder_15m', 'reminder_5m', 'payout', 'refund', 'join_alert'
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  action_url TEXT,
  action_label TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '30 days'),
  UNIQUE(user_id, notification_type, match_id)
);

CREATE INDEX IF NOT EXISTS idx_smart_notif_user 
  ON public.smart_notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_smart_notif_match 
  ON public.smart_notifications(match_id);
CREATE INDEX IF NOT EXISTS idx_smart_notif_expires 
  ON public.smart_notifications(expires_at);


-- Audit trail for all automated actions
CREATE TABLE IF NOT EXISTS public.match_auto_actions_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,  
  -- 'auto_cancel_check', 'auto_cancel_executed', 'auto_complete_executed', 
  -- 'reminder_sent', 'refund_issued', 'payout_queued'
  status_before TEXT,
  status_after TEXT,
  intelligent_status_before public.intelligent_match_status,
  intelligent_status_after public.intelligent_match_status,
  success BOOLEAN,
  error_message TEXT,
  affected_users INT,
  metadata JSONB,  
  -- { participant_count, refund_amount, reason, etc }
  executed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auto_actions_match 
  ON public.match_auto_actions_log(match_id);
CREATE INDEX IF NOT EXISTS idx_auto_actions_executed 
  ON public.match_auto_actions_log(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_auto_actions_type 
  ON public.match_auto_actions_log(action_type);


-- Admin configuration for auto-actions
CREATE TABLE IF NOT EXISTS public.admin_auto_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text UNIQUE NOT NULL,
  value text NOT NULL,
  description text,
  data_type TEXT DEFAULT 'string',  
  -- 'string', 'int', 'boolean', 'float'
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT valid_boolean_value 
    CHECK (data_type != 'boolean' OR value IN ('true', 'false')),
  CONSTRAINT valid_int_value 
    CHECK (data_type != 'int' OR value ~ '^\d+$')
);

CREATE INDEX IF NOT EXISTS idx_admin_settings_key 
  ON public.admin_auto_settings(setting_key);

-- Default admin settings
INSERT INTO public.admin_auto_settings (setting_key, value, data_type, description) VALUES
  ('auto_cancel_minutes_before', '20', 'int', 
   'Cancel match this many minutes before kickoff if below min players'),
  ('auto_cancel_min_players', '4', 'int', 
   'Minimum players required to prevent auto-cancellation'),
  ('auto_complete_after_match_end', 'true', 'boolean', 
   'Automatically mark match complete after duration expires'),
  ('completion_buffer_minutes', '5', 'int', 
   'Minutes after match_date + duration to allow before auto-completion'),
  ('notification_reminder_1h', 'true', 'boolean', 
   'Send reminder notification 60 minutes before'),
  ('notification_reminder_30m', 'true', 'boolean', 
   'Send reminder notification 30 minutes before'),
  ('notification_reminder_15m', 'true', 'boolean', 
   'Send reminder notification 15 minutes before'),
  ('notification_reminder_5m', 'true', 'boolean', 
   'Send reminder notification 5 minutes before'),
  ('enable_intelligent_status', 'true', 'boolean', 
   'Use intelligent status logic for display'),
  ('enable_real_time_updates', 'true', 'boolean', 
   'Enable real-time subscriptions for status changes')
ON CONFLICT (setting_key) DO NOTHING;


-- 4. INDEXES FOR PERFORMANCE
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_matches_intelligent_status 
  ON public.matches(intelligent_status);

CREATE INDEX IF NOT EXISTS idx_matches_booking_duration 
  ON public.matches(booking_duration_minutes);

CREATE INDEX IF NOT EXISTS idx_matches_auto_cancelled 
  ON public.matches(auto_cancelled_at);

CREATE INDEX IF NOT EXISTS idx_matches_auto_completed 
  ON public.matches(auto_completed_at);

CREATE INDEX IF NOT EXISTS idx_matches_status_and_date 
  ON public.matches(status, match_date);

CREATE INDEX IF NOT EXISTS idx_matches_intelligent_and_date 
  ON public.matches(intelligent_status, match_date);

CREATE INDEX IF NOT EXISTS idx_matches_status_updated 
  ON public.matches(status_last_updated_at DESC);


-- 5. COMMENT ON COLUMNS
-- ============================================================

COMMENT ON COLUMN public.matches.booking_duration_minutes IS 
  'Booked turf duration in minutes, used to determine auto-completion time';

COMMENT ON COLUMN public.matches.min_players_required IS 
  'Minimum players to prevent auto-cancel. NULL means use max_core_players';

COMMENT ON COLUMN public.matches.auto_cancelled_at IS 
  'Timestamp when match was automatically cancelled due to insufficient players';

COMMENT ON COLUMN public.matches.auto_completed_at IS 
  'Timestamp when match was automatically marked complete after booking duration';

COMMENT ON COLUMN public.matches.cancelled_reason IS 
  'Reason for cancellation: auto_low_players, organizer_cancel, admin, etc.';

COMMENT ON COLUMN public.matches.intelligent_status IS 
  'Computed status for UI display: upcoming, soon, live_now, ended, cancelled, archived';

COMMENT ON COLUMN public.matches.current_participants_count IS 
  'Denormalized count for faster queries, updated via trigger or function';

COMMENT ON COLUMN public.matches.refund_issued_at IS 
  'When refund (if any) was processed via Moolre';


-- 6. TRIGGERS TO MAINTAIN DATA
-- ============================================================

-- Update status_last_updated_at when status changes
CREATE OR REPLACE FUNCTION public.update_match_status_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status OR
     OLD.auto_cancelled_at IS DISTINCT FROM NEW.auto_cancelled_at OR
     OLD.auto_completed_at IS DISTINCT FROM NEW.auto_completed_at THEN
    NEW.status_last_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_match_status_timestamp ON public.matches;
CREATE TRIGGER trg_update_match_status_timestamp
  BEFORE UPDATE ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.update_match_status_timestamp();


-- Update current_participants_count denormalized field
CREATE OR REPLACE FUNCTION public.update_match_participants_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.matches
  SET current_participants_count = (
    SELECT COUNT(*) FROM public.match_participants 
    WHERE match_id = COALESCE(NEW.match_id, OLD.match_id)
      AND status = 'confirmed'
  )
  WHERE id = COALESCE(NEW.match_id, OLD.match_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_participants_count_insert ON public.match_participants;
CREATE TRIGGER trg_update_participants_count_insert
  AFTER INSERT ON public.match_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.update_match_participants_count();

DROP TRIGGER IF EXISTS trg_update_participants_count_delete ON public.match_participants;
CREATE TRIGGER trg_update_participants_count_delete
  AFTER DELETE ON public.match_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.update_match_participants_count();

DROP TRIGGER IF EXISTS trg_update_participants_count_update ON public.match_participants;
CREATE TRIGGER trg_update_participants_count_update
  AFTER UPDATE ON public.match_participants
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.update_match_participants_count();


-- 7. ENABLE REALTIME PUBLICATIONS
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.match_status_history;
ALTER PUBLICATION supabase_realtime ADD TABLE public.smart_notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_auto_actions_log;

-- Ensure matches table is published (for status changes)
ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;


-- 8. BACKFILL EXISTING MATCHES WITH DEFAULT VALUES
-- ============================================================

UPDATE public.matches
SET 
  booking_duration_minutes = COALESCE(booking_duration_minutes, 60),
  min_players_required = COALESCE(min_players_required, max_core_players),
  intelligent_status = CASE
    WHEN status = 'cancelled' THEN 'cancelled'::public.intelligent_match_status
    WHEN status = 'completed' THEN 'ended'::public.intelligent_match_status
    WHEN now() >= match_date AND now() < (match_date + (COALESCE(booking_duration_minutes, 60) || ' minutes')::interval)
      THEN 'live_now'::public.intelligent_match_status
    WHEN now() >= (match_date - INTERVAL '20 minutes') AND now() < match_date
      THEN 'soon'::public.intelligent_match_status
    ELSE 'upcoming'::public.intelligent_match_status
  END
WHERE intelligent_status IS NULL;
