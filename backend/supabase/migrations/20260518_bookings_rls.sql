-- ============================================================
-- Phase 2.5: bookings table RLS policies
-- ============================================================

-- bookings table currently has customer_name/customer_phone but no user_id FK.
-- Add user_id so RLS can work, and venue_id so venue owners can see their bookings.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS venue_id uuid REFERENCES public.venues(id) ON DELETE SET NULL;

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- Authenticated users can insert their own bookings
DROP POLICY IF EXISTS "users can insert own bookings" ON public.bookings;
CREATE POLICY "users can insert own bookings"
  ON public.bookings FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can update their own bookings
DROP POLICY IF EXISTS "users can update own bookings" ON public.bookings;
CREATE POLICY "users can update own bookings"
  ON public.bookings FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can view own bookings, venue owners can view their venue's bookings, admins see all
DROP POLICY IF EXISTS "users can view own bookings" ON public.bookings;
CREATE POLICY "users can view own bookings"
  ON public.bookings FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND (role IN ('admin','super_admin') OR is_admin = true)
    )
    OR EXISTS (
      SELECT 1 FROM public.venues v
      WHERE v.id = venue_id AND v.owner_id = auth.uid()
    )
  );

-- Admins can update any booking
DROP POLICY IF EXISTS "admins can update any booking" ON public.bookings;
CREATE POLICY "admins can update any booking"
  ON public.bookings FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND (role IN ('admin','super_admin') OR is_admin = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND (role IN ('admin','super_admin') OR is_admin = true)
    )
  );
