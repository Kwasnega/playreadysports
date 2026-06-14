-- Seed Football sport (only sport for PlayReady)
INSERT INTO public.sports (name, icon_url, is_active)
VALUES ('Football', '⚽', true)
ON CONFLICT (name) DO NOTHING;
