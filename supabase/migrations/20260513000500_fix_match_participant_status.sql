-- ============================================================
-- FIX: The enum is named match_participant_status, not participant_status
-- ============================================================

DO $$
BEGIN
  -- Check actual enum name used by match_participants.status
  IF EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'match_participant_status'
  ) THEN
    -- Add missing values to match_participant_status
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'match_participant_status' AND e.enumlabel = 'active'
    ) THEN
      ALTER TYPE public.match_participant_status ADD VALUE 'active';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'match_participant_status' AND e.enumlabel = 'left'
    ) THEN
      ALTER TYPE public.match_participant_status ADD VALUE 'left';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'match_participant_status' AND e.enumlabel = 'removed'
    ) THEN
      ALTER TYPE public.match_participant_status ADD VALUE 'removed';
    END IF;
  END IF;

  -- Also fix participant_status if it exists separately
  IF EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'participant_status'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'participant_status' AND e.enumlabel = 'active'
    ) THEN
      ALTER TYPE public.participant_status ADD VALUE 'active';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'participant_status' AND e.enumlabel = 'left'
    ) THEN
      ALTER TYPE public.participant_status ADD VALUE 'left';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'participant_status' AND e.enumlabel = 'removed'
    ) THEN
      ALTER TYPE public.participant_status ADD VALUE 'removed';
    END IF;
  END IF;
END $$;
