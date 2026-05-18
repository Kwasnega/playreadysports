-- ============================================================
-- platform_settings RLS Verification
-- Run each block independently in the Supabase SQL Editor.
-- Replace the UUIDs with real user IDs from your auth.users table.
--
--   Non-admin user : any user whose profiles.is_admin IS NOT true
--                    and role NOT IN ('admin','super_admin')
--   Admin user     : any user whose profiles.is_admin = true
--                    OR role IN ('admin','super_admin')
-- ============================================================

-- ─── How to find test user IDs ───────────────────────────────
-- Run this first to pick your test subjects:
SELECT au.id, p.role, p.is_admin, au.email
FROM auth.users au
JOIN public.profiles p ON p.id = au.id
ORDER BY p.role;


-- ════════════════════════════════════════════════════════════
-- TEST 1: Non-admin SELECT → must return 0 rows (not an error)
-- ════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_uid  uuid := 'REPLACE_WITH_NON_ADMIN_USER_UUID';
  v_rows int;
BEGIN
  -- Simulate an authenticated, non-admin session
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  SELECT COUNT(*) INTO v_rows FROM public.platform_settings;

  IF v_rows = 0 THEN
    RAISE NOTICE 'PASS  TEST 1: non-admin SELECT returns 0 rows';
  ELSE
    RAISE WARNING 'FAIL  TEST 1: non-admin SELECT returned % rows — RLS is not blocking!', v_rows;
  END IF;

  RESET ROLE;
END $$;


-- ════════════════════════════════════════════════════════════
-- TEST 2: Non-admin UPDATE → must affect 0 rows (silent, no error)
-- RLS USING filters to 0 rows before the update runs.
-- ════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_uid      uuid := 'REPLACE_WITH_NON_ADMIN_USER_UUID';
  v_affected int;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  UPDATE public.platform_settings
  SET value = 'hacked'
  WHERE key = 'commission_rate';
  GET DIAGNOSTICS v_affected = ROW_COUNT;

  IF v_affected = 0 THEN
    RAISE NOTICE 'PASS  TEST 2: non-admin UPDATE affected 0 rows';
  ELSE
    RAISE WARNING 'FAIL  TEST 2: non-admin UPDATE affected % rows!', v_affected;
  END IF;

  RESET ROLE;
END $$;


-- ════════════════════════════════════════════════════════════
-- TEST 3: Non-admin INSERT → must raise permission denied
-- WITH CHECK on the policy rejects the new row.
-- ════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_uid uuid := 'REPLACE_WITH_NON_ADMIN_USER_UUID';
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  BEGIN
    INSERT INTO public.platform_settings (key, value, description)
    VALUES ('evil_key', 'evil_value', 'injected by non-admin');
    RAISE WARNING 'FAIL  TEST 3: non-admin INSERT succeeded — it should have been blocked!';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    RAISE NOTICE 'PASS  TEST 3: non-admin INSERT correctly blocked (%)' , SQLERRM;
  END;

  RESET ROLE;
END $$;


-- ════════════════════════════════════════════════════════════
-- TEST 4: Non-admin DELETE → must affect 0 rows (silent)
-- ════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_uid      uuid := 'REPLACE_WITH_NON_ADMIN_USER_UUID';
  v_affected int;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  DELETE FROM public.platform_settings WHERE key = 'commission_rate';
  GET DIAGNOSTICS v_affected = ROW_COUNT;

  IF v_affected = 0 THEN
    RAISE NOTICE 'PASS  TEST 4: non-admin DELETE affected 0 rows';
  ELSE
    RAISE WARNING 'FAIL  TEST 4: non-admin DELETE removed % rows!', v_affected;
  END IF;

  RESET ROLE;
END $$;


-- ════════════════════════════════════════════════════════════
-- TEST 5: Admin SELECT → must return all rows
-- ════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_uid  uuid := 'REPLACE_WITH_ADMIN_USER_UUID';
  v_rows int;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  SELECT COUNT(*) INTO v_rows FROM public.platform_settings;

  IF v_rows > 0 THEN
    RAISE NOTICE 'PASS  TEST 5: admin SELECT returned % rows', v_rows;
  ELSE
    RAISE WARNING 'FAIL  TEST 5: admin SELECT returned 0 rows — check is_admin/role on this user';
  END IF;

  RESET ROLE;
END $$;


-- ════════════════════════════════════════════════════════════
-- TEST 6: Admin UPDATE → must affect rows
-- ════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_uid        uuid := 'REPLACE_WITH_ADMIN_USER_UUID';
  v_affected   int;
  v_orig_value text;
BEGIN
  -- Snapshot original value
  SELECT value INTO v_orig_value FROM public.platform_settings
  WHERE key = 'commission_rate';

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  UPDATE public.platform_settings
  SET value = '0.05'               -- idempotent — same as default
  WHERE key = 'commission_rate';
  GET DIAGNOSTICS v_affected = ROW_COUNT;

  RESET ROLE;

  IF v_affected > 0 THEN
    RAISE NOTICE 'PASS  TEST 6: admin UPDATE affected % rows', v_affected;
  ELSE
    RAISE WARNING 'FAIL  TEST 6: admin UPDATE affected 0 rows — check admin policy';
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════
-- TEST 7: Verify no leftover permissive policies
-- Expected: only the 4 admin-only policies should exist.
-- ════════════════════════════════════════════════════════════
SELECT
  policyname,
  cmd,
  permissive,
  roles,
  qual::text  AS using_expr
FROM pg_policies
WHERE tablename = 'platform_settings'
  AND schemaname = 'public'
ORDER BY policyname;
-- Expected rows:
--   "platform_settings: admin delete"
--   "platform_settings: admin insert"
--   "platform_settings: admin select"
--   "platform_settings: admin update"
-- Any other row = a leftover bypass policy.


-- ════════════════════════════════════════════════════════════
-- TEST 8: Verify the complete_match_atomic RPC still works
-- (It reads platform_settings via SECURITY DEFINER — bypasses RLS correctly)
-- ════════════════════════════════════════════════════════════
-- This is intentional: the function runs as postgres (BYPASSRLS).
-- It reads commission_rate and organizer_incentive_amount internally
-- and never exposes the raw table rows to the caller.
-- Verify it's SECURITY DEFINER:
SELECT proname, prosecdef
FROM pg_proc
WHERE proname IN ('complete_match_atomic', 'get_commission_rate', 'is_platform_admin')
  AND pronamespace = 'public'::regnamespace;
-- prosecdef = true means SECURITY DEFINER (correct — RLS bypass is intentional)
-- prosecdef = false means SECURITY INVOKER (RLS applies — commission_rate read will fail for non-admins)
