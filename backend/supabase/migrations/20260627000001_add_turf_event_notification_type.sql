-- Migration: Add 'turf_event' and 'refund_processed' to notification_type enum
-- Fixes issue where notifications for turf owners (disputes, reviews, match completed) fail to insert because 'turf_event' is not a valid enum value.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'turf_event'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type')
  ) THEN
    ALTER TYPE public.notification_type ADD VALUE 'turf_event';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'refund_processed'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type')
  ) THEN
    ALTER TYPE public.notification_type ADD VALUE 'refund_processed';
  END IF;
END;
$$;
