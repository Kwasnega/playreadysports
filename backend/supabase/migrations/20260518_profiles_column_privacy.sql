-- ============================================================
-- Profiles Column Privacy
--
-- Problem: profiles_select_all uses USING (true), meaning every
-- authenticated user can SELECT every row including private
-- columns (phone_number, location, ban details, etc.).
--
-- RLS is ROW-level only — it cannot restrict individual columns.
-- The correct pattern is:
--   1. Restrict direct table SELECT to own row + admins.
--   2. Expose a public_profiles VIEW (safe columns only) via a
--      SECURITY DEFINER function that bypasses RLS.
--   3. App code uses public_profiles for other-user lookups.
-- ============================================================

-- ─── Step 1: Drop the permissive catch-all SELECT policy ─────
DROP POLICY IF EXISTS profiles_select_all           ON public.profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- ─── Step 2: Self SELECT — full row ──────────────────────────
-- A user can read their own complete profile row.
DROP POLICY IF EXISTS "profiles: own row select" ON public.profiles;
CREATE POLICY "profiles: own row select"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING ( auth.uid() = id );

-- ─── Step 3: Admin SELECT — all rows (full columns) ──────────
-- Admin panel (AdminPlayers, AdminOverview) needs unrestricted read.
--
-- IMPORTANT: the USING clause must NOT query public.profiles directly —
-- that causes infinite recursion (the policy triggers itself).
-- Fix: a SECURITY DEFINER helper runs as the owner (BYPASSRLS) so it
-- can read profiles without re-entering the RLS check.
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (role IN ('admin', 'super_admin') OR is_admin = true)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated;

DROP POLICY IF EXISTS "profiles: admin select all" ON public.profiles;
CREATE POLICY "profiles: admin select all"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING ( public.is_admin_user() );

-- ─── Step 4: UPDATE policies (already exist, kept for clarity) ─
-- profiles_update_own_no_role_escalation  — self update, no role change
-- admins_can_update_any_profile            — admins update anyone
-- These were created in 20260517000100_fix_profiles_role_escalation.sql
-- and remain unchanged. No INSERT or DELETE policy is added:
-- new profile rows are created by the handle_new_user trigger
-- (SECURITY DEFINER), and deleting a profile cascades from auth.users
-- which only service_role can do.

-- ─── Step 5: SECURITY DEFINER function for public columns ────
-- Runs as postgres (BYPASSRLS), so it can read across all rows
-- while only returning the safe columns the app needs publicly.
--
-- Public columns exposed:
--   id, username, full_name, avatar_url   — identity / display
--   bio                                   — user-written public blurb
--   city                                  — for match/leaderboard filter
--   skill_level, position, preferred_sports — game-relevant
--   reputation_score, total_matches_played,
--   total_wins, total_matches             — stats (leaderboard)
--   role                                  — needed to identify turf owners
--   is_verified                           — shown on player cards
--   created_at                            — account age display
--
-- Private columns NOT exposed:
--   phone_number, location                — personal contact info
--   is_banned, banned_until, ban_reason   — admin-only moderation data
--   balance / venue_owner_balance         — financial data
--   is_admin                              — internal flag
--   updated_at                            — internal
DROP FUNCTION IF EXISTS public.get_public_profiles() CASCADE;
CREATE OR REPLACE FUNCTION public.get_public_profiles()
RETURNS TABLE (
  id                   uuid,
  username             text,
  full_name            text,
  avatar_url           text,
  bio                  text,
  city                 text,
  skill_level          public.skill_level,
  "position"           text,
  preferred_sports     text[],
  reputation_score     float,
  total_matches_played int,
  total_wins           int,
  total_matches        int,
  role                 text,
  is_verified          bool,
  created_at           timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Disable RLS for this function's queries so it can read all rows
  -- (only the safe columns are selected and returned).
  SET LOCAL row_security = off;
  RETURN QUERY
    SELECT
      p.id,
      p.username,
      p.full_name,
      p.avatar_url,
      p.bio,
      p.city,
      p.skill_level,
      p."position",
      p.preferred_sports,
      p.reputation_score,
      p.total_matches_played,
      p.total_wins,
      p.total_matches,
      p.role,
      p.is_verified,
      p.created_at
    FROM public.profiles p;
END;
$$;

-- Restrict who can call this function
REVOKE EXECUTE ON FUNCTION public.get_public_profiles() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_public_profiles() TO authenticated, anon;

-- ─── Step 6: public_profiles view ────────────────────────────
-- This is the drop-in replacement for direct profiles queries
-- when reading another user's data. PostgREST exposes it at
-- /rest/v1/public_profiles — no app-level changes needed beyond
-- switching the table name in queries that read other users.
DROP VIEW IF EXISTS public.public_profiles;
CREATE OR REPLACE VIEW public.public_profiles AS
  SELECT * FROM public.get_public_profiles();

-- Grant SELECT on the view to all roles
GRANT SELECT ON public.public_profiles TO authenticated;
GRANT SELECT ON public.public_profiles TO anon;

-- ─── Step 7: Revoke direct table access from anon ────────────
-- anon users should NEVER touch the raw profiles table.
REVOKE ALL ON public.profiles FROM anon;

-- ─────────────────────────────────────────────────────────────
-- APP QUERY MIGRATION GUIDE
-- ─────────────────────────────────────────────────────────────
-- Any client query that reads another user's profile must
-- switch from `profiles` to `public_profiles`.
-- Own-profile reads (settings page, auth context) stay on
-- `profiles` — the self-SELECT policy covers them.
--
-- BEFORE (leaderboard, rosters, player cards):
--   supabase.from('profiles')
--     .select('id, username, full_name, avatar_url, reputation_score')
--
-- AFTER:
--   supabase.from('public_profiles')
--     .select('id, username, full_name, avatar_url, reputation_score')
--
-- Known queries to update:
--   src/hooks/useLeaderboard.ts      — profiles select
--   src/hooks/useHomeMatches.ts      — profiles join
--   src/pages/VenueOwnerDashboard.tsx — match_participants join
--   src/pages/AdminPlayers.tsx       — admin sees raw profiles (OK — admin policy covers it)
-- ─────────────────────────────────────────────────────────────

-- ─── Verification (run manually in SQL editor) ───────────────
-- As a non-admin authenticated user:
--   SELECT * FROM public.profiles;
--     → returns ONLY your own row (full columns)
--
--   SELECT * FROM public.public_profiles;
--     → returns ALL users but only safe columns
--
--   SELECT phone_number FROM public.public_profiles;
--     → ERROR: column "phone_number" does not exist (not in view)
--
-- As an admin user:
--   SELECT * FROM public.profiles;
--     → returns ALL rows, full columns
