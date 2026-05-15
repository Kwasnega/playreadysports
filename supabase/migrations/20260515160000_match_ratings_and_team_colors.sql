-- Match ratings (Man of the Match voting) and team color columns

-- 1. Team color preset columns on matches (public matches only use these)
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS team_color_a text NOT NULL DEFAULT 'Red',
  ADD COLUMN IF NOT EXISTS team_color_b text NOT NULL DEFAULT 'Blue';

COMMENT ON COLUMN public.matches.team_color_a IS 'Preset team color name for team A (e.g. Red, Black, Green)';
COMMENT ON COLUMN public.matches.team_color_b IS 'Preset team color name for team B (e.g. Blue, Yellow, White)';

-- 2. Match ratings table for MOTM voting
CREATE TABLE IF NOT EXISTS public.match_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rated_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'motm',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT match_ratings_one_vote_per_voter UNIQUE (match_id, voter_id)
);

CREATE INDEX IF NOT EXISTS idx_match_ratings_match ON public.match_ratings(match_id);
CREATE INDEX IF NOT EXISTS idx_match_ratings_rated_user ON public.match_ratings(rated_user_id);

ALTER TABLE public.match_ratings ENABLE ROW LEVEL SECURITY;

-- Participants of the match can vote
DROP POLICY IF EXISTS match_ratings_insert_participant ON public.match_ratings;
CREATE POLICY match_ratings_insert_participant ON public.match_ratings
  FOR INSERT WITH CHECK (
    voter_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.match_participants mp
      WHERE mp.match_id = match_ratings.match_id
        AND mp.user_id = auth.uid()
        AND mp.status = 'active'
    )
  );

-- Anyone can read ratings
DROP POLICY IF EXISTS match_ratings_select_all ON public.match_ratings;
CREATE POLICY match_ratings_select_all ON public.match_ratings
  FOR SELECT USING (true);

-- 3. Waitlist status addition to participant_status enum (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.participant_status'::regtype
      AND enumlabel = 'waitlisted'
  ) THEN
    ALTER TYPE public.participant_status ADD VALUE IF NOT EXISTS 'waitlisted';
  END IF;
EXCEPTION WHEN others THEN
  -- enum might not exist as a formal type, skip
  NULL;
END $$;

-- 4. RPC to get MOTM vote counts for a match
CREATE OR REPLACE FUNCTION public.get_motm_votes(p_match_id uuid)
RETURNS TABLE (rated_user_id uuid, vote_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT mr.rated_user_id, count(*) as vote_count
  FROM public.match_ratings mr
  WHERE mr.match_id = p_match_id
  GROUP BY mr.rated_user_id
  ORDER BY vote_count DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_motm_votes(uuid) TO authenticated;

-- 5. Venue deduplication: unique constraint on normalized name + city
CREATE UNIQUE INDEX IF NOT EXISTS idx_venues_unique_name_city
  ON public.venues (lower(trim(name)), lower(trim(city)))
  WHERE status != 'rejected';
