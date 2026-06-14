-- ============================================================
-- FIX: participant_status enum missing 'active' value
-- ============================================================

-- The old schema may have created participant_status without 'active'.
-- We safely recreate it with all 4 values.

DO $$
DECLARE
  old_enum text;
BEGIN
  -- Find the actual enum type name used by match_participants.status
  SELECT t.typname INTO old_enum
  FROM pg_attribute a
  JOIN pg_type t ON a.atttypid = t.oid
  WHERE a.attrelid = 'public.match_participants'::regclass
    AND a.attname = 'status';

  IF old_enum IS NOT NULL THEN
    -- Step 1: rename old enum to backup
    EXECUTE format('ALTER TYPE %I RENAME TO %I', old_enum, old_enum || '_backup');

    -- Step 2: create new enum with all values
    CREATE TYPE public.participant_status AS ENUM ('pending', 'active', 'left', 'removed');

    -- Step 3: alter column to use new enum (cast via text)
    ALTER TABLE public.match_participants
      ALTER COLUMN status TYPE public.participant_status
      USING status::text::public.participant_status;

    -- Step 4: drop backup enum
    EXECUTE format('DROP TYPE %I', old_enum || '_backup');
  END IF;
END $$;
