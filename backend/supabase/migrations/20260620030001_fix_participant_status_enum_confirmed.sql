-- ============================================================
-- CRITICAL FIX: Ensure participant_status enum has ONLY valid values
-- Remove invalid legacy values like 'confirmed' from production
-- ============================================================

-- This policy references match_participants.status, so Postgres will not allow
-- the column type to change until the policy is temporarily removed.
DROP POLICY IF EXISTS match_votes_insert_policy ON public.match_votes;
DROP POLICY IF EXISTS match_ratings_insert_participant ON public.match_ratings;
DROP POLICY IF EXISTS msg_select_participants ON public.messages;
DROP POLICY IF EXISTS msg_insert_participants ON public.messages;

-- These trigger definitions reference match_participants.status, so they must
-- also be removed before changing the column type.
DROP TRIGGER IF EXISTS trg_update_participants_count_insert ON public.match_participants;
DROP TRIGGER IF EXISTS trg_update_participants_count_delete ON public.match_participants;
DROP TRIGGER IF EXISTS trg_update_participants_count_update ON public.match_participants;
DROP TRIGGER IF EXISTS trg_check_match_capacity ON public.match_participants;

-- Convert the column to text first so the old enum can be dropped safely.
ALTER TABLE public.match_participants
  ALTER COLUMN status DROP DEFAULT;

ALTER TABLE public.match_participants
  ALTER COLUMN status TYPE text
  USING (
    CASE status::text
      WHEN 'confirmed' THEN 'active'
      WHEN 'waitlisted' THEN 'pending'
      WHEN 'pending' THEN 'pending'
      WHEN 'active' THEN 'active'
      WHEN 'left' THEN 'left'
      WHEN 'removed' THEN 'removed'
      ELSE 'pending'
    END
  );

-- Drop and recreate the enum used by match_participants.status.
DROP TYPE IF EXISTS public.participant_status CASCADE;

-- Recreate the enum with the current valid values only.
CREATE TYPE public.participant_status AS ENUM ('pending', 'active', 'left', 'removed');

ALTER TABLE public.match_participants
  ALTER COLUMN status TYPE public.participant_status
  USING status::public.participant_status;

ALTER TABLE public.match_participants
  ALTER COLUMN status SET DEFAULT 'pending'::public.participant_status;

UPDATE public.match_participants
SET status = 'active'::public.participant_status
WHERE status::text = 'confirmed';

CREATE POLICY match_votes_insert_policy ON public.match_votes
  FOR INSERT TO authenticated
  WITH CHECK (
    voter_id = auth.uid()
    AND nominee_id <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.match_participants mp
      WHERE mp.match_id = match_votes.match_id
        AND mp.user_id = auth.uid()
        AND mp.status = 'active'
    )
    AND EXISTS (
      SELECT 1 FROM public.match_voting_windows mvw
      WHERE mvw.match_id = match_votes.match_id
        AND now() >= mvw.voting_opens_at
        AND now() <= mvw.voting_closes_at
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.match_votes mv
      WHERE mv.match_id = match_votes.match_id
        AND mv.voter_id = auth.uid()
        AND mv.vote_category = match_votes.vote_category
    )
  );

CREATE POLICY msg_select_participants ON public.messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.match_participants mp
      WHERE mp.match_id = messages.match_id
        AND mp.user_id = auth.uid()
        AND mp.status = 'active'
    )
  );

CREATE POLICY msg_insert_participants ON public.messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.match_participants mp
      WHERE mp.match_id = messages.match_id
        AND mp.user_id = auth.uid()
        AND mp.status = 'active'
    )
  );

CREATE POLICY match_ratings_insert_participant ON public.match_ratings
  FOR INSERT WITH CHECK (
    voter_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.match_participants mp
      WHERE mp.match_id = match_ratings.match_id
        AND mp.user_id = auth.uid()
        AND mp.status = 'active'
    )
  );

CREATE OR REPLACE FUNCTION public.update_match_participants_count()
RETURNS trigger AS $$
BEGIN
  UPDATE public.matches
  SET current_participants_count = (
    SELECT COUNT(*) FROM public.match_participants
    WHERE match_id = COALESCE(NEW.match_id, OLD.match_id)
      AND status = 'active'
  )
  WHERE id = COALESCE(NEW.match_id, OLD.match_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_participants_count_insert
  AFTER INSERT ON public.match_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.update_match_participants_count();

CREATE TRIGGER trg_update_participants_count_delete
  AFTER DELETE ON public.match_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.update_match_participants_count();

CREATE TRIGGER trg_update_participants_count_update
  AFTER UPDATE ON public.match_participants
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.update_match_participants_count();

CREATE TRIGGER trg_check_match_capacity
  BEFORE INSERT OR UPDATE ON public.match_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.check_match_capacity();
