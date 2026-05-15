-- Waitlist & Match Reminders support

-- 1. Add reminder_sent_flags to matches (tracks which reminders have been sent)
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS reminder_sent_flags jsonb DEFAULT '{}';

-- 2. Add waitlist_position to match_participants (null = not on waitlist)
ALTER TABLE public.match_participants ADD COLUMN IF NOT EXISTS waitlist_position int;

-- 3. Add 'waitlist' to participant status if not already in the enum
-- The existing enum is match_participant_status with values: active, left, kicked, banned
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'match_participant_status' AND e.enumlabel = 'waitlist'
  ) THEN
    ALTER TYPE public.match_participant_status ADD VALUE IF NOT EXISTS 'waitlist';
  END IF;
END $$;

-- 4. Add 'match_reminder' to notification_type enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'notification_type' AND e.enumlabel = 'match_reminder'
  ) THEN
    ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'match_reminder';
  END IF;
END $$;

-- 5. Add 'match_cancel' to notification_type enum (used by cancel-match)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'notification_type' AND e.enumlabel = 'match_cancel'
  ) THEN
    ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'match_cancel';
  END IF;
END $$;

-- 6. Index for quick waitlist lookups
CREATE INDEX IF NOT EXISTS idx_participants_waitlist
  ON public.match_participants(match_id, waitlist_position)
  WHERE waitlist_position IS NOT NULL;
