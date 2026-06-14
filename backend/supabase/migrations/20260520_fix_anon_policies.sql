-- Fix anon SELECT policies to prevent 401 console flooding for logged-out users
-- on the home page (match_participants join + platform_settings read).

-- Allow anon users to read match_participants for public matches only.
-- This lets the home feed show participant counts / filled status.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'match_participants'
      AND policyname = 'match_participants_select_public'
  ) THEN
    CREATE POLICY match_participants_select_public
      ON public.match_participants
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.matches
          WHERE id = match_participants.match_id
            AND match_type = 'public'
        )
      );
  END IF;
END
$$;

-- platform_settings already has an anon policy in 20260519_add_maintenance_mode.sql,
-- but ensure it exists here as a defensive guard.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'platform_settings'
      AND policyname = 'platform_settings_select_anon'
  ) THEN
    CREATE POLICY platform_settings_select_anon
      ON public.platform_settings
      FOR SELECT
      USING (true);
  END IF;
END
$$;
