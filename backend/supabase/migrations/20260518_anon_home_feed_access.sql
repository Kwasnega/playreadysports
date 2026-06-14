-- ============================================================
-- Anon (unauthenticated) read access for the public home feed
--
-- The home page shows upcoming public matches, venue info, and
-- stat counters to all visitors — no login required.
-- This migration grants the minimum required SELECT access for
-- those queries to work without a session JWT.
--
-- Profiles are NOT granted directly; the public_profiles VIEW
-- (backed by a SECURITY DEFINER function) is used instead.
-- ============================================================

-- ── public_profiles view ─────────────────────────────────────
-- Safe: only exposes the non-private columns defined in
-- 20260518_profiles_column_privacy.sql
GRANT SELECT ON public.public_profiles TO anon;

-- ── matches ──────────────────────────────────────────────────
GRANT SELECT ON public.matches TO anon;

-- Policy: anon can only see rows where match_type = 'public'
DROP POLICY IF EXISTS "matches_select_anon_public" ON public.matches;
CREATE POLICY "matches_select_anon_public"
  ON public.matches
  FOR SELECT
  TO anon
  USING (match_type = 'public');

-- ── venues ───────────────────────────────────────────────────
-- Required for the venue:venues(...) embed in match queries
GRANT SELECT ON public.venues TO anon;

-- Policy: anon can see active/verified venues only
DROP POLICY IF EXISTS "venues_select_anon" ON public.venues;
CREATE POLICY "venues_select_anon"
  ON public.venues
  FOR SELECT
  TO anon
  USING (is_active = true);

-- ── match_participants ────────────────────────────────────────
-- Required for participant slot counts and useHomeStats counters
GRANT SELECT ON public.match_participants TO anon;

-- Policy: anon can see participants of public matches only
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
