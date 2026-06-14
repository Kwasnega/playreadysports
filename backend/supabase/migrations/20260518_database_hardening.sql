-- ============================================================
-- Phase 4: Database Hardening
-- Indexes, constraints, trigger fixes, role consolidation
-- ============================================================

-- ─── 4.1 + 4.2: Missing indexes on profiles ─────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_reputation ON public.profiles(reputation_score DESC);

-- ─── 4.4: wallet_transactions index ─────────────────────────
CREATE INDEX IF NOT EXISTS idx_wallet_tx_user_created
  ON public.wallet_transactions(user_id, created_at DESC);

-- ─── 4.5: Partial index for upcoming/live matches ──────────
CREATE INDEX IF NOT EXISTS idx_matches_organizer_status
  ON public.matches(organizer_id)
  WHERE status IN ('upcoming', 'live');

-- ─── 4.6: UNIQUE constraint on payment_reference ────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_reference_unique
  ON public.transactions(payment_reference)
  WHERE payment_reference IS NOT NULL;

-- ─── 4.7: Fix bookings table ────────────────────────────────
-- Add venue_id FK if missing
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS venue_id uuid REFERENCES public.venues(id) ON DELETE SET NULL;

-- Add status enum column if not exists (or use text with check)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.bookings ADD COLUMN status text DEFAULT 'pending';
  END IF;
END $$;

-- Ensure status has valid values
ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('pending', 'confirmed', 'cancelled', 'payment_pending', 'completed'));

-- ─── 4.9: Materialized leaderboard view ─────────────────────
DROP MATERIALIZED VIEW IF EXISTS public.leaderboard_mv;
CREATE MATERIALIZED VIEW public.leaderboard_mv AS
SELECT
  p.id AS user_id,
  p.full_name,
  p.username,
  p.avatar_url,
  COALESCE(p.total_wins, 0) AS wins,
  COALESCE(p.total_losses, 0) AS losses,
  COALESCE(p.reputation_score, 0) AS reputation_score,
  CASE WHEN (COALESCE(p.total_wins, 0) + COALESCE(p.total_losses, 0)) > 0
    THEN ROUND(100.0 * COALESCE(p.total_wins, 0) / (COALESCE(p.total_wins, 0) + COALESCE(p.total_losses, 0)), 1)
    ELSE 0
  END AS win_rate
FROM public.profiles p
WHERE p.total_wins > 0 OR p.total_losses > 0
ORDER BY reputation_score DESC, total_wins DESC;

CREATE UNIQUE INDEX idx_leaderboard_mv_user_id ON public.leaderboard_mv(user_id);
CREATE INDEX idx_leaderboard_mv_rank ON public.leaderboard_mv(reputation_score DESC, wins DESC);

-- Grant read access
GRANT SELECT ON public.leaderboard_mv TO authenticated;

-- ─── 4.10: Incremental core_paid trigger ────────────────────
-- Replace full COUNT(*) with +1/-1 on INSERT/UPDATE/DELETE
DROP TRIGGER IF EXISTS trg_match_participants_core_paid ON public.match_participants;
DROP FUNCTION IF EXISTS public.update_core_paid_count();

CREATE OR REPLACE FUNCTION public.update_core_paid_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.payment_status = 'paid' AND NEW.status = 'active' AND NEW.is_substitute = false THEN
      UPDATE public.matches SET core_paid_count = COALESCE(core_paid_count, 0) + 1
      WHERE id = NEW.match_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- If payment_status changed to paid, increment
    IF OLD.payment_status IS DISTINCT FROM NEW.payment_status
       AND NEW.payment_status = 'paid'
       AND NEW.status = 'active'
       AND NEW.is_substitute = false THEN
      UPDATE public.matches SET core_paid_count = COALESCE(core_paid_count, 0) + 1
      WHERE id = NEW.match_id;
    -- If payment_status changed away from paid, decrement
    ELSIF OLD.payment_status IS DISTINCT FROM NEW.payment_status
       AND OLD.payment_status = 'paid'
       AND NEW.status = 'active'
       AND NEW.is_substitute = false THEN
      UPDATE public.matches SET core_paid_count = GREATEST(COALESCE(core_paid_count, 0) - 1, 0)
      WHERE id = NEW.match_id;
    -- If status changed away from active, decrement if was paid
    ELSIF OLD.status IS DISTINCT FROM NEW.status
       AND NEW.status != 'active'
       AND OLD.payment_status = 'paid'
       AND OLD.is_substitute = false THEN
      UPDATE public.matches SET core_paid_count = GREATEST(COALESCE(core_paid_count, 0) - 1, 0)
      WHERE id = NEW.match_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.payment_status = 'paid' AND OLD.status = 'active' AND OLD.is_substitute = false THEN
      UPDATE public.matches SET core_paid_count = GREATEST(COALESCE(core_paid_count, 0) - 1, 0)
      WHERE id = OLD.match_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_match_participants_core_paid
  AFTER INSERT OR UPDATE OR DELETE ON public.match_participants
  FOR EACH ROW EXECUTE FUNCTION public.update_core_paid_count();

-- ─── 4.11: Drop bookings.pitch_id after venue_id exists ─────
-- Only if venue_id column exists and has data
DO $$
DECLARE
  v_has_venue_id boolean;
  v_has_pitch_id boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'venue_id'
  ) INTO v_has_venue_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'pitch_id'
  ) INTO v_has_pitch_id;

  -- Only drop if both exist and venue_id has at least some data
  IF v_has_venue_id AND v_has_pitch_id THEN
    IF EXISTS (SELECT 1 FROM public.bookings WHERE venue_id IS NOT NULL) THEN
      ALTER TABLE public.bookings DROP COLUMN IF EXISTS pitch_id;
    END IF;
  END IF;
END $$;

-- ─── 4.12: Consolidate role system ──────────────────────────
-- profiles.role is the source of truth. Drop user_roles table
-- if it exists and no policies depend on it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'user_roles' AND table_schema = 'public'
  ) THEN
    -- Check if any RLS policies reference user_roles
    -- pg_policies has qual (USING) and with_check (WITH CHECK), not 'definition'
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND (qual LIKE '%user_roles%' OR with_check LIKE '%user_roles%')
    ) THEN
      DROP TABLE IF EXISTS public.user_roles;
    END IF;
  END IF;
END $$;

-- Normalize role values before adding the constraint
-- Map known variants → canonical names
UPDATE public.profiles SET role = 'turf_owner'  WHERE role IN ('venue_owner', 'venueowner', 'owner');
UPDATE public.profiles SET role = 'admin'        WHERE role IN ('administrator', 'superadmin');
UPDATE public.profiles SET role = 'super_admin'  WHERE role = 'super admin';
-- Default anything else (including null) to 'player'
UPDATE public.profiles SET role = 'player'       WHERE role IS NULL OR role NOT IN ('player', 'turf_owner', 'admin', 'super_admin');

-- Add check constraint to ensure valid roles
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('player', 'turf_owner', 'admin', 'super_admin'));

-- ─── pg_cron: auto-refresh leaderboard every hour ────────────
-- Requires pg_cron extension enabled in Supabase dashboard.
-- If pg_cron is available, schedule hourly refresh.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('refresh_leaderboard', '0 * * * *',
      'REFRESH MATERIALIZED VIEW CONCURRENTLY public.leaderboard_mv;');
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  -- pg_cron may not be enabled; manual refresh required
  RAISE NOTICE 'pg_cron not available — schedule leaderboard refresh manually or enable in Supabase dashboard';
END $$;
