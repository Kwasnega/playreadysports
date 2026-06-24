-- Migration: add 'entry_fee' to wallet_transaction_type enum
-- Safe to run multiple times (checks existing labels first)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'wallet_transaction_type' AND e.enumlabel = 'entry_fee'
  ) THEN
    EXECUTE 'ALTER TYPE public.wallet_transaction_type ADD VALUE ''entry_fee''';
  END IF;
END$$;
