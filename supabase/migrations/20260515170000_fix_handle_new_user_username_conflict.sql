-- Fix: handle_new_user trigger fails on Google OAuth signup when username (from email prefix)
-- already exists due to UNIQUE constraint. Solution: append random suffix on conflict.
-- Also ensure we have an INSERT policy so the trigger (SECURITY DEFINER) can insert.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _role public.app_role;
  _skill public.skill_level;
  _username text;
  _base_username text;
  _attempts int := 0;
BEGIN
  _skill := case new.raw_user_meta_data->>'skill_level'
    when 'intermediate' then 'intermediate'::public.skill_level
    when 'advanced' then 'advanced'::public.skill_level
    when 'pro' then 'pro'::public.skill_level
    else 'beginner'::public.skill_level
  end;

  -- Generate a unique username from email prefix
  _base_username := lower(trim(coalesce(split_part(new.email, '@', 1), 'user')));
  _base_username := regexp_replace(_base_username, '[^a-z0-9_]', '', 'g');
  IF _base_username = '' THEN
    _base_username := 'player';
  END IF;

  _username := _base_username;

  -- If username taken, append random digits
  LOOP
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE username = _username);
    _attempts := _attempts + 1;
    _username := _base_username || '_' || floor(random() * 9000 + 1000)::int::text;
    EXIT WHEN _attempts > 5;
  END LOOP;

  INSERT INTO public.profiles (
    id, full_name, avatar_url, username, email, phone_number, location, bio,
    skill_level, preferred_sports, total_matches_played, total_wins,
    reputation_score, is_verified, is_banned
  )
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', ''),
    _username,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data->>'phone_number', '')), ''),
    coalesce(new.raw_user_meta_data->>'location', ''),
    coalesce(new.raw_user_meta_data->>'bio', ''),
    _skill,
    ARRAY[]::text[],
    0, 0, 5.0, false, false
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    avatar_url = EXCLUDED.avatar_url,
    email = EXCLUDED.email;

  _role := case
    when (new.raw_user_meta_data->>'role') = 'turf_owner' then 'turf_owner'::public.app_role
    else 'player'::public.app_role
  end;

  INSERT INTO public.user_roles (user_id, role) VALUES (new.id, _role)
  ON CONFLICT DO NOTHING;

  RETURN new;
END;
$$;

-- Ensure profiles has an INSERT policy for the trigger (SECURITY DEFINER bypasses RLS,
-- but if service_role isn't used, we need this)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_insert_trigger'
  ) THEN
    CREATE POLICY profiles_insert_trigger ON public.profiles
      FOR INSERT WITH CHECK (true);
  END IF;
END $$;
