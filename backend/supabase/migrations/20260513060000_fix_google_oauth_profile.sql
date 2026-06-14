-- Fix handle_new_user to properly extract Google OAuth metadata
-- Google sends 'name' and 'picture' in raw_user_meta_data, not 'full_name'/'avatar_url'

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
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''), nullif(trim(new.raw_user_meta_data->>'name'),''), ''),
    coalesce(nullif(trim(new.raw_user_meta_data->>'avatar_url'),''), nullif(trim(new.raw_user_meta_data->>'picture'),''), ''),
    nullif(trim(coalesce(split_part(new.email, '@', 1), '')), ''),
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

-- Ensure the trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Add insert policy for profiles (needed for some edge cases / direct inserts)
DO $$
BEGIN
  CREATE POLICY profiles_insert_own ON public.profiles
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN
  -- policy already exists
END $$;

-- Re-grant execute permission
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
