-- ============================================================
-- Phase 2.1: Fix profiles.role self-escalation
-- Prevents any user from updating their own role to 'admin'.
-- ============================================================

-- Replace the existing UPDATE policy with one that prevents role changes
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND (
      -- Allow updates only if role is unchanged (prevents self-escalation)
      role = (SELECT role FROM public.profiles WHERE id = auth.uid())
      OR
      -- Allow null → default role transitions
      role IS NOT DISTINCT FROM (SELECT role FROM public.profiles WHERE id = auth.uid())
    )
  );

-- Ensure admins can still update any profile (including role changes)
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND (role IN ('admin','super_admin') OR is_admin = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND (role IN ('admin','super_admin') OR is_admin = true)
    )
  );
