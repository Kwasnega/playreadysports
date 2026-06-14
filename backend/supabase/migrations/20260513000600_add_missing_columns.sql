-- ============================================================
-- ADD MISSING COLUMNS TO EXISTING TABLES
-- Run this BEFORE the main schema v2.0
-- ============================================================

-- profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS position text,
  ADD COLUMN IF NOT EXISTS preferred_sports text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS skill_level public.skill_level DEFAULT 'beginner',
  ADD COLUMN IF NOT EXISTS total_matches int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_wins int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_matches_played int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reputation_score float DEFAULT 5.0,
  ADD COLUMN IF NOT EXISTS is_verified bool DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_banned bool DEFAULT false,
  ADD COLUMN IF NOT EXISTS banned_until timestamptz,
  ADD COLUMN IF NOT EXISTS ban_reason text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- venues
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS area text,
  ADD COLUMN IF NOT EXISTS surface text,
  ADD COLUMN IF NOT EXISTS amenities text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS price_per_hour float,
  ADD COLUMN IF NOT EXISTS capacity int,
  ADD COLUMN IF NOT EXISTS sport_ids int[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS owner_email text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- matches (already partially done by 20260513000200_fix_matches_columns.sql)
-- Just ensure is_public exists
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS is_public bool DEFAULT true;

-- messages
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS message_type public.message_type DEFAULT 'text';

-- notifications
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS type public.notification_type DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS data jsonb,
  ADD COLUMN IF NOT EXISTS is_read bool DEFAULT false;

-- transactions
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS type public.transaction_type,
  ADD COLUMN IF NOT EXISTS status public.transaction_status DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS payment_reference text;

-- reviews
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS rating int CHECK (rating >= 1 AND rating <= 5),
  ADD COLUMN IF NOT EXISTS comment text;

-- reports
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS status public.report_status DEFAULT 'pending';

-- bookings
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS duration int DEFAULT 1,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'tentative',
  ADD COLUMN IF NOT EXISTS payment text DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';
