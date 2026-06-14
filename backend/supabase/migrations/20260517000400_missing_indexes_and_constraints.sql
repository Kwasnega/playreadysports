-- Phase 4: Missing indexes, constraints, and table fixes

-- ─────────────────────────────────────────
-- 1. Missing indexes from audit
-- ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_role
  ON public.profiles (role);

CREATE INDEX IF NOT EXISTS idx_profiles_reputation_score
  ON public.profiles (reputation_score DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_venue_payout_requests_status_created
  ON public.venue_payout_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_created
  ON public.wallet_transactions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_matches_organizer_status
  ON public.matches (organizer_id)
  WHERE status IN ('upcoming', 'live');

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_match_participants_match_status
  ON public.match_participants (match_id, status, slot_type);

CREATE INDEX IF NOT EXISTS idx_friendships_addressee_status
  ON public.friendships (addressee_id, status);

CREATE INDEX IF NOT EXISTS idx_friendships_requester_status
  ON public.friendships (requester_id, status);

-- ─────────────────────────────────────────
-- 2. UNIQUE constraint on transactions.payment_reference
--    (partial — only where reference is not null to avoid breaking existing nulls)
-- ─────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_payment_reference_unique
  ON public.transactions (payment_reference)
  WHERE payment_reference IS NOT NULL;

-- ─────────────────────────────────────────
-- 3. Fix bookings table structure
--    Add venue_id UUID FK and enum-typed status column.
--    Keeps pitch_id for backward compatibility; mark as deprecated.
-- ─────────────────────────────────────────
DO $$
BEGIN
  -- Add venue_id FK if not present
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'venue_id'
  ) THEN
    ALTER TABLE public.bookings ADD COLUMN venue_id UUID REFERENCES public.venues(id) ON DELETE SET NULL;
  END IF;

  -- Add booking_status column with check constraint (until enum is feasible)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'booking_status'
  ) THEN
    ALTER TABLE public.bookings
      ADD COLUMN booking_status TEXT NOT NULL DEFAULT 'pending'
      CHECK (booking_status IN ('pending', 'payment_pending', 'confirmed', 'cancelled', 'completed'));
  END IF;

  -- Add payment_status column for booking payments
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'payment_reference'
  ) THEN
    ALTER TABLE public.bookings ADD COLUMN payment_reference TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'payment_amount'
  ) THEN
    ALTER TABLE public.bookings ADD COLUMN payment_amount NUMERIC(10,2) DEFAULT 0;
  END IF;
END $$;

-- ─────────────────────────────────────────
-- 4. Fix reports table — add workflow columns
-- ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reports' AND column_name = 'assigned_to'
  ) THEN
    ALTER TABLE public.reports ADD COLUMN assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reports' AND column_name = 'resolution_notes'
  ) THEN
    ALTER TABLE public.reports ADD COLUMN resolution_notes TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reports' AND column_name = 'resolved_at'
  ) THEN
    ALTER TABLE public.reports ADD COLUMN resolved_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reports' AND column_name = 'resolved_by'
  ) THEN
    ALTER TABLE public.reports ADD COLUMN resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────
-- 5. Venue payout requests — add audit trail columns
-- ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'venue_payout_requests' AND column_name = 'admin_notes'
  ) THEN
    ALTER TABLE public.venue_payout_requests ADD COLUMN admin_notes TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'venue_payout_requests' AND column_name = 'processed_at'
  ) THEN
    ALTER TABLE public.venue_payout_requests ADD COLUMN processed_at TIMESTAMPTZ;
  END IF;
END $$;
