-- QR check-in, venue pricing knobs, owner balance, check-in audit, secure signup role

-- 1. Matches: venue QR secret (per match)
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS qr_code_secret text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_qr_code_secret_unique
  ON public.matches (qr_code_secret)
  WHERE qr_code_secret IS NOT NULL;

UPDATE public.matches
SET qr_code_secret = encode(gen_random_bytes(24), 'hex')
WHERE qr_code_secret IS NULL;

-- 2. Participants: attendance + cancel anomaly flag
ALTER TABLE public.match_participants
  ADD COLUMN IF NOT EXISTS attendance_scanned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS check_in_flagged_cancel boolean NOT NULL DEFAULT false;

-- 3. Venue owner withdrawable-style balance (display + future payouts)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS venue_owner_balance numeric(10,2) NOT NULL DEFAULT 0.00
  CHECK (venue_owner_balance >= 0);

-- 4. Venue surge / discounts (owner-editable)
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS surge_peak_start_hour smallint,
  ADD COLUMN IF NOT EXISTS surge_peak_end_hour smallint,
  ADD COLUMN IF NOT EXISTS surge_multiplier numeric(5,2) NOT NULL DEFAULT 1.00 CHECK (surge_multiplier >= 1),
  ADD COLUMN IF NOT EXISTS early_bird_hours_before int NOT NULL DEFAULT 24 CHECK (early_bird_hours_before >= 0),
  ADD COLUMN IF NOT EXISTS early_bird_discount_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (early_bird_discount_pct >= 0 AND early_bird_discount_pct <= 100),
  ADD COLUMN IF NOT EXISTS student_discount_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (student_discount_pct >= 0 AND student_discount_pct <= 100);

COMMENT ON COLUMN public.venues.surge_peak_start_hour IS 'Local hour 0-23 inclusive; null = no surge window';
COMMENT ON COLUMN public.venues.surge_peak_end_hour IS 'Local hour 0-23 inclusive; end exclusive if start < end';

-- 5. Audit log for QR scans (admin + venue owner read)
CREATE TABLE IF NOT EXISTS public.match_checkin_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  venue_id uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  scanned_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_match_checkin_events_match ON public.match_checkin_events(match_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_match_checkin_events_venue ON public.match_checkin_events(venue_id, scanned_at DESC);

ALTER TABLE public.match_checkin_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS match_checkin_events_select_admin ON public.match_checkin_events;
CREATE POLICY match_checkin_events_select_admin ON public.match_checkin_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
  );

DROP POLICY IF EXISTS match_checkin_events_select_venue_owner ON public.match_checkin_events;
CREATE POLICY match_checkin_events_select_venue_owner ON public.match_checkin_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.venues v
      WHERE v.id = match_checkin_events.venue_id
        AND (
          v.owner_id = auth.uid()
          OR (
            v.owner_email IS NOT NULL
            AND lower(trim(v.owner_email)) = lower(trim(coalesce(auth.jwt()->>'email', '')))
          )
        )
    )
  );

-- 6. Venues: allow updates when owner_email matches signed-in user email (JWT)
DROP POLICY IF EXISTS venues_update_by_owner_email ON public.venues;
CREATE POLICY venues_update_by_owner_email ON public.venues
  FOR UPDATE USING (
    owner_email IS NOT NULL
    AND lower(trim(owner_email)) = lower(trim(coalesce(auth.jwt()->>'email', '')))
  )
  WITH CHECK (
    owner_email IS NOT NULL
    AND lower(trim(owner_email)) = lower(trim(coalesce(auth.jwt()->>'email', '')))
  );

-- 7. Signup: never promote turf_owner from OAuth metadata (security)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _skill public.skill_level;
BEGIN
  _skill := case new.raw_user_meta_data->>'skill_level'
    when 'intermediate' then 'intermediate'::public.skill_level
    when 'advanced' then 'advanced'::public.skill_level
    when 'pro' then 'pro'::public.skill_level
    else 'beginner'::public.skill_level
  end;

  INSERT INTO public.profiles (
    id, full_name, avatar_url, username, phone_number, email, location, bio,
    skill_level, preferred_sports, total_matches_played, total_wins,
    reputation_score, is_verified, is_banned
  )
  VALUES (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''), nullif(trim(new.raw_user_meta_data->>'name'),''), ''),
    coalesce(nullif(trim(new.raw_user_meta_data->>'avatar_url'),''), nullif(trim(new.raw_user_meta_data->>'picture'),''), ''),
    nullif(trim(coalesce(split_part(new.email, '@', 1), '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'phone_number', '')), ''),
    nullif(trim(new.email), ''),
    coalesce(new.raw_user_meta_data->>'location', ''),
    coalesce(new.raw_user_meta_data->>'bio', ''),
    _skill,
    ARRAY[]::text[],
    0, 0, 5.0, false, false
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    avatar_url = EXCLUDED.avatar_url,
    email = EXCLUDED.email;

  INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'player'::public.app_role)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN new;
END;
$$;
