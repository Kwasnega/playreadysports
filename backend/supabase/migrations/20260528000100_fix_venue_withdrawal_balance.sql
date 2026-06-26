-- ============================================================
-- Migration: Fix venue owner withdrawal to use wallet_balances
--
-- C3: request_venue_withdrawal was reading profiles.venue_owner_balance
--     but complete_match_atomic credits wallet_balances.balance.
--     Dashboard already shows wallet_balances. Align the RPC.
--
-- C4: Old RPC used a non-atomic read-then-SET debit. New version
--     delegates deduction to process_wallet_transaction (atomic).
-- ============================================================

-- ─── 1. request_venue_withdrawal: read from wallet_balances ───────────────────
DROP FUNCTION IF EXISTS public.request_venue_withdrawal(numeric, text, text, uuid, text);
CREATE OR REPLACE FUNCTION public.request_venue_withdrawal(
  p_amount       numeric,
  p_phone_number text,
  p_provider     text,
  p_venue_id     uuid DEFAULT NULL,
  p_notes        text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid;
  v_role       text;
  v_balance    numeric;
  v_request_id uuid;
  v_ref        text;
BEGIN
  v_uid := auth.uid();

  -- Confirm caller is a turf owner
  SELECT role INTO v_role FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND OR v_role <> 'turf_owner' THEN
    RETURN jsonb_build_object('success', false, 'error', 'only_turf_owners');
  END IF;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'amount_must_be_positive');
  END IF;

  -- Read balance from wallet_balances (the canonical balance table)
  SELECT balance INTO v_balance
  FROM public.wallet_balances
  WHERE user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'wallet_not_found');
  END IF;

  IF v_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_balance',
      'available', v_balance);
  END IF;

  -- Atomically deduct from wallet_balances + log a pending withdrawal transaction
  v_ref := 'vo-withdraw-' || v_uid || '-' || extract(epoch from now())::bigint;

  -- Atomic debit via the canonical RPC (handles balance + wallet_transactions row)
  PERFORM public.process_wallet_transaction(
    v_uid,
    -p_amount,
    'withdrawal',
    v_ref,
    NULL,
    'Venue owner withdrawal request'
  );

  -- Create the payout request record for admin to action
  INSERT INTO public.venue_payout_requests
    (owner_id, venue_id, amount, status, phone_number, provider, notes)
  VALUES
    (v_uid, p_venue_id, p_amount, 'pending', p_phone_number, p_provider, p_notes)
  RETURNING id INTO v_request_id;

  -- Notify admins
  INSERT INTO public.notifications (user_id, title, body, type, data)
  SELECT p.id,
    'New withdrawal request',
    'Turf owner requested ₵' || p_amount || ' payout via ' || p_provider,
    'payment_received',
    jsonb_build_object('payout_request_id', v_request_id, 'amount', p_amount)
  FROM public.profiles p
  WHERE p.role IN ('admin', 'super_admin') OR p.is_admin = true;

  RETURN jsonb_build_object('success', true, 'request_id', v_request_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_venue_withdrawal(numeric, text, text, uuid, text)
  TO authenticated;


-- ─── 2. finalize_venue_withdrawal: refund to wallet_balances on rejection ─────
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
  v_ref      text;
BEGIN
  -- Only admins
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (role IN ('admin', 'super_admin') OR is_admin = true)
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT owner_id, amount, status
  INTO v_owner_id, v_amount, v_status
  FROM public.venue_payout_requests
  WHERE id = p_request_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'request_not_found');
  END IF;

  IF v_status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_resolved');
  END IF;

  IF p_approve THEN
    UPDATE public.venue_payout_requests
    SET status = 'approved', admin_note = p_admin_note, resolved_at = now()
    WHERE id = p_request_id;

    INSERT INTO public.notifications (user_id, title, body, type, data)
    VALUES (v_owner_id,
      'Withdrawal approved!',
      '₵' || v_amount || ' withdrawal has been approved and will be sent to your mobile money.',
      'payment_received',
      jsonb_build_object('payout_request_id', p_request_id, 'amount', v_amount));

    RETURN jsonb_build_object('success', true, 'action', 'approved');
  ELSE
    -- Refund back to wallet_balances (was: profiles.venue_owner_balance)
    v_ref := 'vo-withdraw-refund-' || p_request_id;
    PERFORM public.process_wallet_transaction(
      v_owner_id,
      v_amount,
      'refund',
      v_ref,
      NULL,
      'Venue withdrawal rejected — refunded'
    );

    UPDATE public.venue_payout_requests
    SET status = 'rejected', admin_note = p_admin_note, resolved_at = now()
    WHERE id = p_request_id;

    INSERT INTO public.notifications (user_id, title, body, type, data)
    VALUES (v_owner_id,
      'Withdrawal rejected',
      '₵' || v_amount || ' has been returned to your wallet. Reason: ' || COALESCE(p_admin_note, 'no reason given'),
      'account',
      jsonb_build_object('payout_request_id', p_request_id, 'amount', v_amount));

    RETURN jsonb_build_object('success', true, 'action', 'rejected', 'refunded', v_amount);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_venue_withdrawal(uuid, boolean, text)
  TO authenticated;
