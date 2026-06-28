-- ============================================================
-- FIX: Remove recursive matches_select_participants policy causing infinite recursion
-- ============================================================

DROP POLICY IF EXISTS matches_select_participants ON public.matches;
