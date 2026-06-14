-- ============================================================
-- Phase 2.4: Add transactions INSERT RLS policy for service_role
-- Edge functions using service role key need INSERT on transactions.
-- ============================================================

-- Allow service_role to insert into transactions
DROP POLICY IF EXISTS "service_role can insert transactions" ON public.transactions;
CREATE POLICY "service_role can insert transactions"
  ON public.transactions FOR INSERT TO service_role
  WITH CHECK (true);

-- Allow authenticated users to view their own transactions
DROP POLICY IF EXISTS "users can view own transactions" ON public.transactions;
CREATE POLICY "users can view own transactions"
  ON public.transactions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Allow service_role full access for admin/reconciliation
DROP POLICY IF EXISTS "service_role full access on transactions" ON public.transactions;
CREATE POLICY "service_role full access on transactions"
  ON public.transactions FOR ALL TO service_role
  USING (true) WITH CHECK (true);
