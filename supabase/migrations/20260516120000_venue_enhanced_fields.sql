-- Add enhanced venue fields submitted by turf owners during registration
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS price_per_hour   numeric(10,2)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS capacity         int            DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS contact_phone    text           DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS amenities        text[]         DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS description      text           DEFAULT NULL;

COMMENT ON COLUMN public.venues.price_per_hour IS 'Turf rental price per hour in local currency (cedis).';
COMMENT ON COLUMN public.venues.capacity     IS 'Maximum number of players the venue can accommodate simultaneously.';
COMMENT ON COLUMN public.venues.contact_phone IS 'Turf owner contact phone displayed to organisers.';
COMMENT ON COLUMN public.venues.amenities    IS 'Array of amenity tags e.g. {Parking, Lights, "Changing room"}.';
COMMENT ON COLUMN public.venues.description  IS 'Free-text description of the venue submitted by the owner.';
