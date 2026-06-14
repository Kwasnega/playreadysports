-- Add organizer_venue_fee column to matches table
-- This stores the venue cost paid by the organizer when creating a free match.

ALTER TABLE public.matches
ADD COLUMN IF NOT EXISTS organizer_venue_fee NUMERIC(10, 2) NOT NULL DEFAULT 0;
