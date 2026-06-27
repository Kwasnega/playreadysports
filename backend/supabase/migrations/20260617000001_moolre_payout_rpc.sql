-- Moolre Payout Processing
-- Allows admins to approve payout requests and trigger Moolre disbursement

CREATE OR REPLACE FUNCTION public.approve_payout_request(
  p_request_id uuid,
  p_approved_by_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
  v_current_status text;
  v_approver_role text;
BEGIN
  -- Verify approver is admin
  SELECT role INTO v_approver_role FROM profiles
  WHERE id = p_approved_by_user_id
  LIMIT 1;

  IF v_approver_role NOT IN ('admin', 'super_admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  -- Get request with lock
  SELECT * INTO v_request FROM venue_payout_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'request_not_found');
  END IF;

  -- Only approve pending requests
  IF v_request.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invalid_status',
      'current_status', v_request.status
    );
  END IF;

  -- Update to "pending_moolre" (ready for moolre-payout edge function)
  UPDATE venue_payout_requests
  SET status = 'pending_moolre',
      approved_at = now(),
      approved_by = p_approved_by_user_id,
      updated_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'message', 'Payout approved. Processing disbursement via Moolre...'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_payout_request(uuid, uuid)
  TO authenticated, service_role;

-- Optional: Add columns to venue_payout_requests if not already present
-- (These should already exist from previous migrations, but just in case)
DO $$ BEGIN
  ALTER TABLE public.venue_payout_requests
    ADD COLUMN IF NOT EXISTS moolre_reference text,
    ADD COLUMN IF NOT EXISTS moolre_transaction_id text,
    ADD COLUMN IF NOT EXISTS processing_started_at timestamp with time zone,
    ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone,
    ADD COLUMN IF NOT EXISTS error_reason text,
    ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES profiles(id),
    ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone;
EXCEPTION WHEN others THEN
  NULL; -- Columns already exist
END $$;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_venue_payout_requests_status
  ON public.venue_payout_requests(status);

CREATE INDEX IF NOT EXISTS idx_venue_payout_requests_owner
  ON public.venue_payout_requests(owner_id);
