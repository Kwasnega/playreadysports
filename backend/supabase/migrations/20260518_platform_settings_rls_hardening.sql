-- ============================================================
-- Platform Settings RLS Hardening
-- Goal: ONLY admin/super_admin users may read or write.
--       All other authenticated or anon users get zero rows.
-- ============================================================

-- ─── Step 1: Ensure RLS is enabled ───────────────────────────
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- ─── Step 2: Drop ALL existing policies on this table ────────
-- This removes the old permissive "public read" policy for
-- commission_rate that was granting anon/authenticated access.
DROP POLICY IF EXISTS platform_settings_select_admin  ON public.platform_settings;
DROP POLICY IF EXISTS platform_settings_update_admin  ON public.platform_settings;
DROP POLICY IF EXISTS platform_settings_insert_admin  ON public.platform_settings;
DROP POLICY IF EXISTS platform_settings_select_public ON public.platform_settings;
-- Also catch any generic named policies that may exist
DROP POLICY IF EXISTS "Admins can read platform_settings"       ON public.platform_settings;
DROP POLICY IF EXISTS "Admins can write platform_settings"      ON public.platform_settings;
-- Policy added by 20260515140000_escrow_release_and_admin_settings.sql — also a public bypass
DROP POLICY IF EXISTS platform_settings_select_payout_keys      ON public.platform_settings;
-- Drop this migration's own policies so it is safe to re-run (idempotent)
DROP POLICY IF EXISTS "platform_settings: admin select"         ON public.platform_settings;
DROP POLICY IF EXISTS "platform_settings: admin insert"         ON public.platform_settings;
DROP POLICY IF EXISTS "platform_settings: admin update"         ON public.platform_settings;
DROP POLICY IF EXISTS "platform_settings: admin delete"         ON public.platform_settings;

-- ─── Step 3: Revoke broad grants added by the old migration ──
-- anon should never touch this table. authenticated only gets
-- access through the explicit policies below.
REVOKE ALL ON public.platform_settings FROM anon;
REVOKE ALL ON public.platform_settings FROM authenticated;

-- Re-grant narrow SELECT/INSERT/UPDATE/DELETE (gated by policies).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_settings TO authenticated;

-- ─── Helper: reusable admin check ────────────────────────────
-- Checks EITHER:
--   a) profiles.role is 'admin' or 'super_admin'  (role-based)
--   b) profiles.is_admin = true                   (flag-based)
-- Using a helper function keeps the policy expressions short and
-- ensures the check is evaluated once per statement.
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND (
        role IN ('admin', 'super_admin')
        OR is_admin = true
      )
  );
$$;

-- Grant execute only to authenticated role
REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

-- ─── Step 4: SELECT — admin only ─────────────────────────────
-- Non-admins get an empty result set (not an error). This is
-- standard RLS behaviour: the USING predicate filters rows to
-- zero instead of raising a permission denied exception.
CREATE POLICY "platform_settings: admin select"
  ON public.platform_settings
  FOR SELECT
  TO authenticated
  USING ( public.is_platform_admin() );

-- ─── Step 5: INSERT — admin only ─────────────────────────────
CREATE POLICY "platform_settings: admin insert"
  ON public.platform_settings
  FOR INSERT
  TO authenticated
  WITH CHECK ( public.is_platform_admin() );

-- ─── Step 6: UPDATE — admin only ─────────────────────────────
CREATE POLICY "platform_settings: admin update"
  ON public.platform_settings
  FOR UPDATE
  TO authenticated
  USING      ( public.is_platform_admin() )
  WITH CHECK ( public.is_platform_admin() );

-- ─── Step 7: DELETE — admin only ─────────────────────────────
CREATE POLICY "platform_settings: admin delete"
  ON public.platform_settings
  FOR DELETE
  TO authenticated
  USING ( public.is_platform_admin() );

-- ─── IMPORTANT: edge functions ───────────────────────────────
-- Any Supabase Edge Function that needs to read commission_rate
-- should initialise its Supabase client with the SERVICE_ROLE
-- key (available as Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')).
-- Service role bypasses RLS entirely, so no policy is needed.
--
-- Example (in an Edge Function):
--   import { createClient } from '@supabase/supabase-js'
--   const adminClient = createClient(
--     Deno.env.get('SUPABASE_URL')!,
--     Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
--   )
--   const { data } = await adminClient
--     .from('platform_settings')
--     .select('value')
--     .eq('key', 'commission_rate')
--     .single()

-- ─── Verification queries (run manually after migration) ─────
-- As an anon or non-admin user you should get 0 rows:
--   SELECT * FROM public.platform_settings;
--
-- As an admin user (role = 'admin' or is_admin = true) you
-- should get all rows:
--   SELECT * FROM public.platform_settings;
