-- ============================================================
-- ADD POST-MATCH VOTING SYSTEM
-- Migration to support match voting, results, windowing, and player credibility.
-- ============================================================

-- 1. ENUMS & TYPES
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vote_category') THEN
    CREATE TYPE public.vote_category AS ENUM ('king_of_match', 'second_king_of_match');
  END IF;
END $$;

-- 2. TABLES

-- player_credibility_scores
CREATE TABLE IF NOT EXISTS public.player_credibility_scores (
  player_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  credibility_score numeric NOT NULL DEFAULT 50.0 CHECK (credibility_score >= 0.0 AND credibility_score <= 100.0),
  total_matches_eligible integer NOT NULL DEFAULT 0 CHECK (total_matches_eligible >= 0),
  total_matches_voted integer NOT NULL DEFAULT 0 CHECK (total_matches_voted >= 0),
  participation_rate numeric GENERATED ALWAYS AS (
    CASE WHEN total_matches_eligible = 0 THEN 0.0
    ELSE (total_matches_voted::numeric / total_matches_eligible::numeric * 100.0) END
  ) STORED,
  bias_penalty numeric NOT NULL DEFAULT 0.0 CHECK (bias_penalty >= 0.0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- match_voting_windows
CREATE TABLE IF NOT EXISTS public.match_voting_windows (
  match_id uuid PRIMARY KEY REFERENCES public.matches(id) ON DELETE CASCADE,
  voting_opens_at timestamptz NOT NULL,
  voting_closes_at timestamptz NOT NULL,
  is_resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  CONSTRAINT chk_voting_closes_after_opens CHECK (voting_closes_at > voting_opens_at)
);

-- match_votes
CREATE TABLE IF NOT EXISTS public.match_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nominee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  vote_category public.vote_category NOT NULL,
  raw_score integer NOT NULL CHECK (raw_score >= 1 AND raw_score <= 5),
  voter_credibility_at_time_of_vote numeric NOT NULL DEFAULT 50.0,
  weighted_score numeric GENERATED ALWAYS AS (raw_score * voter_credibility_at_time_of_vote / 100.0) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_match_voter_category UNIQUE (match_id, voter_id, vote_category),
  CONSTRAINT chk_no_self_voting CHECK (nominee_id <> voter_id)
);

-- match_vote_results
CREATE TABLE IF NOT EXISTS public.match_vote_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  winner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category public.vote_category NOT NULL,
  final_weighted_average numeric NOT NULL,
  leaderboard_points_awarded integer GENERATED ALWAYS AS (
    CASE WHEN category = 'king_of_match' THEN 5
    WHEN category = 'second_king_of_match' THEN 3
    ELSE 0 END
  ) STORED,
  CONSTRAINT unique_match_category UNIQUE (match_id, category)
);

-- 3. INDEXES
CREATE INDEX IF NOT EXISTS idx_match_votes_match ON public.match_votes(match_id);
CREATE INDEX IF NOT EXISTS idx_match_votes_voter ON public.match_votes(voter_id);
CREATE INDEX IF NOT EXISTS idx_match_votes_nominee ON public.match_votes(nominee_id);
CREATE INDEX IF NOT EXISTS idx_match_vote_results_match ON public.match_vote_results(match_id);
CREATE INDEX IF NOT EXISTS idx_match_vote_results_winner ON public.match_vote_results(winner_id);

-- 4. ENABLE RLS
ALTER TABLE public.match_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_credibility_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_voting_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_vote_results ENABLE ROW LEVEL SECURITY;

-- 5. RLS POLICIES

-- match_votes policies
CREATE POLICY match_votes_select_own ON public.match_votes
  FOR SELECT TO authenticated USING (auth.uid() = voter_id);

CREATE POLICY match_votes_insert_policy ON public.match_votes
  FOR INSERT TO authenticated
  WITH CHECK (
    voter_id = auth.uid()
    AND nominee_id <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.match_participants mp
      WHERE mp.match_id = match_votes.match_id
        AND mp.user_id = auth.uid()
        AND mp.status = 'active'
    )
    AND EXISTS (
      SELECT 1 FROM public.match_voting_windows mvw
      WHERE mvw.match_id = match_votes.match_id
        AND now() >= mvw.voting_opens_at
        AND now() <= mvw.voting_closes_at
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.match_votes mv
      WHERE mv.match_id = match_votes.match_id
        AND mv.voter_id = auth.uid()
        AND mv.vote_category = match_votes.vote_category
    )
  );

-- player_credibility_scores policies
CREATE POLICY player_credibility_select_own ON public.player_credibility_scores
  FOR SELECT TO authenticated USING (auth.uid() = player_id);

-- match_voting_windows policies
CREATE POLICY match_voting_windows_select_all ON public.match_voting_windows
  FOR SELECT USING (true);

-- match_vote_results policies
CREATE POLICY match_vote_results_select_all ON public.match_vote_results
  FOR SELECT USING (true);

-- 6. GRANTS
GRANT SELECT, INSERT ON public.match_votes TO authenticated;
GRANT SELECT ON public.player_credibility_scores TO authenticated;
GRANT SELECT ON public.match_voting_windows TO authenticated, anon;
GRANT SELECT ON public.match_vote_results TO authenticated, anon;

