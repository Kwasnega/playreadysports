-- Admin Live Dashboard Enhancements
-- 1. Add payments_frozen to matches for freeze/unfreeze payments
-- 2. Add admin_alerts table for critical alerts
-- 3. Add auto_intervention_logs table for tracking auto-interventions
-- 4. Create RPC function for live dashboard stats
-- 5. Create function to update last_active_at on auth events
-- 6. Add indexes for performance

-- 1. payments_frozen on matches
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS payments_frozen boolean NOT NULL DEFAULT false;

-- 2. admin_alerts table
CREATE TABLE IF NOT EXISTS public.admin_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('critical', 'warning', 'info')),
  category text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  match_id uuid REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.admin_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_alerts_select_admin ON public.admin_alerts
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

CREATE POLICY admin_alerts_insert_admin ON public.admin_alerts
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

CREATE POLICY admin_alerts_update_admin ON public.admin_alerts
  FOR UPDATE USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

-- 3. auto_intervention_logs table
CREATE TABLE IF NOT EXISTS public.auto_intervention_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  rule_name text NOT NULL,
  trigger_reason text NOT NULL,
  action_taken text NOT NULL,
  status text NOT NULL DEFAULT 'executed' CHECK (status IN ('executed', 'skipped', 'failed')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.auto_intervention_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY auto_intervention_logs_select_admin ON public.auto_intervention_logs
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

CREATE POLICY auto_intervention_logs_insert_admin ON public.auto_intervention_logs
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

-- 4. RPC function: live_dashboard_stats()
CREATE OR REPLACE FUNCTION public.live_dashboard_stats()
RETURNS TABLE(
  live_matches bigint,
  players_on_pitch bigint,
  total_escrow numeric,
  active_users bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT COUNT(*)::bigint FROM public.matches WHERE status = 'live') AS live_matches,
    (SELECT COUNT(DISTINCT mp.user_id)::bigint
     FROM public.match_participants mp
     JOIN public.matches m ON m.id = mp.match_id
     WHERE m.status = 'live' AND mp.status = 'active'
    ) AS players_on_pitch,
    (SELECT COALESCE(SUM(m.entry_fee * m.core_paid_count), 0)
     FROM public.matches m
     WHERE m.status IN ('live', 'upcoming') AND m.escrow_status = 'held'
    )::numeric AS total_escrow,
    (SELECT COUNT(*)::bigint FROM public.profiles
     WHERE last_active_at > now() - interval '15 minutes'
    ) AS active_users;
$$;

-- 5. Function to auto-update last_active_at via RPC or trigger
-- We'll also create a simple RPC the frontend can call
CREATE OR REPLACE FUNCTION public.update_user_activity()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles SET last_active_at = now() WHERE id = auth.uid();
$$;

-- 6. Performance indexes
CREATE INDEX IF NOT EXISTS idx_matches_payments_frozen ON public.matches(payments_frozen) WHERE payments_frozen = true;
CREATE INDEX IF NOT EXISTS idx_admin_alerts_unresolved ON public.admin_alerts(is_resolved, created_at) WHERE is_resolved = false;
CREATE INDEX IF NOT EXISTS idx_admin_alerts_match ON public.admin_alerts(match_id);
CREATE INDEX IF NOT EXISTS idx_auto_intervention_match ON public.auto_intervention_logs(match_id);
CREATE INDEX IF NOT EXISTS idx_profiles_last_active ON public.profiles(last_active_at);

-- Grant execute on function
GRANT EXECUTE ON FUNCTION public.live_dashboard_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_activity() TO authenticated;
