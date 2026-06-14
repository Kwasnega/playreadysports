-- ============================================================
-- Wins / losses attribution
-- When a match's winning_team is set (INSERT or UPDATE),
-- credit total_wins to players on the winning team and
-- total_losses to players on the losing team.
-- Only fires once per match (guarded by previous_winning_team check).
-- ============================================================

-- Ensure columns exist
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS total_wins    int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_losses  int NOT NULL DEFAULT 0;

-- Function called by trigger
CREATE OR REPLACE FUNCTION public.fn_attribute_match_result()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_winning_team text;
  v_team_a       text;
  v_team_b       text;
BEGIN
  -- Only act when winning_team transitions from NULL → a real value
  IF NEW.winning_team IS NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.winning_team IS NOT NULL AND OLD.winning_team = NEW.winning_team THEN
    RETURN NEW; -- already processed
  END IF;

  v_winning_team := lower(trim(NEW.winning_team));
  v_team_a       := lower(trim(COALESCE(NEW.team_color_a, '')));
  v_team_b       := lower(trim(COALESCE(NEW.team_color_b, '')));

  -- "draw" → increment matches_played only, no wins/losses
  IF v_winning_team = 'draw' THEN
    UPDATE public.profiles p
    SET total_matches_played = total_matches_played + 1
    FROM public.match_participants mp
    WHERE mp.match_id = NEW.id
      AND mp.user_id  = p.id
      AND mp.status   = 'active'
      AND mp.slot_type = 'core';
    RETURN NEW;
  END IF;

  -- Increment wins for winning team players
  UPDATE public.profiles p
  SET total_wins          = total_wins + 1,
      total_matches_played = total_matches_played + 1
  FROM public.match_participants mp
  WHERE mp.match_id  = NEW.id
    AND mp.user_id   = p.id
    AND mp.status    = 'active'
    AND mp.slot_type = 'core'
    AND lower(trim(mp.team)) = v_winning_team;

  -- Increment losses for losing team players
  UPDATE public.profiles p
  SET total_losses         = total_losses + 1,
      total_matches_played = total_matches_played + 1
  FROM public.match_participants mp
  WHERE mp.match_id  = NEW.id
    AND mp.user_id   = p.id
    AND mp.status    = 'active'
    AND mp.slot_type = 'core'
    AND lower(trim(mp.team)) != v_winning_team;

  -- Bump reputation: +0.2 for a win
  UPDATE public.profiles p
  SET reputation_score = LEAST(10.0, reputation_score + 0.2)
  FROM public.match_participants mp
  WHERE mp.match_id  = NEW.id
    AND mp.user_id   = p.id
    AND mp.status    = 'active'
    AND mp.slot_type = 'core'
    AND lower(trim(mp.team)) = v_winning_team;

  RETURN NEW;
END;
$$;

-- Attach trigger to matches table
DROP TRIGGER IF EXISTS trg_attribute_match_result ON public.matches;
CREATE TRIGGER trg_attribute_match_result
  AFTER UPDATE OF winning_team ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_attribute_match_result();
