-- Phase 3: Payment safety fixes
-- 1. Atomic free-join RPC with FOR UPDATE slot lock (fixes overfill race condition)
-- 2. Fix process_wallet_transaction type inconsistency (enum vs text)

-- ─────────────────────────────────────────
-- 1. process_free_join — atomic capacity check + insert in a single transaction
-- ─────────────────────────────────────────
DROP FUNCTION IF EXISTS public.process_free_join(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.process_free_join(
  p_match_id  uuid,
  p_user_id   uuid,
  p_team      text DEFAULT 'unassigned'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match        record;
  v_active_count integer;
  v_max_core     integer;
  v_participant  uuid;
BEGIN
  -- Lock the match row to prevent concurrent joins from reading stale counts
  SELECT *
  INTO v_match
  FROM public.matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Match not found');
  END IF;

  IF v_match.status <> 'upcoming' THEN
    RETURN jsonb_build_object('error', 'Match is not open for joining');
  END IF;

  IF COALESCE(v_match.entry_fee, 0) > 0 THEN
    RETURN jsonb_build_object('error', 'This match requires payment');
  END IF;

  -- Check for existing participation
  IF EXISTS (
    SELECT 1 FROM public.match_participants
    WHERE match_id = p_match_id AND user_id = p_user_id
  ) THEN
    RETURN jsonb_build_object('error', 'Already joined this match');
  END IF;

  v_max_core := COALESCE(v_match.max_core_players, v_match.players_per_side, 10);

  SELECT COUNT(*) INTO v_active_count
  FROM public.match_participants
  WHERE match_id = p_match_id
    AND status = 'active'
    AND slot_type = 'core';

  IF v_active_count >= v_max_core THEN
    RETURN jsonb_build_object('error', 'Match is full');
  END IF;

  INSERT INTO public.match_participants (
    match_id, user_id, slot_type, team, status, payment_status
  )
  VALUES (
    p_match_id, p_user_id, 'core', p_team::participant_team, 'active', 'paid'
  )
  RETURNING id INTO v_participant;

  RETURN jsonb_build_object('success', true, 'participant_id', v_participant);
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_free_join(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_free_join(uuid, uuid, text) TO service_role;


-- ─────────────────────────────────────────
-- 2. Fix process_wallet_transaction — unify to a single consistent definition
--    Use explicit enum cast so the wallet_transactions.type column always gets
--    the correct enum value regardless of whether a text or enum is passed.
-- ─────────────────────────────────────────
DROP FUNCTION IF EXISTS public.process_wallet_transaction(uuid, numeric, text, text);
DROP FUNCTION IF EXISTS public.process_wallet_transaction(uuid, numeric, public.wallet_transaction_type, text);

CREATE OR REPLACE FUNCTION public.process_wallet_transaction(
  p_user_id   uuid,
  p_amount    numeric,
  p_type      text,   -- accepts text; cast to enum inside the function
  p_reference text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance numeric;
  v_txn_type    public.wallet_transaction_type;
BEGIN
  -- Safely cast text to enum — raises exception with clear message on bad value
  BEGIN
    v_txn_type := p_type::public.wallet_transaction_type;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('error', 'Invalid transaction type: ' || p_type);
  END;

  -- Idempotency: skip if this reference already processed
  IF EXISTS (
    SELECT 1 FROM public.wallet_transactions
    WHERE reference = p_reference
  ) THEN
    SELECT balance INTO v_new_balance FROM public.wallet_balances WHERE user_id = p_user_id;
    RETURN jsonb_build_object('success', true, 'balance', v_new_balance, 'already_processed', true);
  END IF;

  -- Lock balance row for atomic update
  SELECT balance INTO v_new_balance
  FROM public.wallet_balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.wallet_balances (user_id, balance)
    VALUES (p_user_id, 0);
    v_new_balance := 0;
  END IF;

  IF v_txn_type IN ('deposit', 'refund') THEN
    UPDATE public.wallet_balances
    SET balance = balance + p_amount, updated_at = now()
    WHERE user_id = p_user_id
    RETURNING balance INTO v_new_balance;
  ELSIF v_txn_type = 'withdrawal' THEN
    IF v_new_balance < p_amount THEN
      RETURN jsonb_build_object('error', 'Insufficient balance');
    END IF;
    UPDATE public.wallet_balances
    SET balance = balance - p_amount, updated_at = now()
    WHERE user_id = p_user_id
    RETURNING balance INTO v_new_balance;
  ELSE
    RETURN jsonb_build_object('error', 'Unsupported transaction type: ' || p_type);
  END IF;

  INSERT INTO public.wallet_transactions (user_id, amount, type, reference, status)
  VALUES (p_user_id, p_amount, v_txn_type, p_reference, 'completed');

  RETURN jsonb_build_object('success', true, 'balance', v_new_balance);
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_wallet_transaction(uuid, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_wallet_transaction(uuid, numeric, text, text) TO service_role;


-- ─────────────────────────────────────────
-- 3. Add idempotency guard to finalize_venue_withdrawal
--    (prevents double-approval race condition)
-- ─────────────────────────────────────────
DROP FUNCTION IF EXISTS public.finalize_venue_withdrawal(uuid, boolean, text);

CREATE OR REPLACE FUNCTION public.finalize_venue_withdrawal(
  p_request_id  uuid,
  p_approve     boolean,
  p_admin_id    uuid    DEFAULT NULL,
  p_reason      text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request record;
BEGIN
  -- Lock the request row — prevents two admins approving simultaneously
  SELECT * INTO v_request
  FROM public.venue_payout_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Withdrawal request not found');
  END IF;

  IF v_request.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'error', 'Request already processed',
      'status', v_request.status
    );
  END IF;

  IF p_approve THEN
    UPDATE public.venue_payout_requests
    SET
      status       = 'approved',
      processed_at = now(),
      admin_notes  = p_reason
    WHERE id = p_request_id;

    -- Notify venue owner
    INSERT INTO public.notifications (user_id, title, body, type, data)
    SELECT
      v_request.user_id,
      'Withdrawal Approved',
      'Your withdrawal of GHS ' || v_request.amount || ' has been approved.',
      'withdrawal_approved',
      jsonb_build_object('request_id', p_request_id, 'amount', v_request.amount)
    ;
  ELSE
    -- Rejection: credit the amount back to venue_owner_balance
    UPDATE public.profiles
    SET venue_owner_balance = COALESCE(venue_owner_balance, 0) + v_request.amount
    WHERE id = v_request.user_id;

    UPDATE public.venue_payout_requests
    SET
      status       = 'rejected',
      processed_at = now(),
      admin_notes  = p_reason
    WHERE id = p_request_id;

    INSERT INTO public.notifications (user_id, title, body, type, data)
    SELECT
      v_request.user_id,
      'Withdrawal Rejected',
      COALESCE(p_reason, 'Your withdrawal request was rejected. Funds returned to your balance.'),
      'withdrawal_rejected',
      jsonb_build_object('request_id', p_request_id, 'amount', v_request.amount)
    ;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_venue_withdrawal(uuid, boolean, uuid, text) TO service_role;
