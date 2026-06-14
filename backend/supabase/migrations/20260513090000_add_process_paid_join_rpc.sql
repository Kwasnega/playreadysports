-- ============================================================
-- Add atomic process_paid_join RPC for safe payment processing
-- Wraps participant upsert + transaction insert in one transaction
-- ============================================================

CREATE OR REPLACE FUNCTION public.process_paid_join(
  p_match_id uuid,
  p_user_id uuid,
  p_team text,
  p_payment_reference text,
  p_amount decimal,
  p_slot_type text DEFAULT 'core'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
  v_max int;
  v_status text;
  v_participant_id uuid;
BEGIN
  -- Lock the match row to prevent race conditions
  SELECT max_core_players, status, core_paid_count
  INTO v_max, v_status, v_count
  FROM public.matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'match_not_found');
  END IF;

  IF v_status != 'upcoming' THEN
    RETURN jsonb_build_object('success', false, 'error', 'match_not_upcoming');
  END IF;

  IF v_count >= v_max AND p_slot_type = 'core' THEN
    RETURN jsonb_build_object('success', false, 'error', 'match_full');
  END IF;

  -- Idempotency guard: skip if this reference already processed
  IF EXISTS (
    SELECT 1 FROM public.transactions WHERE payment_reference = p_payment_reference
  ) THEN
    RETURN jsonb_build_object('success', true, 'already_processed', true);
  END IF;

  -- Upsert participant (atomic within this transaction)
  INSERT INTO public.match_participants (
    match_id, user_id, team, slot_type, payment_status, payment_reference, status
  )
  VALUES (
    p_match_id, p_user_id, p_team, p_slot_type, 'paid', p_payment_reference, 'active'
  )
  ON CONFLICT (match_id, user_id)
  DO UPDATE SET
    payment_status = 'paid',
    payment_reference = p_payment_reference,
    status = 'active',
    team = p_team
  RETURNING id INTO v_participant_id;

  -- Record transaction (same transaction)
  INSERT INTO public.transactions (
    match_id, user_id, amount, type, status, payment_reference
  )
  VALUES (
    p_match_id, p_user_id, p_amount, 'entry_fee', 'completed', p_payment_reference
  );

  RETURN jsonb_build_object('success', true, 'participant_id', v_participant_id);
END;
$$;

-- Grant execute to authenticated and service roles
GRANT EXECUTE ON FUNCTION public.process_paid_join(uuid, uuid, text, text, decimal, text)
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.process_paid_join(uuid, uuid, text, text, decimal, text)
  TO service_role;
