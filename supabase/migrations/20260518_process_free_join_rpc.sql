-- ============================================================
-- Phase 3.2: Atomic free join RPC (prevents slot race condition)
-- Wraps capacity check + participant insert in a single
-- SELECT ... FOR UPDATE transaction.
-- ============================================================

DROP FUNCTION IF EXISTS public.process_free_join(uuid, uuid, text);
CREATE OR REPLACE FUNCTION public.process_free_join(
  p_match_id uuid,
  p_user_id  uuid,
  p_team     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match       RECORD;
  v_max_core    int;
  v_current     int;
  v_team        text;
BEGIN
  -- Lock the match row
  SELECT id, max_core_players, status, match_type
  INTO v_match
  FROM public.matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'match_not_found');
  END IF;

  IF v_match.status != 'upcoming' THEN
    RETURN jsonb_build_object('success', false, 'error', 'match_not_upcoming');
  END IF;

  -- Determine max core capacity
  v_max_core := COALESCE(v_match.max_core_players, 10);

  -- Count current paid + active core participants
  SELECT COUNT(*) INTO v_current
  FROM public.match_participants
  WHERE match_id = p_match_id
    AND status = 'active'
    AND is_substitute = false;

  IF v_current >= v_max_core THEN
    RETURN jsonb_build_object('success', false, 'error', 'match_full');
  END IF;

  -- Check user not already in match
  IF EXISTS (
    SELECT 1 FROM public.match_participants
    WHERE match_id = p_match_id AND user_id = p_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_joined');
  END IF;

  -- Assign team if not provided (auto-balance)
  IF p_team IS NULL OR p_team = '__auto__' THEN
    SELECT team INTO v_team FROM public.match_participants
    WHERE match_id = p_match_id AND status = 'active'
    GROUP BY team ORDER BY COUNT(*) DESC LIMIT 1;
    IF v_team IS NULL THEN
      v_team := 'A';
    ELSE
      v_team := CASE WHEN v_team = 'A' THEN 'B' ELSE 'A' END;
    END IF;
  ELSE
    v_team := p_team;
  END IF;

  -- Insert participant
  INSERT INTO public.match_participants (match_id, user_id, team, status, payment_status, is_substitute)
  VALUES (p_match_id, p_user_id, v_team, 'active', 'free', false);

  RETURN jsonb_build_object('success', true, 'team', v_team);
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_free_join(uuid, uuid, text)
  TO authenticated, service_role;
