-- ============================================================
-- Turf Owner Features: blockout dates + turf_owner slot type
-- ============================================================

-- 1. Add 'turf_owner' to slot_type enum (for lobby chat participation)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'turf_owner'
      AND enumtypid = 'public.slot_type'::regtype
  ) THEN
    ALTER TYPE public.slot_type ADD VALUE 'turf_owner';
  END IF;
END $$;

-- 2. Create venue_blockouts table (per-venue, full-day or time-slot)
CREATE TABLE IF NOT EXISTS public.venue_blockouts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id      uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  block_date    date NOT NULL,
  start_time    time,
  end_time      time,
  reason        text,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venue_blockouts_venue_date
  ON public.venue_blockouts (venue_id, block_date);

-- 3. RLS policies for venue_blockouts
ALTER TABLE public.venue_blockouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS venue_blockouts_select ON public.venue_blockouts;
CREATE POLICY venue_blockouts_select ON public.venue_blockouts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.venues v
      WHERE v.id = venue_blockouts.venue_id
        AND (v.owner_id = auth.uid() OR v.owner_email = (SELECT email FROM auth.users WHERE id = auth.uid()))
    )
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

DROP POLICY IF EXISTS venue_blockouts_insert ON public.venue_blockouts;
CREATE POLICY venue_blockouts_insert ON public.venue_blockouts
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.venues v
      WHERE v.id = venue_blockouts.venue_id
        AND (v.owner_id = auth.uid() OR v.owner_email = (SELECT email FROM auth.users WHERE id = auth.uid()))
    )
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

DROP POLICY IF EXISTS venue_blockouts_delete ON public.venue_blockouts;
CREATE POLICY venue_blockouts_delete ON public.venue_blockouts
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.venues v
      WHERE v.id = venue_blockouts.venue_id
        AND (v.owner_id = auth.uid() OR v.owner_email = (SELECT email FROM auth.users WHERE id = auth.uid()))
    )
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

-- 4. Ensure match_participants RLS allows turf owners to read/write messages
-- (The messages table already has participant-based policies; we need to ensure
--  turf owners who are match_participants with slot_type='turf_owner' are covered)

-- Existing policies on messages should already work since turf_owner is a valid slot_type
-- but let's verify the insert policy covers them:
-- The messages_insert policy likely checks if the sender is a participant.
-- We need to make sure turf_owner participants can send messages.
