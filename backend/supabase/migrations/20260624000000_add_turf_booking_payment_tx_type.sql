-- Migration: add 'turf_booking_payment' to wallet_transaction_type enum
-- Used when organizer covers the full turf cost for a free match.
-- Safe to run multiple times (checks existing labels first)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'wallet_transaction_type' AND e.enumlabel = 'turf_booking_payment'
  ) THEN
    EXECUTE 'ALTER TYPE public.wallet_transaction_type ADD VALUE ''turf_booking_payment''';
  END IF;
END$$;
