-- ============================================================
-- FIX: Cross-table RLS recursion between matches ↔ match_participants
-- ============================================================

-- Problem:
--   matches_select_participants checks match_participants
--   mp_select_match checks matches (organizer subquery)
--   → infinite recursion when querying matches with embedded participants
--
-- Solution: remove the participant-based select policy on matches.
--   Public matches are readable by all (matches_select_public).
--   Private matches only by organizer (matches_select_organizer).
--   This breaks the recursion and keeps the home page working.

DROP POLICY IF EXISTS matches_select_participants ON public.matches;

-- Ensure mp_select_match is also clean (no self-reference)
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
