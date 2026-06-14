-- ============================================================
-- Phase 3.7: Venue payout audit trail
-- Adds approver tracking + row locking to prevent double-payout.
-- ============================================================

-- 1. Add audit columns to venue_payout_requests
ALTER TABLE public.venue_payout_requests
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS failure_reason text;

-- 2. Drop and recreate finalize_venue_withdrawal with row lock + audit fields
DROP FUNCTION IF EXISTS public.finalize_venue_withdrawal(uuid, boolean, text);
CREATE OR REPLACE FUNCTION public.finalize_venue_withdrawal(
  p_request_id uuid,
  p_approve    boolean,
  p_admin_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
  v_amount   numeric;
  v_status   text;
BEGIN
  -- Only admins
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (role IN ('admin','super_admin') OR is_admin = true)
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  -- Lock the row so two admins can't click Approve simultaneously
  SELECT owner_id, amount, status
  INTO v_owner_id, v_amount, v_status
  FROM public.venue_payout_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'request_not_found');
  END IF;

  IF v_status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_resolved');
  END IF;

  IF p_approve THEN
    UPDATE public.venue_payout_requests
    SET status = 'approved',
        admin_note = p_admin_note,
        approved_by = auth.uid(),
        approved_at = now(),
        resolved_at = now()
    WHERE id = p_request_id;

    -- Notify turf owner
    INSERT INTO public.notifications (user_id, title, body, type, data)
    VALUES (v_owner_id,
      'Withdrawal approved!',
      '₵' || v_amount || ' withdrawal has been approved and will be sent to your mobile money.',
      'payment_received',
      jsonb_build_object('payout_request_id', p_request_id, 'amount', v_amount));

    RETURN jsonb_build_object('success', true, 'action', 'approved');
  ELSE
    -- Refund back to balance
    UPDATE public.profiles
    SET venue_owner_balance = venue_owner_balance + v_amount
    WHERE id = v_owner_id;

    UPDATE public.venue_payout_requests
    SET status = 'rejected',
        admin_note = p_admin_note,
        approved_by = auth.uid(),
        approved_at = now(),
        resolved_at = now()
    WHERE id = p_request_id;

    INSERT INTO public.notifications (user_id, title, body, type, data)
    VALUES (v_owner_id,
      'Withdrawal rejected',
      '₵' || v_amount || ' has been returned to your venue balance. Reason: ' || COALESCE(p_admin_note, 'no reason given'),
      'account',
      jsonb_build_object('payout_request_id', p_request_id, 'amount', v_amount));

    RETURN jsonb_build_object('success', true, 'action', 'rejected', 'refunded', v_amount);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_venue_withdrawal(uuid, boolean, text)
  TO authenticated;
