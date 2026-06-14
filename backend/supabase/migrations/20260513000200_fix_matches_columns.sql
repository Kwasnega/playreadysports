-- ============================================================
-- FIX: Add missing columns to existing matches table
-- ============================================================

-- Create missing enums first
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'match_type') THEN
    CREATE TYPE public.match_type AS ENUM ('public', 'private');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'match_mode') THEN
    CREATE TYPE public.match_mode AS ENUM ('two_team', 'gala');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'match_format') THEN
    CREATE TYPE public.match_format AS ENUM ('5v5', '6v6', '7v7', '8v8', '9v9', '10v10', '11v11');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'escrow_status') THEN
    CREATE TYPE public.escrow_status AS ENUM ('none', 'holding', 'released', 'refunded');
  END IF;
END $$;

-- Add all missing columns to matches
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS match_type public.match_type DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS match_mode public.match_mode DEFAULT 'two_team',
  ADD COLUMN IF NOT EXISTS format public.match_format DEFAULT '6v6',
  ADD COLUMN IF NOT EXISTS players_per_side int,
  ADD COLUMN IF NOT EXISTS max_core_players int,
  ADD COLUMN IF NOT EXISTS max_spare_players int DEFAULT 2,
  ADD COLUMN IF NOT EXISTS duration_minutes int DEFAULT 60,
  ADD COLUMN IF NOT EXISTS entry_fee decimal(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS escrow_status public.escrow_status DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS core_paid_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_public bool DEFAULT true,
  ADD COLUMN IF NOT EXISTS join_code_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS notes text;

-- Populate derived columns from old max_players
UPDATE public.matches SET max_core_players = max_players WHERE max_core_players IS NULL AND max_players IS NOT NULL;
UPDATE public.matches SET players_per_side = 6 WHERE players_per_side IS NULL;

-- Now the RLS policies that reference match_type will work
