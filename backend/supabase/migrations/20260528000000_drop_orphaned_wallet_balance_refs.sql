-- ============================================================
-- Migration: Drop orphaned references to profiles.wallet_balance
-- ============================================================

-- 1. Find every function that still references profiles.wallet_balance
--    (Run this in Supabase SQL Editor to see what needs fixing)
/*
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND pg_get_functiondef(p.oid) ILIKE '%wallet_balance%';
*/

-- 2. Find every trigger whose function references wallet_balance
/*
SELECT
  tgname AS trigger_name,
  relname AS table_name,
  proname AS function_name
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_proc p ON t.tgfoid = p.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND pg_get_functiondef(p.oid) ILIKE '%wallet_balance%';
*/

-- 3. Fix: Drop any old 4-argument process_wallet_transaction that
--    still reads from profiles.wallet_balance (superseded by the
--    6-argument version in fix_critical_bugs.sql)
DROP FUNCTION IF EXISTS public.process_wallet_transaction(uuid, numeric, text, text);

-- 4. Fix: Drop any orphaned trigger functions referencing profiles.wallet_balance.
--    Replace <function_name> with the actual name found from query #2 above.
--    Example:
-- DROP FUNCTION IF EXISTS public.some_old_sync_trigger() CASCADE;

-- 5. If you get the exact function name from the error, drop it here.
--    (Paste the name from query #1 results)

-- 6. Safety: ensure the canonical process_wallet_transaction exists
--    and reads from wallet_balances (re-run if needed)
CREATE OR REPLACE FUNCTION public.process_wallet_transaction(
  p_user_id     uuid,
  p_amount      numeric,
  p_type        text,
  p_reference   text DEFAULT NULL,
  p_match_id    uuid DEFAULT NULL,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current       numeric;
  v_type_enum     public.wallet_transaction_type;
  v_new_balance   numeric;
BEGIN
  v_type_enum := p_type::public.wallet_transaction_type;

  SELECT balance INTO v_current
  FROM public.wallet_balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.wallet_balances (user_id, balance)
    VALUES (p_user_id, 0.00)
    ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
    RETURNING balance INTO v_current;
  END IF;

  IF p_amount < 0 AND (v_current + p_amount) < 0 THEN
    RAISE EXCEPTION 'Insufficient wallet balance';
  END IF;

  UPDATE public.wallet_balances
  SET balance = balance + p_amount,
      updated_at = now()
  WHERE user_id = p_user_id;

  v_new_balance := v_current + p_amount;

  INSERT INTO public.wallet_transactions (
    user_id, amount, type, status, reference, match_id, description, balance_after
  ) VALUES (
    p_user_id, p_amount, v_type_enum, 'completed', p_reference, p_match_id, p_description, v_new_balance
  );

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_wallet_transaction(uuid, numeric, text, text, uuid, text)
  TO authenticated, service_role;
