-- ============================================================
-- Venue Operating Hours — structured open_time / close_time
--
-- Adds TIME columns so turf owners can set operating windows.
-- The existing free-text opening_hours column is kept for display.
-- ============================================================

ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS open_time TIME,
  ADD COLUMN IF NOT EXISTS close_time TIME;

COMMENT ON COLUMN public.venues.open_time IS 'Structured opening time (HH:MM) for the venue';
COMMENT ON COLUMN public.venues.close_time IS 'Structured closing time (HH:MM) for the venue';

-- Back-fill: default 06:00–23:00 for verified venues that have no hours set
UPDATE public.venues
  SET open_time = '06:00', close_time = '23:00'
  WHERE status = 'verified'
    AND open_time IS NULL
    AND close_time IS NULL;
