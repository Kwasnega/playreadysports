-- Migration: Add 'admin_broadcast' to notification_type enum
-- Fixes ISSUE 12: invalid input value for enum notification_type: "admin_broadcast"
--
-- This is safe to run multiple times — the IF NOT EXISTS guard prevents
-- duplicate value errors if this migration is re-applied.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'admin_broadcast'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type')
  ) THEN
    ALTER TYPE public.notification_type ADD VALUE 'admin_broadcast';
  END IF;
END;
$$;
