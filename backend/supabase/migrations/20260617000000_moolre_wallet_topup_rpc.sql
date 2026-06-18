-- Moolre wallet top-up finalization.
-- Keeps wallet crediting idempotent across redirect verification and webhooks.

CREATE OR REPLACE FUNCTION public.complete_wallet_topup(
  p_user_id     uuid,
  p_amount      numeric,
  p_reference   text,
  p_description text DEFAULT 'Wallet top-up'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx             RECORD;
  v_current        numeric;
  v_new_balance    numeric;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'amount_must_be_positive');
  END IF;

  SELECT *
  INTO v_tx
  FROM public.wallet_transactions
  WHERE reference = p_reference
  FOR UPDATE;

  IF FOUND THEN
    IF v_tx.user_id <> p_user_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'reference_user_mismatch');
    END IF;

    IF v_tx.status = 'completed' THEN
      RETURN jsonb_build_object(
        'success', true,
        'already_processed', true,
        'new_balance', v_tx.balance_after
      );
    END IF;
  END IF;

  SELECT balance
  INTO v_current
  FROM public.wallet_balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.wallet_balances (user_id, balance)
    VALUES (p_user_id, 0.00)
    ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
    RETURNING balance INTO v_current;
  END IF;

  UPDATE public.wallet_balances
  SET balance = balance + p_amount,
      updated_at = now()
  WHERE user_id = p_user_id;

  v_new_balance := v_current + p_amount;

  IF v_tx.id IS NULL THEN
    INSERT INTO public.wallet_transactions (
      user_id, amount, type, status, reference, description, balance_after
    ) VALUES (
      p_user_id, p_amount, 'deposit', 'completed', p_reference, p_description, v_new_balance
    );
  ELSE
    UPDATE public.wallet_transactions
    SET amount = p_amount,
        type = 'deposit',
        status = 'completed',
        description = p_description,
        balance_after = v_new_balance,
        updated_at = now()
    WHERE id = v_tx.id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'already_processed', false,
    'new_balance', v_new_balance
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_wallet_topup(uuid, numeric, text, text)
  TO authenticated, service_role;
