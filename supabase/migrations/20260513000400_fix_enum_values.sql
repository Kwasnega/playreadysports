-- ============================================================
-- FIX: Safely add missing enum values
-- ============================================================

DO $$
BEGIN
  -- participant_status
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'participant_status' AND e.enumlabel = 'active'
  ) THEN
    ALTER TYPE public.participant_status ADD VALUE 'active';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'participant_status' AND e.enumlabel = 'left'
  ) THEN
    ALTER TYPE public.participant_status ADD VALUE 'left';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'participant_status' AND e.enumlabel = 'removed'
  ) THEN
    ALTER TYPE public.participant_status ADD VALUE 'removed';
  END IF;

  -- match_type
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'match_type') THEN
    CREATE TYPE public.match_type AS ENUM ('public', 'private');
  END IF;

  -- match_mode
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'match_mode') THEN
    CREATE TYPE public.match_mode AS ENUM ('two_team', 'gala');
  END IF;

  -- match_format
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'match_format') THEN
    CREATE TYPE public.match_format AS ENUM ('5v5', '6v6', '7v7', '8v8', '9v9', '10v10', '11v11');
  END IF;

  -- slot_type
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'slot_type') THEN
    CREATE TYPE public.slot_type AS ENUM ('core', 'spare');
  END IF;

  -- team_side
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'team_side') THEN
    CREATE TYPE public.team_side AS ENUM ('reds', 'blues', 'unassigned');
  END IF;

  -- escrow_status
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'escrow_status') THEN
    CREATE TYPE public.escrow_status AS ENUM ('none', 'holding', 'released', 'refunded');
  END IF;

  -- transaction_type
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_type') THEN
    CREATE TYPE public.transaction_type AS ENUM ('entry_fee', 'refund', 'payout');
  END IF;

  -- transaction_status
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_status') THEN
    CREATE TYPE public.transaction_status AS ENUM ('pending', 'completed', 'failed');
  END IF;

  -- report_status
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_status') THEN
    CREATE TYPE public.report_status AS ENUM ('pending', 'resolved', 'dismissed');
  END IF;

  -- message_type
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_type') THEN
    CREATE TYPE public.message_type AS ENUM ('text', 'system');
  END IF;

  -- notification_type
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
    CREATE TYPE public.notification_type AS ENUM (
      'match_invite', 'match_join', 'match_leave', 'match_update', 'match_cancel',
      'payment_received', 'match_confirmed', 'account', 'system'
    );
  END IF;

  -- app_role
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('player', 'turf_owner');
  END IF;

  -- skill_level
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'skill_level') THEN
    CREATE TYPE public.skill_level AS ENUM ('beginner', 'intermediate', 'advanced', 'pro');
  END IF;

  -- match_status
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'match_status') THEN
    CREATE TYPE public.match_status AS ENUM ('upcoming', 'live', 'completed', 'cancelled');
  END IF;

  -- payment_status
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
    CREATE TYPE public.payment_status AS ENUM ('unpaid', 'paid', 'refunded');
  END IF;
END $$;
