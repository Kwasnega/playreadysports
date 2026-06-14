-- ============================================================
-- PAYMENT & ESCROW — Additional RLS policies
-- ============================================================

-- 1. Transactions: users can insert their own payment records
DROP POLICY IF EXISTS txn_insert_own ON public.transactions;
CREATE POLICY txn_insert_own ON public.transactions
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- 2. Transactions: organizer can insert payout records for their matches
DROP POLICY IF EXISTS txn_insert_payout ON public.transactions;
CREATE POLICY txn_insert_payout ON public.transactions
  FOR INSERT WITH CHECK (
    type = 'payout'
    AND EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = transactions.match_id AND m.organizer_id = auth.uid()
    )
  );

-- 3. Match participants: organizer can update payment_status (for refunds)
-- (already exists: mp_update_organizer covers this)

-- 4. Ensure match_participants.payment_reference is accessible for updates
-- (covered by existing mp_update_own + mp_update_organizer)
