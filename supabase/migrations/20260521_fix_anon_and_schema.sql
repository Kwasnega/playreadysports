-- Fix anon SELECT policies for public browsing + add missing schema pieces

-- 1. Allow anon to read public profiles (needed for organizer display)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
    AND policyname = 'profiles_select_anon'
  ) THEN
    CREATE POLICY profiles_select_anon
      ON public.profiles
      FOR SELECT
      USING (true);
  END IF;
END
$$;

-- 2. Allow anon to read public matches
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'matches'
    AND policyname = 'matches_select_public_anon'
  ) THEN
    CREATE POLICY matches_select_public_anon
      ON public.matches
      FOR SELECT
      USING (match_type = 'public');
  END IF;
END
$$;

-- 3. Allow anon to read venues (needed for public match browsing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'venues'
    AND policyname = 'venues_select_anon'
  ) THEN
    CREATE POLICY venues_select_anon
      ON public.venues
      FOR SELECT
      USING (true);
  END IF;
END
$$;

-- 4. Add no_show column to match_participants
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'match_participants'
      AND column_name = 'no_show'
  ) THEN
    ALTER TABLE public.match_participants
    ADD COLUMN no_show BOOLEAN NOT NULL DEFAULT false;
  END IF;
END
$$;

-- 5. Create process_free_join RPC (used by join-free-match edge function)
CREATE OR REPLACE FUNCTION public.process_free_join(
    p_match_id UUID,
    p_user_id UUID,
    p_team TEXT DEFAULT 'unassigned'
)
RETURNS JSON AS $$
DECLARE
    v_max_core INTEGER;
    v_current_core INTEGER;
    v_exists INTEGER;
    v_participant_id UUID;
    v_team_enum public.team_side;
BEGIN
    -- Validate team enum
    IF p_team = 'reds' THEN v_team_enum := 'reds';
    ELSIF p_team = 'blues' THEN v_team_enum := 'blues';
    ELSE v_team_enum := 'unassigned';
    END IF;

    -- Lock match row
    SELECT COALESCE(max_core_players, players_per_side, 10)
    INTO v_max_core
    FROM public.matches
    WHERE id = p_match_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Match not found');
    END IF;

    -- Check duplicate
    SELECT COUNT(*) INTO v_exists
    FROM public.match_participants
    WHERE match_id = p_match_id AND user_id = p_user_id AND status = 'active';

    IF v_exists > 0 THEN
        RETURN json_build_object('success', false, 'error', 'Already joined');
    END IF;

    -- Count current core
    SELECT COUNT(*) INTO v_current_core
    FROM public.match_participants
    WHERE match_id = p_match_id AND status = 'active' AND slot_type = 'core';

    IF v_current_core >= v_max_core THEN
        RETURN json_build_object('success', false, 'error', 'Match is full');
    END IF;

    -- Insert participant
    INSERT INTO public.match_participants (
        match_id, user_id, team, slot_type, payment_status, status
    ) VALUES (
        p_match_id, p_user_id, v_team_enum, 'core'::public.slot_type,
        'none'::public.payment_status, 'active'::public.participant_status
    )
    RETURNING id INTO v_participant_id;

    RETURN json_build_object('success', true, 'participant_id', v_participant_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
