-- ============================================================
-- SCHEMA GAPS: venues columns + bookings table + enum values
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

-- Extend venues with fields the frontend already uses
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS owner_email text,
  ADD COLUMN IF NOT EXISTS area text,
  ADD COLUMN IF NOT EXISTS capacity int DEFAULT 10,
  ADD COLUMN IF NOT EXISTS surface text DEFAULT 'Astroturf',
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending';

-- Bookings (pitch time-slot reservations)
CREATE TABLE IF NOT EXISTS public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pitch_id text NOT NULL,
  date text NOT NULL,
  hour int NOT NULL,
  duration int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'tentative')),
  customer_name text NOT NULL,
  customer_phone text,
  price numeric(10,2) NOT NULL DEFAULT 0,
  notes text,
  payment text NOT NULL DEFAULT 'unpaid' CHECK (payment IN ('paid', 'unpaid', 'deposit')),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'app')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bookings_pitch_date ON public.bookings(pitch_id, date);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON public.bookings(date);

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Bookings readable by all" ON public.bookings;
CREATE POLICY "Bookings readable by all" ON public.bookings FOR SELECT USING (true);
DROP POLICY IF EXISTS "Bookings insertable by authenticated" ON public.bookings;
CREATE POLICY "Bookings insertable by authenticated" ON public.bookings FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Bookings updatable by authenticated" ON public.bookings;
CREATE POLICY "Bookings updatable by authenticated" ON public.bookings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Bookings deletable by authenticated" ON public.bookings;
CREATE POLICY "Bookings deletable by authenticated" ON public.bookings FOR DELETE TO authenticated USING (true);

-- Extend notification_type enum with frontend types
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'match_join' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type')) THEN
    ALTER TYPE public.notification_type ADD VALUE 'match_join';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'match_leave' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type')) THEN
    ALTER TYPE public.notification_type ADD VALUE 'match_leave';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'match_update' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type')) THEN
    ALTER TYPE public.notification_type ADD VALUE 'match_update';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'match_cancel' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type')) THEN
    ALTER TYPE public.notification_type ADD VALUE 'match_cancel';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'account' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type')) THEN
    ALTER TYPE public.notification_type ADD VALUE 'account';
  END IF;
END $$;

-- Realtime for bookings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'bookings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
  END IF;
END $$;
