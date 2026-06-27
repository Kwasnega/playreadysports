-- ============================================================
-- CRITICAL FIX: Replace all 'confirmed' references with 'active'
-- Issue: participant_status enum changed from 'confirmed' to 'active'
-- but RPC functions still reference 'confirmed' which doesn't exist
-- ============================================================

-- 1. Update all queries that filter/count by 'confirmed' status
-- Replace: WHERE status = 'confirmed'
-- With: WHERE status = 'active'

-- 2. Fix update_match_player_count trigger
CREATE OR REPLACE FUNCTION public.update_match_player_count()
RETURNS trigger LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'active' THEN
    UPDATE public.matches SET current_players_count = current_players_count + 1 
    WHERE id = NEW.match_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'active' AND NEW.status != 'active' THEN
      UPDATE public.matches SET current_players_count = current_players_count - 1 
      WHERE id = NEW.match_id;
    ELSIF OLD.status != 'active' AND NEW.status = 'active' THEN
      UPDATE public.matches SET current_players_count = current_players_count + 1 
      WHERE id = NEW.match_id;
    END IF;
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'active' THEN
    UPDATE public.matches SET current_players_count = current_players_count - 1 
    WHERE id = OLD.match_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_update_match_player_count ON public.match_participants;
CREATE TRIGGER trg_update_match_player_count
AFTER INSERT OR UPDATE OR DELETE ON public.match_participants
FOR EACH ROW EXECUTE FUNCTION public.update_match_player_count();

-- 3. Update all counting functions that reference 'confirmed'
CREATE OR REPLACE FUNCTION public.get_match_confirmed_count(p_match_id uuid)
RETURNS int AS $$
  SELECT COUNT(*)::int FROM public.match_participants 
  WHERE match_id = p_match_id AND status = 'active';
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION public.get_match_confirmed_count(uuid) TO authenticated, service_role;

-- 4. Update get_user_match_entry function
CREATE OR REPLACE FUNCTION public.get_user_match_entry(
    p_match_id uuid,
    p_user_id uuid
)
RETURNS TABLE (
    entry_found BOOLEAN,
    is_confirmed BOOLEAN,
    entry_fee NUMERIC,
    paid_amount NUMERIC
)
AS $$
  SELECT 
    COUNT(mp.id) > 0,
    COUNT(mp.id) FILTER (WHERE mp.status = 'active') > 0,
    m.entry_fee,
    COALESCE(SUM(CASE WHEN wt.type = 'spend' THEN wt.amount ELSE 0 END), 0)
  FROM public.matches m
  LEFT JOIN public.match_participants mp ON mp.match_id = m.id AND mp.user_id = p_user_id
  LEFT JOIN public.wallet_transactions wt ON wt.user_id = p_user_id AND wt.match_id = m.id
  WHERE m.id = p_match_id
  GROUP BY m.id, m.entry_fee;
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION public.get_user_match_entry(uuid, uuid) TO authenticated, service_role;

-- 5. Convert any remaining 'confirmed' values in match_participants to 'active'
UPDATE public.match_participants
SET status = 'active'::public.participant_status
WHERE status::text = 'confirmed';

-- 6. Verify all enum values are valid
DO $$
DECLARE
  v_bad_count INT;
BEGIN
  SELECT COUNT(*) INTO v_bad_count
  FROM public.match_participants
  WHERE status::text NOT IN ('pending', 'active', 'left', 'removed');
  
  IF v_bad_count > 0 THEN
    RAISE WARNING 'Found % participants with invalid status values. These should not exist.', v_bad_count;
  END IF;
END $$;
