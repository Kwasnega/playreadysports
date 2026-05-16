-- ============================================================
-- Venue owner payout system
-- 1. venue_owner_balance column already added in 20260515120000
-- 2. credit_venue_owner_balance RPC  (called by complete-match edge fn)
-- 3. process_wallet_transaction RPC  (called by complete-match edge fn)
-- 4. venue_payout_requests table     (withdrawal requests from turf owners)
-- 5. request_venue_withdrawal RPC    (turf owner submits a withdrawal)
-- 6. finalize_venue_withdrawal RPC   (admin approves / rejects)
-- ============================================================

-- ─── 1. Ensure venue_owner_balance exists (idempotent) ───────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS venue_owner_balance numeric(10,2) NOT NULL DEFAULT 0.00
  CHECK (venue_owner_balance >= 0);

-- ─── 2. credit_venue_owner_balance ───────────────────────────────────────────
-- Called by the complete-match edge function with service role.
DROP FUNCTION IF EXISTS public.credit_venue_owner_balance(uuid, numeric, text);
CREATE OR REPLACE FUNCTION public.credit_venue_owner_balance(
  p_user_id  uuid,
  p_amount   numeric,
  p_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'amount_must_be_positive');
  END IF;

  UPDATE public.profiles
  SET venue_owner_balance = venue_owner_balance + p_amount
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  RETURN jsonb_build_object('success', true, 'credited', p_amount);
END;
$$;

GRANT EXECUTE ON FUNCTION public.credit_venue_owner_balance(uuid, numeric, text)
  TO service_role;

-- ─── 3. process_wallet_transaction ───────────────────────────────────────────
-- Generic wallet credit / debit used by complete-match for organizer bonus.
DROP FUNCTION IF EXISTS public.process_wallet_transaction(uuid, numeric, text, text);
CREATE OR REPLACE FUNCTION public.process_wallet_transaction(
  p_user_id  uuid,
  p_amount   numeric,   -- positive = credit, negative = debit
  p_type     text,      -- 'bonus' | 'entry_fee' | 'refund' | 'withdrawal'
  p_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current numeric;
BEGIN
  SELECT wallet_balance INTO v_current FROM public.profiles WHERE id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  IF p_amount < 0 AND (v_current + p_amount) < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_balance');
  END IF;

  UPDATE public.profiles
  SET wallet_balance = wallet_balance + p_amount
  WHERE id = p_user_id;

  -- Log to wallet_transactions if table exists
  BEGIN
    INSERT INTO public.wallet_transactions (user_id, amount, type, status, reference)
    VALUES (p_user_id, p_amount, p_type, 'completed', p_reference);
  EXCEPTION WHEN undefined_table THEN
    NULL; -- table may not exist in all environments
  END;

  RETURN jsonb_build_object('success', true, 'new_balance', v_current + p_amount);
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_wallet_transaction(uuid, numeric, text, text)
  TO authenticated, service_role;

-- ─── 4. venue_payout_requests table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.venue_payout_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  venue_id      uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  amount        numeric(10,2) NOT NULL CHECK (amount > 0),
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','rejected','paid')),
  phone_number  text,
  provider      text,               -- 'mtn' | 'vodafone' | 'airteltigo' | 'bank'
  notes         text,
  admin_note    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_venue_payout_requests_owner
  ON public.venue_payout_requests(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_venue_payout_requests_status
  ON public.venue_payout_requests(status, created_at DESC);

ALTER TABLE public.venue_payout_requests ENABLE ROW LEVEL SECURITY;

-- Turf owner can see their own requests
DROP POLICY IF EXISTS venue_payout_requests_owner_select ON public.venue_payout_requests;
CREATE POLICY venue_payout_requests_owner_select ON public.venue_payout_requests
  FOR SELECT USING (owner_id = auth.uid());

-- Turf owner can insert their own requests
DROP POLICY IF EXISTS venue_payout_requests_owner_insert ON public.venue_payout_requests;
CREATE POLICY venue_payout_requests_owner_insert ON public.venue_payout_requests
  FOR INSERT WITH CHECK (owner_id = auth.uid());

-- Admin can see all
DROP POLICY IF EXISTS venue_payout_requests_admin_all ON public.venue_payout_requests;
CREATE POLICY venue_payout_requests_admin_all ON public.venue_payout_requests
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND (role IN ('admin','super_admin') OR is_admin = true)
    )
  );

-- ─── 5. request_venue_withdrawal RPC ─────────────────────────────────────────
-- Turf owner calls this to request a payout from their venue_owner_balance.
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
  v_balance numeric;
  v_request_id uuid;
BEGIN
  SELECT venue_owner_balance INTO v_balance
  FROM public.profiles
  WHERE id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'profile_not_found');
  END IF;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'amount_must_be_positive');
  END IF;

  IF v_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_balance',
      'available', v_balance);
  END IF;

  -- Hold the amount (deduct from balance immediately, refund if rejected)
  UPDATE public.profiles
  SET venue_owner_balance = venue_owner_balance - p_amount
  WHERE id = auth.uid();

  INSERT INTO public.venue_payout_requests
    (owner_id, venue_id, amount, status, phone_number, provider, notes)
  VALUES
    (auth.uid(), p_venue_id, p_amount, 'pending', p_phone_number, p_provider, p_notes)
  RETURNING id INTO v_request_id;

  -- Notify admin
  INSERT INTO public.notifications (user_id, title, body, type, data)
  SELECT p.id,
    'New withdrawal request',
    'Turf owner requested ₵' || p_amount || ' payout via ' || p_provider,
    'payment_received',
    jsonb_build_object('payout_request_id', v_request_id, 'amount', p_amount)
  FROM public.profiles p
  WHERE p.role IN ('admin','super_admin') OR p.is_admin = true;

  RETURN jsonb_build_object('success', true, 'request_id', v_request_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_venue_withdrawal(numeric, text, text, uuid, text)
  TO authenticated;

-- ─── 6. finalize_venue_withdrawal RPC ────────────────────────────────────────
-- Admin approves or rejects a venue payout request.
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
    SET status = 'rejected', admin_note = p_admin_note, resolved_at = now()
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
