-- ============================================================
-- Migration: Add missing columns to wallet_transactions
-- Date: 2026-06-20
-- Purpose:
--   The wallet_transactions table was missing description and
--   balance_after columns that the complete_wallet_topup RPC
--   and wallet-topup edge function depend on.
--   Also adds the `reason` column used by failure updates.
-- ============================================================

-- Add description column if missing
ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS description text;

-- Add balance_after column if missing
ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS balance_after numeric(12,2);

-- Add reason column for storing failure reasons
ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS reason text;

-- Add updated_at column if missing
ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Add an index on reference for faster lookups (already has unique constraint)
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_reference
  ON public.wallet_transactions (reference);

-- Add index on status for faster pending-tx queries
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_status
  ON public.wallet_transactions (status);
