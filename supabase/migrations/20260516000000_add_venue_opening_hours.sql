-- Add opening_hours to venues
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS opening_hours text;