-- 7. TRIGGERS & FUNCTIONS

-- Trigger function: handle profile credibility synchronization
CREATE OR REPLACE FUNCTION public.handle_new_profile_credibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.player_credibility_scores (player_id)
  VALUES (NEW.id)
  ON CONFLICT (player_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_created_credibility ON public.profiles;
CREATE TRIGGER on_profile_created_credibility
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_profile_credibility();

-- Trigger function: automatically set voting closes at (+2 hours)
CREATE OR REPLACE FUNCTION public.set_voting_closes_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.voting_opens_at IS NOT NULL THEN
    NEW.voting_closes_at := NEW.voting_opens_at + interval '2 hours';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_voting_closes_at ON public.match_voting_windows;
CREATE TRIGGER trg_set_voting_closes_at
  BEFORE INSERT OR UPDATE ON public.match_voting_windows
  FOR EACH ROW EXECUTE FUNCTION public.set_voting_closes_at();

-- Trigger function: handle match completed to open window & update participant eligibility
CREATE OR REPLACE FUNCTION public.handle_match_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    -- Open voting window
    INSERT INTO public.match_voting_windows (match_id, voting_opens_at)
    VALUES (NEW.id, now())
    ON CONFLICT (match_id) DO UPDATE
    SET voting_opens_at = EXCLUDED.voting_opens_at,
        is_resolved = false,
        resolved_at = NULL;

    -- Ensure credibility scores rows exist for active participants
    INSERT INTO public.player_credibility_scores (player_id)
    SELECT user_id FROM public.match_participants
    WHERE match_id = NEW.id AND status = 'active'
    ON CONFLICT (player_id) DO NOTHING;

    -- Increment eligibility count for all active participants
    UPDATE public.player_credibility_scores
    SET total_matches_eligible = total_matches_eligible + 1
    WHERE player_id IN (
      SELECT user_id
      FROM public.match_participants
      WHERE match_id = NEW.id AND status = 'active'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_match_completed_voting_window ON public.matches;
CREATE TRIGGER trg_match_completed_voting_window
  AFTER UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.handle_match_completed();

-- Trigger function: fetch voter credibility snapshot
CREATE OR REPLACE FUNCTION public.populate_voter_credibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credibility numeric;
BEGIN
  -- First ensure player credibility record exists
  INSERT INTO public.player_credibility_scores (player_id)
  VALUES (NEW.voter_id)
  ON CONFLICT (player_id) DO NOTHING;

  SELECT credibility_score INTO v_credibility
  FROM public.player_credibility_scores
  WHERE player_id = NEW.voter_id;

  NEW.voter_credibility_at_time_of_vote := COALESCE(v_credibility, 50.0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_populate_voter_credibility ON public.match_votes;
CREATE TRIGGER trg_populate_voter_credibility
  BEFORE INSERT ON public.match_votes
  FOR EACH ROW EXECUTE FUNCTION public.populate_voter_credibility();

-- Trigger function: track player participation count (total_matches_voted)
CREATE OR REPLACE FUNCTION public.sync_matches_voted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.match_votes
      WHERE match_id = NEW.match_id
        AND voter_id = NEW.voter_id
        AND id <> NEW.id
    ) THEN
      -- First ensure the credibility score row exists
      INSERT INTO public.player_credibility_scores (player_id)
      VALUES (NEW.voter_id)
      ON CONFLICT (player_id) DO NOTHING;

      UPDATE public.player_credibility_scores
      SET total_matches_voted = total_matches_voted + 1
      WHERE player_id = NEW.voter_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.match_votes
      WHERE match_id = OLD.match_id
        AND voter_id = OLD.voter_id
    ) THEN
      UPDATE public.player_credibility_scores
      SET total_matches_voted = GREATEST(0, total_matches_voted - 1)
      WHERE player_id = OLD.voter_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_matches_voted ON public.match_votes;
CREATE TRIGGER trg_sync_matches_voted
  AFTER INSERT OR DELETE ON public.match_votes
  FOR EACH ROW EXECUTE FUNCTION public.sync_matches_voted();

-- Trigger for player_credibility_scores updated_at
DROP TRIGGER IF EXISTS trg_player_credibility_scores_updated_at ON public.player_credibility_scores;
CREATE TRIGGER trg_player_credibility_scores_updated_at
  BEFORE UPDATE ON public.player_credibility_scores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 8. RETROACTIVE DATA INITIALIZATION FOR EXISTING PROFILES
INSERT INTO public.player_credibility_scores (player_id, credibility_score, total_matches_eligible, total_matches_voted, bias_penalty)
SELECT
  p.id,
  50.0,
  (
    SELECT count(*)::integer
    FROM public.match_participants mp
    JOIN public.matches m ON mp.match_id = m.id
    WHERE mp.user_id = p.id
      AND mp.status = 'active'
      AND m.status = 'completed'
  ),
  0,
  0.0
FROM public.profiles p
ON CONFLICT (player_id) DO NOTHING;
