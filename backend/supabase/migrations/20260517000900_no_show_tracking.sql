-- Phase 6.4 / 8.7: No-Show Tracking + Penalties
-- Tracks players who paid but didn't scan QR, penalizes repeat offenders.

-- 1. Add no_show flag to match_participants
ALTER TABLE public.match_participants
ADD COLUMN IF NOT EXISTS no_show BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Add no_show_count to profiles (penalty counter)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS no_show_count INTEGER NOT NULL DEFAULT 0;

-- 3. Update the wins/losses trigger to also increment no_show_count
--    (Only if the player was a paid core participant with no QR scan)
CREATE OR REPLACE FUNCTION public.update_match_outcome()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_winner_team TEXT;
  v_participant RECORD;
BEGIN
  -- Only act when match status changes to completed and winning_team is set
  IF NEW.status = 'completed' AND NEW.winning_team IS NOT NULL THEN
    v_winner_team := NEW.winning_team;

    FOR v_participant IN
      SELECT id, user_id, team, payment_status, attendance_scanned, no_show
      FROM public.match_participants
      WHERE match_id = NEW.id AND status = 'active'
    LOOP
      -- Mark no-show for paid core participants who didn't scan
      IF v_participant.payment_status = 'paid'
         AND v_participant.attendance_scanned = FALSE
         AND v_participant.no_show = FALSE THEN
        UPDATE public.match_participants
        SET no_show = TRUE
        WHERE id = v_participant.id;

        UPDATE public.profiles
        SET no_show_count = COALESCE(no_show_count, 0) + 1
        WHERE id = v_participant.user_id;
      END IF;

      -- Wins / losses
      IF v_participant.team = v_winner_team THEN
        UPDATE public.profiles
        SET total_wins = COALESCE(total_wins, 0) + 1
        WHERE id = v_participant.user_id;
      ELSE
        UPDATE public.profiles
        SET total_losses = COALESCE(total_losses, 0) + 1
        WHERE id = v_participant.user_id;
      END IF;

      -- Penalty: after 3 no-shows, reputation -= 0.5
      IF (SELECT COALESCE(no_show_count, 0) FROM public.profiles WHERE id = v_participant.user_id) >= 3 THEN
        UPDATE public.profiles
        SET reputation_score = GREATEST(0, COALESCE(reputation_score, 0) - 0.5)
        WHERE id = v_participant.user_id;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- Ensure the trigger exists (drop + recreate if needed)
DROP TRIGGER IF EXISTS trg_update_match_outcome ON public.matches;
CREATE TRIGGER trg_update_match_outcome
  AFTER UPDATE OF status, winning_team ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.update_match_outcome();

-- 4. Create index for efficient no-show queries
CREATE INDEX IF NOT EXISTS idx_match_participants_no_show
  ON public.match_participants (match_id, no_show)
  WHERE no_show = TRUE;
