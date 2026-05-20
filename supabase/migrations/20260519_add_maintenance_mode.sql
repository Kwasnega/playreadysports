-- Maintenance mode toggle
INSERT INTO public.platform_settings (key, value, description)
VALUES ('maintenance_mode', 'false', 'When "true", the site shows a maintenance screen to all visitors except admins.')
ON CONFLICT (key) DO NOTHING;

-- Allow anon to read this setting (needed by frontend gate)
DROP POLICY IF EXISTS platform_settings_maintenance_anon ON public.platform_settings;
CREATE POLICY platform_settings_maintenance_anon ON public.platform_settings
  FOR SELECT TO anon USING (key = 'maintenance_mode');
