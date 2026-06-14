-- Phase 4/6: Leaderboard materialized view + core_paid_count trigger fix

-- ─────────────────────────────────────────
-- 1. Materialized leaderboard view
--    Replaces the live full-table-scan query.
--    Refreshed every hour by pg_cron.
-- ─────────────────────────────────────────
DROP MATERIALIZED VIEW IF EXISTS public.leaderboard_mv;

CREATE MATERIALIZED VIEW public.leaderboard_mv AS
SELECT
  p.id,
  p.full_name,
  p.username,
  p.avatar_url,
  p.reputation_score,
  p.total_wins,
  p.total_losses,
  p.total_matches_played,
  p.skill_level,
  p.is_verified,
  RANK() OVER (ORDER BY p.reputation_score DESC NULLS LAST) AS reputation_rank,
  RANK() OVER (ORDER BY p.total_wins DESC NULLS LAST)       AS wins_rank,
  RANK() OVER (ORDER BY p.total_matches_played DESC NULLS LAST) AS matches_rank
FROM public.profiles p
WHERE p.is_banned IS NOT TRUE
  AND p.total_matches_played > 0
ORDER BY p.reputation_score DESC NULLS LAST;

CREATE UNIQUE INDEX ON public.leaderboard_mv (id);
CREATE INDEX ON public.leaderboard_mv (reputation_rank);
CREATE INDEX ON public.leaderboard_mv (wins_rank);

-- Schedule hourly refresh (requires pg_cron extension enabled)
SELECT cron.schedule(
  'refresh-leaderboard',
  '0 * * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY public.leaderboard_mv;$$
);

-- Grant read access
GRANT SELECT ON public.leaderboard_mv TO authenticated;
GRANT SELECT ON public.leaderboard_mv TO anon;


-- ─────────────────────────────────────────
-- 2. Fix core_paid_count trigger — replace full COUNT(*) with incremental update
--    The old trigger ran SELECT COUNT(*) on every participant change,
--    which becomes a bottleneck at scale. Incremental +1/-1 is O(1).
-- ─────────────────────────────────────────

-- Drop old trigger and function
DROP TRIGGER IF EXISTS recalc_core_paid ON public.match_participants;
DROP TRIGGER IF EXISTS trg_recalc_core_paid ON public.match_participants;
DROP FUNCTION IF EXISTS public.recalc_core_paid_count();
DROP FUNCTION IF EXISTS public.fn_recalc_core_paid();

-- New incremental trigger function
CREATE OR REPLACE FUNCTION public.fn_increment_core_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delta integer := 0;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.payment_status = 'paid' AND NEW.status = 'active' AND NEW.slot_type = 'core' THEN
      v_delta := 1;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Became paid+active core
    IF NEW.payment_status = 'paid' AND NEW.status = 'active' AND NEW.slot_type = 'core'
       AND NOT (OLD.payment_status = 'paid' AND OLD.status = 'active' AND OLD.slot_type = 'core') THEN
      v_delta := 1;
    END IF;
    -- Lost paid+active core status
    IF OLD.payment_status = 'paid' AND OLD.status = 'active' AND OLD.slot_type = 'core'
       AND NOT (NEW.payment_status = 'paid' AND NEW.status = 'active' AND NEW.slot_type = 'core') THEN
      v_delta := -1;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.payment_status = 'paid' AND OLD.status = 'active' AND OLD.slot_type = 'core' THEN
      v_delta := -1;
    END IF;
  END IF;

  IF v_delta <> 0 THEN
    UPDATE public.matches
    SET core_paid_count = GREATEST(0, COALESCE(core_paid_count, 0) + v_delta)
    WHERE id = COALESCE(NEW.match_id, OLD.match_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_increment_core_paid
  AFTER INSERT OR UPDATE OR DELETE ON public.match_participants
  FOR EACH ROW EXECUTE FUNCTION public.fn_increment_core_paid();
