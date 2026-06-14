-- Fix join_match_with_wallet: grant execute to authenticated + handle missing wallet row

-- Grant execute to authenticated users (was missing, causing permission denied on lobby join)
GRANT EXECUTE ON FUNCTION public.join_match_with_wallet(UUID, UUID, TEXT, TEXT) TO authenticated, service_role;

-- Recreate function with proper "wallet not found" check
CREATE OR REPLACE FUNCTION public.join_match_with_wallet(
    p_match_id UUID,
    p_user_id UUID,
    p_team TEXT,
    p_slot_type TEXT
) RETURNS JSON AS $$
DECLARE
    v_match_fee NUMERIC;
    v_max_core INTEGER;
    v_current_core INTEGER;
    v_balance NUMERIC;
    v_participant_id UUID;
    v_tx_ref TEXT;
BEGIN
    -- 1. Get match details
    SELECT entry_fee, COALESCE(max_core_players, players_per_side, 10)
    INTO v_match_fee, v_max_core
    FROM public.matches
    WHERE id = p_match_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Match not found';
    END IF;

    -- 2. Check capacity if joining as core
    IF p_slot_type = 'core' THEN
        SELECT COUNT(*) INTO v_current_core
        FROM public.match_participants
        WHERE match_id = p_match_id AND status = 'active' AND slot_type = 'core';

        IF v_current_core >= v_max_core THEN
            RAISE EXCEPTION 'Match core slots are full';
        END IF;
    END IF;

    -- 3. Deduct from Wallet if there is a fee
    IF v_match_fee > 0 THEN
        -- Lock wallet balance
        SELECT balance INTO v_balance
        FROM public.wallet_balances
        WHERE user_id = p_user_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Wallet not found for user %', p_user_id;
        END IF;

        IF v_balance < v_match_fee THEN
            RAISE EXCEPTION 'Insufficient wallet balance';
        END IF;

        -- Deduct
        UPDATE public.wallet_balances
        SET balance = balance - v_match_fee, updated_at = now()
        WHERE user_id = p_user_id;

        -- Record transaction
        v_tx_ref := 'join_' || p_match_id || '_' || extract(epoch from now());
        INSERT INTO public.wallet_transactions (user_id, amount, type, reference)
        VALUES (p_user_id, -v_match_fee, 'spend', v_tx_ref);
    END IF;

    -- 4. Insert participant
    INSERT INTO public.match_participants (
        match_id, user_id, team, slot_type, payment_status, status
    ) VALUES (
        p_match_id, p_user_id, p_team::public.team_side, p_slot_type::public.slot_type,
        (CASE WHEN v_match_fee > 0 THEN 'paid' ELSE 'none' END)::public.payment_status,
        'active'::public.participant_status
    ) RETURNING id INTO v_participant_id;

    -- 5. Update match core_paid_count if applicable
    IF p_slot_type = 'core' AND v_match_fee > 0 THEN
        UPDATE public.matches
        SET core_paid_count = core_paid_count + 1
        WHERE id = p_match_id;
    END IF;

    RETURN json_build_object('success', true, 'participant_id', v_participant_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.join_match_with_wallet(UUID, UUID, TEXT, TEXT) TO authenticated, service_role;
