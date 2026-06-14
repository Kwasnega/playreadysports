-- ============================================================
-- Fix: Allow anonymous (logged-out) users to browse public matches
--
-- The home feed shows upcoming public matches, venue info, and
-- participant counts to ALL visitors. RLS policies currently
-- block unauthenticated (anon) reads, causing 401 errors.
--
-- This migration:
--   1. Grants SELECT on required tables to the anon role
--   2. Creates RLS policies scoped to public data only
--   3. Grants access to leaderboard_mv for the anon role
-- ============================================================

-- ── 1. public_profiles view ─────────────────────────────────
-- Safe view that only exposes non-private columns
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'public_profiles' AND n.nspname = 'public'
  ) THEN
    GRANT SELECT ON public.public_profiles TO anon;
  END IF;
END $$;

-- ── 2. matches ──────────────────────────────────────────────
-- Anon can only see public matches
GRANT SELECT ON public.matches TO anon;

DROP POLICY IF EXISTS "matches_select_anon_public" ON public.matches;
CREATE POLICY "matches_select_anon_public"
  ON public.matches
  FOR SELECT
  TO anon
  USING (match_type = 'public');

-- ── 3. venues ───────────────────────────────────────────────
-- Required for the venue:venues(...) embed in match queries
GRANT SELECT ON public.venues TO anon;

DROP POLICY IF EXISTS "venues_select_anon" ON public.venues;
CREATE POLICY "venues_select_anon"
  ON public.venues
  FOR SELECT
  TO anon
  USING (true);  -- All venues readable for embedded joins; filter is on matches

-- ── 4. match_participants ────────────────────────────────────
-- Required for participant slot counts and useHomeStats counters
GRANT SELECT ON public.match_participants TO anon;

DROP POLICY IF EXISTS "match_participants_select_anon_public" ON public.match_participants;
CREATE POLICY "match_participants_select_anon_public"
  ON public.match_participants
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_participants.match_id
        AND m.match_type = 'public'
    )
  );

-- ── 5. leaderboard_mv (if exists) ───────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'leaderboard_mv' AND n.nspname = 'public'
  ) THEN
    GRANT SELECT ON public.leaderboard_mv TO anon;
  END IF;
END $$;

-- ============================================================
-- Done. Anonymous users can now browse the public match feed.
-- Joining a match still requires authentication (INSERT/UPDATE
-- policies remain restricted to authenticated users).
-- ============================================================
