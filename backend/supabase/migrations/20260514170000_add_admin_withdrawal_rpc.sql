-- Add is_admin column to profiles if not exists (used by admin RLS policies)
DO $$ BEGIN
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Add UPDATE policy so admins can update wallet_transactions
DROP POLICY IF EXISTS "Admin can update wallet transactions" ON public.wallet_transactions;
CREATE POLICY "Admin can update wallet transactions"
    ON public.wallet_transactions
    FOR UPDATE
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- RPC: admin approves or rejects a pending withdrawal
CREATE OR REPLACE FUNCTION public.admin_approve_withdrawal(
    p_tx_id UUID,
    p_approve BOOLEAN, -- true = approve, false = reject
    p_reason TEXT DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
    v_user_id UUID;
    v_amount NUMERIC;
    v_current_status TEXT;
BEGIN
    -- Get transaction details
    SELECT user_id, ABS(amount), status
    INTO v_user_id, v_amount, v_current_status
    FROM public.wallet_transactions
    WHERE id = p_tx_id AND type = 'withdrawal';

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Transaction not found');
    END IF;

    IF v_current_status != 'pending' THEN
        RETURN json_build_object('success', false, 'error', 'Transaction is not pending');
    END IF;

    -- Check caller is admin
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    IF p_approve THEN
        UPDATE public.wallet_transactions
        SET status = 'completed',
            reason = COALESCE(p_reason, 'Approved by admin'),
            updated_at = now()
        WHERE id = p_tx_id;
        INSERT INTO public.notifications (user_id, title, body, type, data)
        VALUES (v_user_id, 'Withdrawal Approved', 'Your ₵' || v_amount || ' withdrawal has been approved.', 'payment_received', jsonb_build_object('tx_id', p_tx_id));
        RETURN json_build_object('success', true, 'action', 'approved');
    ELSE
        PERFORM public.finalize_withdrawal(p_tx_id, 'failed', NULL, COALESCE(p_reason, 'Rejected by admin'));
        INSERT INTO public.notifications (user_id, title, body, type, data)
        VALUES (v_user_id, 'Withdrawal Rejected', 'Your ₵' || v_amount || ' withdrawal was rejected. Funds returned to wallet.', 'account', jsonb_build_object('tx_id', p_tx_id));
        RETURN json_build_object('success', true, 'action', 'rejected', 'refunded', true);
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
