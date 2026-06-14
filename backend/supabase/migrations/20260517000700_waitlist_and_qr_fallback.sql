-- Phase 8.1: Waitlist / Auto-promote + QR Fallback (Phase 2.8)

-- ─────────────────────────────────────────
-- 1. Add waitlist slot_type support
--    match_participants.slot_type already exists as enum.
--    We need 'waitlist' added if not present.
-- ─────────────────────────────────────────
DO $$
BEGIN
  -- Add 'waitlist' to the slot_type enum if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'waitlist'
      AND enumtypid = 'public.participant_slot_type'::regtype
  ) THEN
    ALTER TYPE public.participant_slot_type ADD VALUE 'waitlist';
  END IF;
END $$;

-- Waitlist position column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'match_participants' AND column_name = 'waitlist_position'
  ) THEN
    ALTER TABLE public.match_participants ADD COLUMN waitlist_position INTEGER;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_match_participants_waitlist
  ON public.match_participants (match_id, waitlist_position)
  WHERE slot_type = 'waitlist' AND status = 'active';


-- ─────────────────────────────────────────
-- 2. join_waitlist RPC — atomic safe waitlist insert
-- ─────────────────────────────────────────
DROP FUNCTION IF EXISTS public.join_waitlist(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.join_waitlist(
  p_match_id uuid,
  p_user_id  uuid,
  p_team     text DEFAULT 'unassigned'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match     record;
  v_position  integer;
BEGIN
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Match not found');
  END IF;

  IF v_match.status <> 'upcoming' THEN
    RETURN jsonb_build_object('error', 'Match not open');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.match_participants
    WHERE match_id = p_match_id AND user_id = p_user_id
  ) THEN
    RETURN jsonb_build_object('error', 'Already joined or waitlisted');
  END IF;

  SELECT COALESCE(MAX(waitlist_position), 0) + 1 INTO v_position
  FROM public.match_participants
  WHERE match_id = p_match_id AND slot_type = 'waitlist';

  INSERT INTO public.match_participants (
    match_id, user_id, slot_type, team, status, payment_status, waitlist_position
  )
  VALUES (
    p_match_id, p_user_id, 'waitlist', p_team::participant_team, 'active', 'pending', v_position
  );

  RETURN jsonb_build_object('success', true, 'position', v_position);
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_waitlist(uuid, uuid, text) TO authenticated;


-- ─────────────────────────────────────────
-- 3. promote_from_waitlist RPC — called when a core slot opens (player leaves)
--    Promotes position #1 from waitlist to core, re-sequences remaining.
-- ─────────────────────────────────────────
DROP FUNCTION IF EXISTS public.promote_from_waitlist(uuid);

CREATE OR REPLACE FUNCTION public.promote_from_waitlist(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match       record;
  v_core_count  integer;
  v_max_core    integer;
  v_first       record;
BEGIN
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('promoted', false); END IF;

  v_max_core := COALESCE(v_match.max_core_players, v_match.players_per_side, 10);

  SELECT COUNT(*) INTO v_core_count
  FROM public.match_participants
  WHERE match_id = p_match_id AND slot_type = 'core' AND status = 'active';

  IF v_core_count >= v_max_core THEN
    RETURN jsonb_build_object('promoted', false, 'reason', 'match_still_full');
  END IF;

  -- Get the first waitlisted participant
  SELECT * INTO v_first
  FROM public.match_participants
  WHERE match_id = p_match_id
    AND slot_type = 'waitlist'
    AND status = 'active'
  ORDER BY waitlist_position ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('promoted', false, 'reason', 'waitlist_empty');
  END IF;

  -- Promote to core
  UPDATE public.match_participants
  SET slot_type = 'core', waitlist_position = NULL
  WHERE id = v_first.id;

  -- Re-sequence remaining waitlist
  UPDATE public.match_participants
  SET waitlist_position = waitlist_position - 1
  WHERE match_id = p_match_id
    AND slot_type = 'waitlist'
    AND status = 'active'
    AND waitlist_position > v_first.waitlist_position;

  -- Notify promoted player
  INSERT INTO public.notifications (user_id, title, body, type, data)
  VALUES (
    v_first.user_id,
    'You''ve been promoted! 🎉',
    'A spot opened up — you''re now confirmed for the match.',
    'match_join',
    jsonb_build_object('match_id', p_match_id)
  );

  RETURN jsonb_build_object('promoted', true, 'user_id', v_first.user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.promote_from_waitlist(uuid) TO service_role;


-- ─────────────────────────────────────────
-- 4. Trigger: auto-promote from waitlist when a core participant leaves
-- ─────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_auto_promote_waitlist ON public.match_participants;
DROP FUNCTION IF EXISTS public.fn_auto_promote_on_leave();

CREATE OR REPLACE FUNCTION public.fn_auto_promote_on_leave()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- A core active participant became inactive/left — try to promote from waitlist
  IF OLD.slot_type = 'core' AND OLD.status = 'active'
     AND (NEW.status <> 'active' OR TG_OP = 'DELETE') THEN
    PERFORM public.promote_from_waitlist(COALESCE(OLD.match_id, NEW.match_id));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_auto_promote_waitlist
  AFTER UPDATE OR DELETE ON public.match_participants
  FOR EACH ROW EXECUTE FUNCTION public.fn_auto_promote_on_leave();


-- ─────────────────────────────────────────
-- 5. QR Fallback (Phase 2.8)
--    Allow paid participants to request QR from organizer via notification.
--    Store which users have been granted QR display permission.
-- ─────────────────────────────────────────
DO $$
BEGIN
  -- Flag to track if a participant has been granted QR display access by organizer
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'match_participants' AND column_name = 'qr_display_granted'
  ) THEN
    ALTER TABLE public.match_participants
      ADD COLUMN qr_display_granted BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- RPC: request_qr_access — paid participant requests QR from organizer
DROP FUNCTION IF EXISTS public.request_qr_access(uuid, uuid);

CREATE OR REPLACE FUNCTION public.request_qr_access(
  p_match_id uuid,
  p_user_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participant record;
  v_match       record;
BEGIN
  SELECT * INTO v_participant
  FROM public.match_participants
  WHERE match_id = p_match_id AND user_id = p_user_id AND status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Not a participant');
  END IF;

  IF v_participant.payment_status <> 'paid' THEN
    RETURN jsonb_build_object('error', 'Only paid participants can request QR access');
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;

  -- Notify organizer
  INSERT INTO public.notifications (user_id, title, body, type, data)
  VALUES (
    v_match.organizer_id,
    'QR Access Request',
    (
      SELECT COALESCE(full_name, username, 'A player')
      FROM public.profiles WHERE id = p_user_id
    ) || ' is requesting QR code access for match ' || v_match.join_code,
    'qr_access_request',
    jsonb_build_object(
      'match_id', p_match_id,
      'requester_id', p_user_id,
      'join_code', v_match.join_code
    )
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_qr_access(uuid, uuid) TO authenticated;

-- RPC: grant_qr_access — organizer grants QR display to a participant
DROP FUNCTION IF EXISTS public.grant_qr_access(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.grant_qr_access(
  p_match_id    uuid,
  p_organizer_id uuid,
  p_user_id     uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match record;
BEGIN
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Match not found');
  END IF;

  IF v_match.organizer_id <> p_organizer_id THEN
    RETURN jsonb_build_object('error', 'Not the organizer');
  END IF;

  UPDATE public.match_participants
  SET qr_display_granted = true
  WHERE match_id = p_match_id AND user_id = p_user_id AND status = 'active';

  -- Notify the requester
  INSERT INTO public.notifications (user_id, title, body, type, data)
  VALUES (
    p_user_id,
    'QR Code Access Granted',
    'The organizer has granted you QR code access for this match.',
    'qr_access_granted',
    jsonb_build_object('match_id', p_match_id, 'join_code', v_match.join_code)
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.grant_qr_access(uuid, uuid, uuid) TO authenticated;
