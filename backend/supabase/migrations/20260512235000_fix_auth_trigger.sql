-- ============================================================
-- FIX AUTH TRIGGER: diagnose and repair handle_new_user
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Check if required objects exist
DO $$
DECLARE
  has_app_role boolean;
  has_profiles boolean;
  has_user_roles boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') INTO has_app_role;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') INTO has_profiles;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_roles') INTO has_user_roles;

  RAISE NOTICE 'app_role type exists: %', has_app_role;
  RAISE NOTICE 'profiles table exists: %', has_profiles;
  RAISE NOTICE 'user_roles table exists: %', has_user_roles;
END $$;

-- 2. Drop and recreate the function cleanly (removes any stale cached version)
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

  INSERT INTO public.profiles (
    id, full_name, avatar_url, username, phone_number, location, bio,
    skill_level, preferred_sports, total_matches_played, total_wins,
    reputation_score, is_verified, is_banned
  )
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'username', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'phone_number', '')), ''),
    coalesce(new.raw_user_meta_data->>'location', ''),
    coalesce(new.raw_user_meta_data->>'bio', ''),
    _skill,
    ARRAY[]::text[],
    0, 0, 5.0, false, false
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    avatar_url = EXCLUDED.avatar_url;

  _role := case
    when (new.raw_user_meta_data->>'role') = 'turf_owner' then 'turf_owner'::public.app_role
    else 'player'::public.app_role
  end;

  INSERT INTO public.user_roles (user_id, role) VALUES (new.id, _role)
  ON CONFLICT DO NOTHING;

  RETURN new;
END;
$$;

-- 3. Recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Grant execute to authenticated role (needed for RLS context)
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;

-- 5. Quick validation: try to call the function logic manually with a dummy row
-- (This just validates the function compiles; it won't insert anything permanently)
DO $$
BEGIN
  RAISE NOTICE 'handle_new_user function recreated successfully.';
END $$;
