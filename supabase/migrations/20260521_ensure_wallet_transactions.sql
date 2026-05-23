-- ============================================================
-- Migration: Ensure wallet_transactions table exists with correct schema
-- Date: 2026-05-21
-- Purpose:
--   1. Create wallet_transactions table if it doesn't exist
--   2. Ensure indexes on user_id and created_at
--   3. Enable RLS and create policies
-- ============================================================

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount        numeric(12,2) NOT NULL,
  type          text NOT NULL CHECK (type IN (
    'entry_fee', 'prize_won', 'top_up', 'withdrawal',
    'refund', 'organizer_profit', 'venue_cut',
    'organizer_incentive', 'commission'
  )),
  description   text,
  match_id      uuid REFERENCES public.matches(id) ON DELETE SET NULL,
  balance_after numeric(12,2) NOT NULL,
  created_at    timestamptz DEFAULT NOW() NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS wallet_transactions_user_id_idx
  ON public.wallet_transactions (user_id);

CREATE INDEX IF NOT EXISTS wallet_transactions_created_at_idx
  ON public.wallet_transactions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_created
  ON public.wallet_transactions (user_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Users see own transactions
DROP POLICY IF EXISTS "Users see own transactions" ON public.wallet_transactions;
CREATE POLICY "Users see own transactions"
  ON public.wallet_transactions
  FOR SELECT USING (auth.uid() = user_id);

-- Admins see all
DROP POLICY IF EXISTS "Admins see all transactions" ON public.wallet_transactions;
CREATE POLICY "Admins see all transactions"
  ON public.wallet_transactions
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND (is_admin = true OR role IN ('admin', 'super_admin'))
  ));
