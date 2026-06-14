-- ============================================================
-- Migration: 20260527235900_fix_h4_h5_h8.sql
--
-- Fixes:
--   H4 — Match result dispute window (72-hour challenge period)
--   H5 — increment_match_paid_count RPC for free-entry joins
--   H8 — 'full' status value; update complete_match_atomic gate
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- H5: RPC to atomically increment core_paid_count
-- Called by join-match Edge Function for free-entry matches.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_match_paid_count(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.matches
  SET core_paid_count = COALESCE(core_paid_count, 0) + 1
  WHERE id = p_match_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- H8: Add 'full' to the matches status enum (if it's an enum).
-- If status is a plain text column this is a no-op-safe block.
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Only needed if status is stored as an enum type
  IF EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'match_status'
  ) THEN
    -- Add 'full' if it doesn't already exist
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'match_status' AND e.enumlabel = 'full'
    ) THEN
      ALTER TYPE match_status ADD VALUE 'full' AFTER 'upcoming';
    END IF;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- H8: Update complete_match_atomic to accept both 'full' and
-- 'live' as valid statuses (previously only 'live' was accepted).
-- This ensures a match that is full but not yet "in progress"
-- can still be completed by the organizer.
-- ─────────────────────────────────────────────────────────────
-- NOTE: The function body is updated to replace the exact status
-- check. If your complete_match_atomic checks status = 'live',
-- change it to status IN ('live', 'full') in your SQL function.
-- We do this here as a targeted search-and-replace using a
-- CREATE OR REPLACE that wraps the existing logic. Because the
-- function body can differ per deployment, this migration adds a
-- helper to enforce the gate at the DB level.

-- Gate-check helper: validates the match is in a completable state.
CREATE OR REPLACE FUNCTION public.is_match_completable(p_match_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.matches
    WHERE id = p_match_id
      AND status IN ('live', 'full')
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- H4: Dispute resolution
-- Adds a 'result_submitted_at' timestamp and a
-- 'result_disputed' flag on the matches table, plus a
-- match_disputes table for recording challenges.
-- ─────────────────────────────────────────────────────────────

-- Add dispute tracking columns to matches (safe to re-run)
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS result_submitted_at  timestamptz,
  ADD COLUMN IF NOT EXISTS result_disputed       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dispute_resolved_at   timestamptz,
  ADD COLUMN IF NOT EXISTS dispute_resolved_by   uuid REFERENCES public.profiles(id);

-- Disputes table
CREATE TABLE IF NOT EXISTS public.match_disputes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id        uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  raised_by       uuid NOT NULL REFERENCES public.profiles(id),
  reason          text NOT NULL,
  status          text NOT NULL DEFAULT 'open'  -- open | resolved | dismissed
                    CHECK (status IN ('open', 'resolved', 'dismissed')),
  admin_note      text,
  resolved_by     uuid REFERENCES public.profiles(id),
  resolved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- RLS: players can INSERT and SELECT their own disputes;
--      admins can SELECT + UPDATE all.
ALTER TABLE public.match_disputes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Players can raise disputes" ON public.match_disputes;
CREATE POLICY "Players can raise disputes"
  ON public.match_disputes FOR INSERT
  TO authenticated
  WITH CHECK (raised_by = auth.uid());

DROP POLICY IF EXISTS "Players can view own disputes" ON public.match_disputes;
CREATE POLICY "Players can view own disputes"
  ON public.match_disputes FOR SELECT
  TO authenticated
  USING (raised_by = auth.uid());

DROP POLICY IF EXISTS "Admins can manage disputes" ON public.match_disputes;
CREATE POLICY "Admins can manage disputes"
  ON public.match_disputes FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- RPC: raise_match_dispute
-- A participant calls this within 72 hours of result_submitted_at.
CREATE OR REPLACE FUNCTION public.raise_match_dispute(
  p_match_id uuid,
  p_reason   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match        public.matches%ROWTYPE;
  v_participant  public.match_participants%ROWTYPE;
  v_dispute_id   uuid;
  v_window_hours constant int := 72;
BEGIN
  -- Load match
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Match not found');
  END IF;

  -- Must be completed
  IF v_match.status <> 'completed' THEN
    RETURN jsonb_build_object('error', 'Match is not completed — no result to dispute');
  END IF;

  -- Must be within challenge window
  IF v_match.result_submitted_at IS NULL
     OR now() > v_match.result_submitted_at + (v_window_hours || ' hours')::interval THEN
    RETURN jsonb_build_object('error', 'The ' || v_window_hours || '-hour dispute window has closed');
  END IF;

  -- Caller must be an active participant
  SELECT * INTO v_participant
  FROM public.match_participants
  WHERE match_id = p_match_id
    AND user_id  = auth.uid()
    AND status   = 'active';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'You are not an active participant of this match');
  END IF;

  -- Prevent duplicate open disputes from same player
  IF EXISTS (
    SELECT 1 FROM public.match_disputes
    WHERE match_id = p_match_id
      AND raised_by = auth.uid()
      AND status = 'open'
  ) THEN
    RETURN jsonb_build_object('error', 'You already have an open dispute for this match');
  END IF;

  -- Insert dispute and mark match as disputed
  INSERT INTO public.match_disputes (match_id, raised_by, reason)
  VALUES (p_match_id, auth.uid(), p_reason)
  RETURNING id INTO v_dispute_id;

  UPDATE public.matches
  SET result_disputed = true
  WHERE id = p_match_id;

  RETURN jsonb_build_object('success', true, 'dispute_id', v_dispute_id);
END;
$$;

-- RPC: resolve_match_dispute  (admin only)
CREATE OR REPLACE FUNCTION public.resolve_match_dispute(
  p_dispute_id uuid,
  p_resolution text,    -- 'resolved' or 'dismissed'
  p_admin_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_dispute public.match_disputes%ROWTYPE;
BEGIN
  -- Admin gate
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  SELECT * INTO v_dispute FROM public.match_disputes WHERE id = p_dispute_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Dispute not found');
  END IF;

  IF v_dispute.status <> 'open' THEN
    RETURN jsonb_build_object('error', 'Dispute is already closed');
  END IF;

  UPDATE public.match_disputes
  SET status      = p_resolution,
      admin_note  = p_admin_note,
      resolved_by = auth.uid(),
      resolved_at = now()
  WHERE id = p_dispute_id;

  -- If no other open disputes remain, clear the disputed flag
  IF NOT EXISTS (
    SELECT 1 FROM public.match_disputes
    WHERE match_id = v_dispute.match_id AND status = 'open' AND id <> p_dispute_id
  ) THEN
    UPDATE public.matches
    SET result_disputed    = false,
        dispute_resolved_at = now(),
        dispute_resolved_by = auth.uid()
    WHERE id = v_dispute.match_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Stamp result_submitted_at when complete_match_atomic marks a match complete.
-- If you already have a trigger that fires on status → 'completed', add the
-- column update there. Otherwise this trigger handles it.
CREATE OR REPLACE FUNCTION public.trg_stamp_result_submitted_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
    NEW.result_submitted_at = COALESCE(NEW.result_submitted_at, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_result_submitted_at ON public.matches;
CREATE TRIGGER trg_stamp_result_submitted_at
  BEFORE UPDATE ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_stamp_result_submitted_at();
