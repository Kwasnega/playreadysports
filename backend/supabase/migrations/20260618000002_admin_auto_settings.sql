-- ============================================================
-- Admin Auto Settings & Enhanced Auto-Actions
-- Date: 2026-06-18
-- ============================================================

-- 1. CREATE ADMIN_AUTO_SETTINGS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.admin_auto_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_auto_settings_key ON public.admin_auto_settings(setting_key);

-- 2. SEED DEFAULT SETTINGS
-- ============================================================

-- Only insert if not already present
INSERT INTO public.admin_auto_settings (setting_key, value, description)
VALUES 
  ('auto_cancel_minutes_before', '20', 'Minutes before kickoff to check for insufficient players'),
  ('auto_cancel_min_players', 'null', 'Minimum players required (null = use max_core_players)'),
  ('auto_cancel_enabled', 'true', 'Enable automatic cancellation for low player matches'),
  ('auto_cancel_if_below_percent_full', '0', 'Cancel if below X% full (0 = disabled)'),
  ('enable_auto_completion', 'true', 'Enable automatic completion after booking duration'),
  ('checkin_percentage_required', '50', 'Percentage of players who must check in for auto-complete'),
  ('notification_style', 'toast', 'Notification delivery: toast, in_app, email, all'),
  ('refund_retry_attempts', '3', 'Number of retry attempts for failed refunds'),
  ('refund_retry_delay_seconds', '300', 'Delay between retry attempts in seconds'),
  ('payout_processing_delay_hours', '24', 'Hours to wait before processing payouts'),
  ('enable_dispute_alerts', 'true', 'Send admin alerts for disputed matches'),
  ('max_auto_actions_per_hour', '100', 'Rate limit for scheduled auto-actions')
ON CONFLICT (setting_key) DO NOTHING;

-- 3. ADD CHECK-IN TRACKING COLUMNS TO match_participants
-- ============================================================

ALTER TABLE public.match_participants 
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;

ALTER TABLE public.match_participants 
  ADD COLUMN IF NOT EXISTS qr_verified BOOLEAN DEFAULT FALSE;

ALTER TABLE public.match_participants 
  ADD COLUMN IF NOT EXISTS checkin_code TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_match_participants_checkin 
  ON public.match_participants(checked_in_at);

-- 4. REFUND RETRY QUEUE TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.refund_retry_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  refund_reason TEXT NOT NULL,
  -- 'auto_cancel', 'manual_cancel', 'dispute_refund', 'admin_refund'
  moolre_transaction_id TEXT,
  attempt_count INT DEFAULT 0,
  max_attempts INT DEFAULT 3,
  last_attempt_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  error_message TEXT,
  status TEXT DEFAULT 'pending',
  -- 'pending', 'processing', 'completed', 'failed', 'abandoned'
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_refund_queue_match ON public.refund_retry_queue(match_id);
CREATE INDEX IF NOT EXISTS idx_refund_queue_user ON public.refund_retry_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_refund_queue_status ON public.refund_retry_queue(status);
CREATE INDEX IF NOT EXISTS idx_refund_queue_next_retry ON public.refund_retry_queue(next_retry_at)
  WHERE status = 'pending';

-- 5. ADMIN ACTION AUDIT TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.admin_actions_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  -- 'force_complete_match', 'force_cancel_match', 'update_setting', 'manual_refund', 'manual_payout'
  target_type TEXT,  -- 'match', 'user', 'setting', 'transaction'
  target_id uuid,
  reason TEXT,
  metadata JSONB,
  status TEXT DEFAULT 'completed',
  -- 'completed', 'pending', 'failed'
  result TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_admin ON public.admin_actions_audit(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_type ON public.admin_actions_audit(action_type);
CREATE INDEX IF NOT EXISTS idx_admin_actions_created ON public.admin_actions_audit(created_at DESC);

-- 6. NOTIFICATION DELIVERY TRACKING
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notification_delivery_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid REFERENCES public.smart_notifications(id) ON DELETE CASCADE,
  delivery_method TEXT NOT NULL,  -- 'toast', 'in_app', 'email', 'sms'
  status TEXT DEFAULT 'pending',  -- 'pending', 'sent', 'failed'
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_delivery_notification ON public.notification_delivery_log(notification_id);
CREATE INDEX IF NOT EXISTS idx_notif_delivery_status ON public.notification_delivery_log(status);
