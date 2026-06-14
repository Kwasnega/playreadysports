-- Add metadata column to wallet_transactions for withdrawal details (phone, provider, paystack refs)
ALTER TABLE public.wallet_transactions
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

-- Add reason column for failure/success messages
ALTER TABLE public.wallet_transactions
ADD COLUMN IF NOT EXISTS reason TEXT DEFAULT NULL;

-- Add index for withdrawal lookups
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_withdrawal
ON public.wallet_transactions(user_id, type, status)
WHERE type = 'withdrawal';

-- RPC: process wallet withdrawal (deduct + record transaction)
CREATE OR REPLACE FUNCTION public.process_wallet_withdrawal(
    p_user_id UUID,
    p_amount NUMERIC, -- positive amount to withdraw
    p_reference TEXT,
    p_phone TEXT,
    p_provider TEXT
) RETURNS JSON AS $$
DECLARE
    v_balance NUMERIC;
    v_tx_id UUID;
BEGIN
    -- 1. Lock and get balance
    SELECT balance INTO v_balance
    FROM public.wallet_balances
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Wallet not found');
    END IF;

    -- 2. Check sufficient funds
    IF v_balance < p_amount THEN
        RETURN json_build_object('success', false, 'error', 'Insufficient balance');
    END IF;

    -- 3. Deduct balance
    UPDATE public.wallet_balances
    SET balance = balance - p_amount,
        updated_at = now()
    WHERE user_id = p_user_id;

    -- 4. Record pending withdrawal transaction
    INSERT INTO public.wallet_transactions (
        user_id, amount, type, reference, status, metadata
    ) VALUES (
        p_user_id,
        -p_amount,
        'withdrawal',
        p_reference,
        'pending',
        jsonb_build_object('phone', p_phone, 'provider', p_provider)
    )
    RETURNING id INTO v_tx_id;

    RETURN json_build_object('success', true, 'tx_id', v_tx_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: finalize withdrawal (update status after Paystack response)
CREATE OR REPLACE FUNCTION public.finalize_withdrawal(
    p_tx_id UUID,
    p_status TEXT, -- 'completed' or 'failed'
    p_paystack_ref TEXT DEFAULT NULL,
    p_reason TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    v_user_id UUID;
    v_amount NUMERIC;
BEGIN
    -- Get transaction details
    SELECT user_id, ABS(amount) INTO v_user_id, v_amount
    FROM public.wallet_transactions
    WHERE id = p_tx_id AND type = 'withdrawal' AND status = 'pending';

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- Update transaction status
    UPDATE public.wallet_transactions
    SET status = p_status,
        reference = COALESCE(p_paystack_ref, reference),
        reason = p_reason,
        updated_at = now()
    WHERE id = p_tx_id;

    -- If failed, refund the wallet
    IF p_status = 'failed' THEN
        UPDATE public.wallet_balances
        SET balance = balance + v_amount,
            updated_at = now()
        WHERE user_id = v_user_id;

        -- Record refund transaction
        INSERT INTO public.wallet_transactions (user_id, amount, type, reference, status, reason)
        VALUES (v_user_id, v_amount, 'refund', 'refund_' || p_tx_id, 'completed', 'Withdrawal failed: ' || COALESCE(p_reason, 'Unknown'));
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
