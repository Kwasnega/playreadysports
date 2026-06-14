-- ============================================================
-- FIX: Add unique constraint on match_participants (match_id, user_id)
-- Required for ON CONFLICT upserts in join-paid-match edge function
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'match_participants_match_id_user_id_key'
  ) THEN
    ALTER TABLE public.match_participants
      ADD CONSTRAINT match_participants_match_id_user_id_key
      UNIQUE (match_id, user_id);
  END IF;
END $$;
