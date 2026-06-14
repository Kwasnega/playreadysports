-- ============================================================
-- Add venue image support
-- ============================================================

-- Add image_urls array to venues
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS image_urls text[] DEFAULT '{}';

-- Create public storage bucket for venue images
INSERT INTO storage.buckets (id, name, public, avif_autodetection)
VALUES ('venue-images', 'venue-images', true, false)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to venue images
DROP POLICY IF EXISTS "Allow public read venue-images" ON storage.objects;
CREATE POLICY "Allow public read venue-images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'venue-images');

-- Allow authenticated users to upload venue images
DROP POLICY IF EXISTS "Allow authenticated uploads venue-images" ON storage.objects;
CREATE POLICY "Allow authenticated uploads venue-images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'venue-images' AND auth.role() = 'authenticated');

-- Allow authenticated users to delete their own venue images
DROP POLICY IF EXISTS "Allow authenticated delete venue-images" ON storage.objects;
CREATE POLICY "Allow authenticated delete venue-images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'venue-images' AND auth.role() = 'authenticated');
