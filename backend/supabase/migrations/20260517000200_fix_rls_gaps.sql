-- Fix multiple RLS policy gaps identified in the security audit.

-- ─────────────────────────────────────────
-- 1. transactions — allow service_role INSERT (edge functions use service role)
-- ─────────────────────────────────────────
DROP POLICY IF EXISTS "service_role can insert transactions" ON public.transactions;
CREATE POLICY "service_role can insert transactions"
  ON public.transactions
  FOR INSERT
  TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS "service_role can update transactions" ON public.transactions;
CREATE POLICY "service_role can update transactions"
  ON public.transactions
  FOR UPDATE
  TO service_role
  USING (true);

-- ─────────────────────────────────────────
-- 2. bookings — missing INSERT/UPDATE/SELECT policies
-- ─────────────────────────────────────────
ALTER TABLE IF EXISTS public.bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own bookings" ON public.bookings;
CREATE POLICY "Users can view own bookings"
  ON public.bookings
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR venue_id IN (
      SELECT id FROM public.venues WHERE owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Users can create own bookings" ON public.bookings;
CREATE POLICY "Users can create own bookings"
  ON public.bookings
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own bookings" ON public.bookings;
CREATE POLICY "Users can update own bookings"
  ON public.bookings
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "service_role full bookings access" ON public.bookings;
CREATE POLICY "service_role full bookings access"
  ON public.bookings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────
-- 3. reports — reporters can view their own reports
-- ─────────────────────────────────────────
DROP POLICY IF EXISTS "reporters can view own reports" ON public.reports;
CREATE POLICY "reporters can view own reports"
  ON public.reports
  FOR SELECT
  USING (reporter_id = auth.uid());

-- ─────────────────────────────────────────
-- 4. venue_payout_requests — ensure service_role has full access
-- ─────────────────────────────────────────
DROP POLICY IF EXISTS "service_role full payout access" ON public.venue_payout_requests;
CREATE POLICY "service_role full payout access"
  ON public.venue_payout_requests
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────
-- 5. wallet_transactions — service_role INSERT
-- ─────────────────────────────────────────
DROP POLICY IF EXISTS "service_role can insert wallet_transactions" ON public.wallet_transactions;
CREATE POLICY "service_role can insert wallet_transactions"
  ON public.wallet_transactions
  FOR INSERT
  TO service_role
  WITH CHECK (true);
