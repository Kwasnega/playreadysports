-- ============================================================
-- Fix signup 500 error: handle_new_user() inserts into dropped user_roles table
--
-- Root cause:
--   20260518_database_hardening.sql dropped public.user_roles (role is now on profiles).
--   handle_new_user() still does INSERT INTO public.user_roles → table doesn't exist → 500.
--
-- Fix:
--   A. Update DEFAULT to 'player' (valid per CHECK constraint)
--   B. Remove dead user_roles INSERT from handle_new_user()
--   C. Explicitly set role = 'player' (or turf_owner from metadata) in profiles INSERT
-- ============================================================

-- 1. Fix the default value
ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'player';

-- 2. Fix existing NULL/invalid roles
UPDATE public.profiles
SET role = 'player'
WHERE role IS NULL OR role = 'user' OR role NOT IN ('player', 'turf_owner', 'admin', 'super_admin');

-- 3. Recreate handle_new_user WITHOUT the dead user_roles reference
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _role public.app_role;
  _skill public.skill_level;
BEGIN
  _skill := case new.raw_user_meta_data->>'skill_level'
    when 'intermediate' then 'intermediate'::public.skill_level
    when 'advanced' then 'advanced'::public.skill_level
    when 'pro' then 'pro'::public.skill_level
    else 'beginner'::public.skill_level
  end;

  _role := case
    when (new.raw_user_meta_data->>'role') = 'turf_owner' then 'turf_owner'::public.app_role
    else 'player'::public.app_role
  end;

  INSERT INTO public.profiles (
    id, full_name, avatar_url, username, phone_number, location, bio,
    skill_level, preferred_sports, total_matches_played, total_wins,
    reputation_score, is_verified, is_banned, role
  )
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', ''),
    nullif(trim(coalesce(split_part(new.email, '@', 1), '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'phone_number', '')), ''),
    coalesce(new.raw_user_meta_data->>'location', ''),
    coalesce(new.raw_user_meta_data->>'bio', ''),
    _skill,
    ARRAY[]::text[],
    0, 0, 5.0, false, false, _role
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    avatar_url = EXCLUDED.avatar_url,
    role = EXCLUDED.role;

  RETURN new;
END;
$$;

-- 4. Recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. Grant execute (needed for RLS context)
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
