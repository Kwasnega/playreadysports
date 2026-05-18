-- ============================================================
-- Phase 3.5: Fix process_wallet_transaction type consistency
-- Drops any old version and creates a single canonical function
-- with explicit text → enum cast.
-- ============================================================

-- Drop old versions with different signatures if they exist
DROP FUNCTION IF EXISTS public.process_wallet_transaction(uuid, numeric, text, text);

-- Recreate with explicit enum cast and consistent jsonb return
CREATE OR REPLACE FUNCTION public.process_wallet_transaction(
  p_user_id   uuid,
  p_amount    numeric,
  p_type      text,
  p_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current numeric;
  v_type_enum public.wallet_transaction_type;
BEGIN
  -- Validate and cast type
  BEGIN
    v_type_enum := p_type::public.wallet_transaction_type;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_transaction_type');
  END;

  SELECT wallet_balance INTO v_current
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  IF p_amount < 0 AND (v_current + p_amount) < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_balance');
  END IF;

  UPDATE public.profiles
  SET wallet_balance = wallet_balance + p_amount
  WHERE id = p_user_id;

  -- Log to wallet_transactions
  BEGIN
    INSERT INTO public.wallet_transactions (user_id, amount, type, status, reference)
    VALUES (p_user_id, p_amount, v_type_enum, 'completed', p_reference);
  EXCEPTION WHEN undefined_table THEN NULL; END;

  RETURN jsonb_build_object('success', true, 'new_balance', v_current + p_amount);
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_wallet_transaction(uuid, numeric, text, text)
  TO authenticated, service_role;
