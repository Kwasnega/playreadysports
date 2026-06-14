-- Phase 4.12: Consolidate dual role system
-- profiles.role is the single source of truth.
-- user_roles table is deprecated and synced from profiles.role going forward.
-- All RLS policies reference profiles.role exclusively.

-- ─────────────────────────────────────────
-- 1. Sync user_roles → profiles.role for any discrepancies
--    (profiles.role wins — it's what the app reads)
-- ─────────────────────────────────────────
UPDATE public.profiles p
SET role = ur.role::text
FROM public.user_roles ur
WHERE ur.user_id = p.id
  AND ur.role IS NOT NULL
  AND p.role IS DISTINCT FROM ur.role::text
  AND p.role = 'player';  -- only promote, never demote admins

-- ─────────────────────────────────────────
-- 2. Create a trigger to keep user_roles in sync with profiles.role changes
--    (so any legacy code still reading user_roles gets correct values)
-- ─────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_sync_user_roles ON public.profiles;
DROP FUNCTION IF EXISTS public.fn_sync_user_roles_from_profile();

CREATE OR REPLACE FUNCTION public.fn_sync_user_roles_from_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Upsert into user_roles to mirror the profiles.role change
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, NEW.role::app_role)
  ON CONFLICT (user_id) DO UPDATE
    SET role = EXCLUDED.role;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Don't fail profile update if user_roles sync fails
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_user_roles
  AFTER UPDATE OF role ON public.profiles
  FOR EACH ROW
  WHEN (OLD.role IS DISTINCT FROM NEW.role)
  EXECUTE FUNCTION public.fn_sync_user_roles_from_profile();

-- ─────────────────────────────────────────
-- 3. Helper function for RLS — avoids per-row subquery overhead
--    Used in policies: is_admin_user() instead of inline subquery
-- ─────────────────────────────────────────
DROP FUNCTION IF EXISTS public.is_admin_user();

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO anon;
