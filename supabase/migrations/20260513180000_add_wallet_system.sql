-- Create wallet_balances table
CREATE TABLE IF NOT EXISTS public.wallet_balances (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    balance NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (balance >= 0),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create wallet_transactions table
DO $$ BEGIN
    CREATE TYPE public.wallet_transaction_type AS ENUM ('deposit', 'spend', 'refund', 'cashback', 'bonus', 'tip', 'withdrawal');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    type public.wallet_transaction_type NOT NULL,
    reference TEXT UNIQUE, -- e.g., paystack transaction reference, or match_id
    status TEXT NOT NULL DEFAULT 'completed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS Policies for wallet_balances
ALTER TABLE public.wallet_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own wallet balance" ON public.wallet_balances;
CREATE POLICY "Users can view their own wallet balance" 
    ON public.wallet_balances 
    FOR SELECT 
    USING (auth.uid() = user_id);

-- RLS Policies for wallet_transactions
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own wallet transactions" ON public.wallet_transactions;
CREATE POLICY "Users can view their own wallet transactions" 
    ON public.wallet_transactions 
    FOR SELECT 
    USING (auth.uid() = user_id);

-- Admin policies for wallet tables
DROP POLICY IF EXISTS "Admin can view all wallet transactions" ON public.wallet_transactions;
CREATE POLICY "Admin can view all wallet transactions"
    ON public.wallet_transactions
    FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

DROP POLICY IF EXISTS "Admin can view all wallet balances" ON public.wallet_balances;
CREATE POLICY "Admin can view all wallet balances"
    ON public.wallet_balances
    FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- Trigger to create wallet for new users
CREATE OR REPLACE FUNCTION public.handle_new_user_wallet()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.wallet_balances (user_id, balance)
  VALUES (new.id, 0);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add trigger for auth.users if it doesn't exist
DROP TRIGGER IF EXISTS on_auth_user_created_wallet ON auth.users;
CREATE TRIGGER on_auth_user_created_wallet
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_wallet();

-- Backfill wallet balances for existing users
INSERT INTO public.wallet_balances (user_id, balance)
SELECT id, 0 FROM auth.users
ON CONFLICT (user_id) DO NOTHING;


-- RPC: process_wallet_transaction (For Edge Functions to deposit)
CREATE OR REPLACE FUNCTION public.process_wallet_transaction(
    p_user_id UUID,
    p_amount NUMERIC,
    p_type public.wallet_transaction_type,
    p_reference TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    v_current_balance NUMERIC;
BEGIN
    -- For deposits, amount should be positive. For spends, it should be negative.
    
    -- 1. Lock the row to prevent race conditions
    SELECT balance INTO v_current_balance
    FROM public.wallet_balances
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Wallet not found for user %', p_user_id;
    END IF;

    -- 2. Check sufficient funds for spends
    IF v_current_balance + p_amount < 0 THEN
        RAISE EXCEPTION 'Insufficient wallet balance';
    END IF;

    -- 3. Update balance
    UPDATE public.wallet_balances
    SET 
        balance = balance + p_amount,
        updated_at = now()
    WHERE user_id = p_user_id;

    -- 4. Record transaction
    INSERT INTO public.wallet_transactions (user_id, amount, type, reference)
    VALUES (p_user_id, p_amount, p_type, p_reference);

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- RPC: join_match_with_wallet
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
    FOR UPDATE; -- Lock match row

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
