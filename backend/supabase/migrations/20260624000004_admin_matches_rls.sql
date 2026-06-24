-- ============================================================
-- Migration: 20260624000004_admin_matches_rls.sql
-- Fixes Issue 8: Allow admins to read all matches
-- ============================================================

CREATE POLICY "Admin can read all matches" 
ON public.matches 
FOR SELECT 
USING (
  (auth.jwt() ->> 'role' = 'admin') OR 
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
);
