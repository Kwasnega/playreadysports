-- Escrow release fields, platform settings seeds, payout RPCs

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS organizer_incentive_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS escrow_released_at timestamptz;

INSERT INTO public.platform_settings (key, value, description)
VALUES
  ('organizer_incentive_amount', '5.00', 'Flat GHS credited to organizer Play wallet when match completes'),
  ('cancel_cutoff_minutes', '60', 'Minutes before kickoff when organizer cannot cancel'),
  ('commission_rate', '0.05', 'Platform fee as decimal taken from venue gross on completion')
ON CONFLICT (key) DO NOTHING;

-- Edge functions (service role) can read payout settings
DROP POLICY IF EXISTS platform_settings_select_payout_keys ON public.platform_settings;
CREATE POLICY platform_settings_select_payout_keys ON public.platform_settings
  FOR SELECT USING (key IN ('commission_rate', 'organizer_incentive_amount', 'cancel_cutoff_minutes'));

-- Admin can update any venue (approve pending, assign owner)
DROP POLICY IF EXISTS venues_update_admin ON public.venues;
CREATE POLICY venues_update_admin ON public.venues
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

DROP POLICY IF EXISTS venues_select_admin ON public.venues;
CREATE POLICY venues_select_admin ON public.venues
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

-- Admin can promote profiles to turf_owner
DROP POLICY IF EXISTS profiles_update_admin ON public.profiles;
CREATE POLICY profiles_update_admin ON public.profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
  );

-- Credit withdrawable venue owner balance (not Play wallet)
CREATE OR REPLACE FUNCTION public.credit_venue_owner_balance(
  p_user_id uuid,
  p_amount numeric,
  p_reference text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN true;
  END IF;

  UPDATE public.profiles
  SET venue_owner_balance = COALESCE(venue_owner_balance, 0) + p_amount,
      updated_at = now()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for venue owner %', p_user_id;
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.credit_venue_owner_balance(uuid, numeric, text) TO service_role;
