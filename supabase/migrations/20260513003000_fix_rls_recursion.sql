-- ============================================================
-- FIX: Infinite recursion in match_participants RLS policy
-- ============================================================

-- The mp_select_match policy referenced match_participants inside its own
-- policy subquery, causing infinite recursion (42P17).
--
-- Fix: remove the self-referencing subquery. Instead:
--   1. Users can read their own participant row
--   2. Organizers can read all participants in their match
--   3. Anyone can read participants for PUBLIC matches (needed for home feed
--      to show "spots left" counts to anonymous / non-participant users)

DROP POLICY IF EXISTS mp_select_match ON public.match_participants;

CREATE POLICY mp_select_match ON public.match_participants FOR SELECT USING (
  user_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = match_participants.match_id AND m.organizer_id = auth.uid()
  ) OR
  EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = match_participants.match_id AND m.match_type = 'public'
  )
);
