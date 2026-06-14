-- ============================================================
-- FIX: Add missing columns to existing match_participants table
-- ============================================================

-- Add slot_type enum if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'slot_type') THEN
    CREATE TYPE public.slot_type AS ENUM ('core', 'spare');
  END IF;
END $$;

-- Add missing columns to match_participants
ALTER TABLE public.match_participants
  ADD COLUMN IF NOT EXISTS slot_type public.slot_type DEFAULT 'core',
  ADD COLUMN IF NOT EXISTS payment_reference text;

-- Ensure the trigger function can handle the column
-- (recalc_core_paid already references slot_type, now it will work)
