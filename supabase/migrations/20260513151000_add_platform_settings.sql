-- ============================================================
-- Platform settings table for configurable admin values
-- ============================================================

CREATE TABLE IF NOT EXISTS public.platform_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text NOT NULL,
  description text,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz DEFAULT now()
);

-- Seed default commission rate (5%)
INSERT INTO public.platform_settings (key, value, description)
VALUES ('commission_rate', '0.05', 'Platform commission rate as decimal (e.g. 0.05 = 5%)')
ON CONFLICT (key) DO NOTHING;

-- Enable RLS
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can read/update settings
DROP POLICY IF EXISTS platform_settings_select_admin ON public.platform_settings;
CREATE POLICY platform_settings_select_admin ON public.platform_settings FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
);
DROP POLICY IF EXISTS platform_settings_update_admin ON public.platform_settings;
CREATE POLICY platform_settings_update_admin ON public.platform_settings FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
);
DROP POLICY IF EXISTS platform_settings_insert_admin ON public.platform_settings;
CREATE POLICY platform_settings_insert_admin ON public.platform_settings FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
);

-- Public read for commission rate (edge functions need it)
DROP POLICY IF EXISTS platform_settings_select_public ON public.platform_settings;
CREATE POLICY platform_settings_select_public ON public.platform_settings FOR SELECT USING (key = 'commission_rate');

GRANT SELECT ON public.platform_settings TO authenticated;
GRANT SELECT ON public.platform_settings TO anon;
