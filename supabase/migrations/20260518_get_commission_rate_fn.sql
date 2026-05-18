-- ============================================================
-- get_commission_rate() — narrow public accessor
--
-- After locking platform_settings to admin-only, turf owners
-- still need the commission rate to display net earnings.
-- This SECURITY DEFINER function returns ONLY that one value
-- to any authenticated user without exposing the full table.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_commission_rate()
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(value::numeric, 0.05)
  FROM public.platform_settings
  WHERE key = 'commission_rate'
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.get_commission_rate() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_commission_rate() TO authenticated;
