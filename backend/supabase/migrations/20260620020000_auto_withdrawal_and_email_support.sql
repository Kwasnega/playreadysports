-- ============================================================
-- Auto-Withdrawal Processing & Email Support
-- Date: 2026-06-20
-- Purpose:
--   1. Add auto_withdrawal setting to determine if withdrawals process automatically
--   2. Create RPC to auto-process venue withdrawals without admin approval
--   3. Add email_logs table for tracking sent emails
--   4. Update lineup RLS to only allow organizer to edit
-- ============================================================

-- 1. Add auto_withdrawal setting to platform_settings
ALTER TABLE public.platform_settings
ADD COLUMN IF NOT EXISTS auto_process_withdrawals boolean DEFAULT false;

-- 2. Create email_logs table to track bulk emails sent
CREATE TABLE IF NOT EXISTS public.email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_emails text[] NOT NULL, -- Array of email addresses
  subject text NOT NULL,
  body text NOT NULL,
  recipient_count int NOT NULL,
  sent_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- 3. Enable RLS on email_logs
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can view email logs" ON public.email_logs;
CREATE POLICY "Admin can view email logs" ON public.email_logs FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = true
  )
);

-- 4. Create auto-process withdrawal RPC
-- This is called by a cron job to automatically process pending withdrawals
DROP FUNCTION IF EXISTS public.auto_process_venue_withdrawal(uuid);
CREATE OR REPLACE FUNCTION public.auto_process_venue_withdrawal(
  p_payout_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout RECORD;
  v_owner_profile RECORD;
  v_success boolean := false;
  v_error_msg text := '';
BEGIN
  -- Get the payout request
  SELECT * INTO v_payout
  FROM public.venue_payout_requests
  WHERE id = p_payout_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Payout request not found'
    );
  END IF;

  -- Only process pending requests
  IF v_payout.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Payout request is not pending'
    );
  END IF;

  -- Get owner profile for balance verification
  SELECT * INTO v_owner_profile
  FROM public.profiles
  WHERE id = v_payout.owner_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Owner not found'
    );
  END IF;

  -- Check if owner has sufficient balance
  IF COALESCE(v_owner_profile.wallet_balance, 0) < v_payout.amount THEN
    UPDATE public.venue_payout_requests
    SET status = 'rejected',
        failure_reason = 'Insufficient balance'
    WHERE id = p_payout_request_id;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient balance',
      'balance', v_owner_profile.wallet_balance
    );
  END IF;

  -- Update payout request to approved (this triggers moolre-admin-payouts edge function)
  UPDATE public.venue_payout_requests
  SET status = 'approved',
      approved_by = auth.uid(),
      approved_at = now(),
      admin_note = 'Auto-processed'
  WHERE id = p_payout_request_id;

  -- Deduct from owner's wallet
  UPDATE public.profiles
  SET wallet_balance = COALESCE(wallet_balance, 0) - v_payout.amount
  WHERE id = v_payout.owner_id;

  -- Record transaction
  INSERT INTO public.wallet_transactions (
    user_id, amount, type, status, reference
  ) VALUES (
    v_payout.owner_id,
    v_payout.amount,
    'withdrawal',
    'completed',
    'payout_' || p_payout_request_id::text
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Withdrawal processed automatically',
    'payout_id', p_payout_request_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.auto_process_venue_withdrawal(uuid)
  TO authenticated, service_role;

-- 5. Fix lineup RLS to only allow organizer to create AND edit
-- Update the Players can update position policy to ONLY allow organizer
DROP POLICY IF EXISTS "Players can update own position" ON public.match_lineups;
CREATE POLICY "Organizer can update any position" ON public.match_lineups FOR UPDATE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = match_id AND m.organizer_id = auth.uid()
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = match_id AND m.organizer_id = auth.uid()
  )
);

-- 6. Also restrict DELETE to organizer only
DROP POLICY IF EXISTS "Lineups deletable by organizer" ON public.match_lineups;
CREATE POLICY "Organizer can delete lineups" ON public.match_lineups FOR DELETE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = match_id AND m.organizer_id = auth.uid()
  )
);

-- 7. Create cron job for auto-processing withdrawals (runs every hour)
-- NOTE: This needs to be enabled in pg_cron
-- SELECT cron.schedule('auto-process-withdrawals', '0 * * * *', 'SELECT auto_process_pending_withdrawals()');

-- 8. Function to process all pending withdrawals
DROP FUNCTION IF EXISTS public.auto_process_pending_withdrawals();
CREATE OR REPLACE FUNCTION public.auto_process_pending_withdrawals()
RETURNS TABLE(processed int, failed int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_processed int := 0;
  v_failed int := 0;
  v_payout_id uuid;
  v_cursor CURSOR FOR
    SELECT id FROM public.venue_payout_requests
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT 100;
BEGIN
  -- Check if auto-processing is enabled
  IF NOT (SELECT auto_process_withdrawals FROM public.platform_settings LIMIT 1) THEN
    RETURN QUERY SELECT 0::int, 0::int;
    RETURN;
  END IF;

  OPEN v_cursor;
  LOOP
    FETCH v_cursor INTO v_payout_id;
    EXIT WHEN NOT FOUND;

    BEGIN
      PERFORM public.auto_process_venue_withdrawal(v_payout_id);
      v_processed := v_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
    END;
  END LOOP;
  CLOSE v_cursor;

  RETURN QUERY SELECT v_processed, v_failed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.auto_process_pending_withdrawals()
  TO authenticated, service_role;

-- 9. Add indexes for email logs
CREATE INDEX IF NOT EXISTS idx_email_logs_admin ON public.email_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at ON public.email_logs(sent_at);
