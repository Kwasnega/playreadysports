-- ============================================================
-- Migration: Create platform_revenue table and verify wallet_transactions schema
-- Date: 2026-05-21
-- Purpose:
--   1. Create platform_revenue table to record commission from each match
--   2. Ensure wallet_transactions exists with all required columns
-- ============================================================

-- ------------------------------------------------------------
-- 1. Create platform_revenue table if it doesn't exist
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_revenue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id        uuid REFERENCES public.matches(id) ON DELETE SET NULL,
  amount          numeric(10,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  commission_rate numeric(5,4) NOT NULL DEFAULT 0,
  created_at      timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS for platform_revenue (admins only)
ALTER TABLE public.platform_revenue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can view all platform revenue" ON public.platform_revenue;
CREATE POLICY "Admin can view all platform revenue"
  ON public.platform_revenue
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND (is_admin = true OR role IN ('admin', 'super_admin'))
  ));

-- Service role can insert (called by complete_match_atomic)
DROP POLICY IF EXISTS "Service role can insert platform revenue" ON public.platform_revenue;
CREATE POLICY "Service role can insert platform revenue"
  ON public.platform_revenue
  FOR INSERT
  WITH CHECK (true);

-- ------------------------------------------------------------
-- 2. Verify wallet_transactions table exists and has correct schema
-- ------------------------------------------------------------

-- wallet_transactions was originally created in 20260513180000_add_wallet_system.sql.
-- If it is missing (e.g. in a fresh/reset DB), create it here with the full schema.
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  amount        numeric(10,2) NOT NULL,
  type          public.wallet_transaction_type NOT NULL,
  reference     text UNIQUE,
  status        text NOT NULL DEFAULT 'completed',
  created_at    timestamptz DEFAULT now() NOT NULL,
  updated_at    timestamptz DEFAULT now() NOT NULL,
  description   text,
  match_id      uuid REFERENCES public.matches(id) ON DELETE SET NULL,
  balance_after numeric(10,2)
);

-- Add missing columns if the table already exists without them
ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS description   text,
  ADD COLUMN IF NOT EXISTS match_id      uuid REFERENCES public.matches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS balance_after numeric(10,2);

-- Ensure updated_at auto-update trigger exists
CREATE OR REPLACE FUNCTION public.set_wallet_transactions_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS wallet_transactions_updated_at ON public.wallet_transactions;
CREATE TRIGGER wallet_transactions_updated_at
  BEFORE UPDATE ON public.wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_wallet_transactions_updated_at();
