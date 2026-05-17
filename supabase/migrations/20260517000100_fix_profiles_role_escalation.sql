-- Fix profiles.role self-escalation vulnerability.
-- Previously the UPDATE policy had no column restriction, allowing any user
-- to promote themselves to admin by updating their own profiles.role column.

-- Drop the existing permissive update policy
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

-- Re-create with a WITH CHECK that prevents role escalation.
-- Users can update any column EXCEPT role (role must stay unchanged on self-update).
CREATE POLICY "profiles_update_own_no_role_escalation"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
  );

-- Admins can update any profile (including role changes — intentional).
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "admins_can_update_any_profile"
  ON public.profiles
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
  );
