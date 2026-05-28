-- ============================================================
-- Migration: Fix join_match_with_wallet to set match status 'full'
--
-- H3: When the last core slot is filled via wallet join, the match
--     status was never updated to 'full'. join-match Edge Function
--     does update it, but wallet-based joins bypass that function.
-- ============================================================

CREATE OR REPLACE FUNCTION public.join_match_with_wallet(
    p_match_id UUID,
    p_user_id  UUID,
    p_team     TEXT,
    p_slot_type TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_match_fee       NUMERIC;
    v_max_core        INTEGER;
    v_current_core    INTEGER;
    v_balance         NUMERIC;
    v_participant_id  UUID;
    v_tx_ref          TEXT;
    v_new_paid_count  INTEGER;
BEGIN
    -- 1. Lock and read match
    SELECT entry_fee, COALESCE(max_core_players, players_per_side, 10)
    INTO v_match_fee, v_max_core
    FROM public.matches
    WHERE id = p_match_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'match_not_found');
    END IF;

    -- 2. Check capacity
    SELECT COUNT(*) INTO v_current_core
    FROM public.match_participants
    WHERE match_id = p_match_id
      AND slot_type = 'core'
      AND status   = 'active';

    IF v_current_core >= v_max_core THEN
        RETURN json_build_object('success', false, 'error', 'match_full');
    END IF;

    -- 3. Deduct from wallet if paid match
    IF v_match_fee > 0 THEN
        SELECT balance INTO v_balance
        FROM public.wallet_balances
        WHERE user_id = p_user_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RETURN json_build_object('success', false, 'error', 'wallet_not_found');
        END IF;

        IF v_balance < v_match_fee THEN
            RETURN json_build_object('success', false, 'error', 'insufficient_balance');
        END IF;

        UPDATE public.wallet_balances
        SET balance    = balance - v_match_fee,
            updated_at = now()
        WHERE user_id = p_user_id;

        v_tx_ref := 'join_' || p_match_id || '_' || extract(epoch from now());
        INSERT INTO public.wallet_transactions (user_id, amount, type, reference, match_id)
        VALUES (p_user_id, -v_match_fee, 'spend', v_tx_ref, p_match_id);
    END IF;

    -- 4. Insert participant — 'paid' for both free and paid matches
    INSERT INTO public.match_participants (
        match_id, user_id, team, slot_type, payment_status, status
    ) VALUES (
        p_match_id,
        p_user_id,
        p_team::public.team_side,
        p_slot_type::public.slot_type,
        'paid'::public.payment_status,
        'active'::public.participant_status
    ) RETURNING id INTO v_participant_id;

    -- 5. Increment paid count for paid core slots and check if match is now full
    IF p_slot_type = 'core' AND v_match_fee > 0 THEN
        UPDATE public.matches
        SET core_paid_count = core_paid_count + 1
        WHERE id = p_match_id
        RETURNING core_paid_count INTO v_new_paid_count;

        -- Mark match full when last core slot is filled
        IF v_new_paid_count >= v_max_core THEN
            UPDATE public.matches
            SET status = 'full'
            WHERE id = p_match_id
              AND status NOT IN ('completed', 'cancelled', 'full');
        END IF;
    END IF;

    RETURN json_build_object('success', true, 'participant_id', v_participant_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_match_with_wallet(UUID, UUID, TEXT, TEXT)
  TO authenticated, service_role;
