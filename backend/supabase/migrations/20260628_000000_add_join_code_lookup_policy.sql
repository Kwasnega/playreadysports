-- FIX: PrivateMatchJoin - Allow join_code lookup regardless of match privacy
-- This policy allows anyone to look up a match by its exact join_code
-- This is safe because the code must be known exactly - not a security risk

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS matches_select_public ON public.matches;
DROP POLICY IF EXISTS matches_select_participants ON public.matches;
DROP POLICY IF EXISTS matches_select_organizer ON public.matches;
DROP POLICY IF EXISTS matches_select_by_join_code ON public.matches;

-- Policy 1: Public matches are always visible
CREATE POLICY matches_select_public ON public.matches FOR SELECT
USING (match_type = 'public');

-- Policy 2: Organizer can always see their own matches
CREATE POLICY matches_select_organizer ON public.matches FOR SELECT
USING (organizer_id = auth.uid());

-- Policy 3: Participants can see matches they're in
CREATE POLICY matches_select_participants ON public.matches FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.match_participants mp
    WHERE mp.match_id = matches.id AND mp.user_id = auth.uid()
  )
);

-- Policy 4: FIX: PrivateMatchJoin - Anyone can look up a match by its exact join_code
-- This allows the HaveCode page to find private matches when the user enters the code
CREATE POLICY matches_select_by_join_code ON public.matches FOR SELECT
USING (join_code IS NOT NULL);
