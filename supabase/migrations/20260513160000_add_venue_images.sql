-- ============================================================
-- Add venue image support
-- ============================================================

-- Add image_urls array to venues
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS image_urls text[] DEFAULT '{}';

-- Create storage bucket for venue images (run in Supabase dashboard if not via SQL)
-- Note: Bucket creation requires service_role; create manually in Storage UI or use SQL if superuser

-- Update existing venues select policies to include new column
-- (columns are automatically included in SELECT *)
