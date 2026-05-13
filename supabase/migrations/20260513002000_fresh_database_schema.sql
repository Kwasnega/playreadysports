-- ============================================================
-- PLAYREADY SPORTS — FRESH DATABASE SCHEMA
-- For a brand new Supabase project. Run this ONCE.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ENUMS
-- ------------------------------------------------------------
CREATE TYPE public.app_role AS ENUM ('player', 'turf_owner');
CREATE TYPE public.skill_level AS ENUM ('beginner', 'intermediate', 'advanced', 'pro');
CREATE TYPE public.match_status AS ENUM ('upcoming', 'live', 'completed', 'cancelled');
CREATE TYPE public.escrow_status AS ENUM ('none', 'holding', 'released', 'refunded');
CREATE TYPE public.participant_status AS ENUM ('pending', 'active', 'left', 'removed');
CREATE TYPE public.payment_status AS ENUM ('unpaid', 'paid', 'refunded');
CREATE TYPE public.transaction_type AS ENUM ('entry_fee', 'refund', 'payout');
CREATE TYPE public.transaction_status AS ENUM ('pending', 'completed', 'failed');
CREATE TYPE public.notification_type AS ENUM (
  'match_invite', 'match_join', 'match_leave', 'match_update', 'match_cancel',
  'payment_received', 'match_confirmed', 'account', 'system'
);
CREATE TYPE public.message_type AS ENUM ('text', 'system');
CREATE TYPE public.slot_type AS ENUM ('core', 'spare');
CREATE TYPE public.team_side AS ENUM ('reds', 'blues', 'unassigned');
CREATE TYPE public.match_mode AS ENUM ('two_team', 'gala');
CREATE TYPE public.match_type AS ENUM ('public', 'private');
CREATE TYPE public.match_format AS ENUM ('5v5', '6v6', '7v7', '8v8', '9v9', '10v10', '11v11');
CREATE TYPE public.report_status AS ENUM ('pending', 'resolved', 'dismissed');

-- ------------------------------------------------------------
-- 2. TABLES
-- ------------------------------------------------------------

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE,
  full_name text,
  avatar_url text,
  phone_number text,
  city text,
  location text,
  bio text,
  position text,
  preferred_sports text[] DEFAULT '{}',
  skill_level public.skill_level DEFAULT 'beginner',
  total_matches int DEFAULT 0,
  total_wins int DEFAULT 0,
  total_matches_played int DEFAULT 0,
  reputation_score float DEFAULT 5.0,
  role text DEFAULT 'user',
  is_verified bool DEFAULT false,
  is_banned bool DEFAULT false,
  banned_until timestamptz,
  ban_reason text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  city text,
  area text,
  address text,
  surface text,
  lat float,
  lng float,
  amenities text[] DEFAULT '{}',
  contact_phone text,
  description text,
  price_per_hour float,
  capacity int,
  sport_ids int[] DEFAULT '{}',
  owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  owner_email text,
  status text DEFAULT 'pending',
  is_active bool DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  join_code text UNIQUE,
  title text,
  organizer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  venue_id uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  match_type public.match_type DEFAULT 'public',
  match_mode public.match_mode DEFAULT 'two_team',
  format public.match_format DEFAULT '6v6',
  players_per_side int,
  max_core_players int,
  max_spare_players int DEFAULT 2,
  match_date timestamptz,
  duration_minutes int DEFAULT 60,
  entry_fee decimal(10,2) DEFAULT 0,
  skill_level_required public.skill_level,
  sport_id int,
  current_players_count int DEFAULT 0,
  status public.match_status DEFAULT 'upcoming',
  escrow_status public.escrow_status DEFAULT 'none',
  core_paid_count int DEFAULT 0,
  is_public bool DEFAULT true,
  join_code_expires_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.match_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  slot_type public.slot_type DEFAULT 'core',
  team public.team_side DEFAULT 'unassigned',
  payment_status public.payment_status DEFAULT 'unpaid',
  payment_reference text,
  status public.participant_status DEFAULT 'pending',
  joined_at timestamptz DEFAULT now()
);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  content text NOT NULL,
  message_type public.message_type DEFAULT 'text',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text,
  body text,
  type public.notification_type DEFAULT 'system',
  data jsonb,
  is_read bool DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid REFERENCES public.matches(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount decimal(10,2) NOT NULL,
  type public.transaction_type NOT NULL,
  status public.transaction_status DEFAULT 'pending',
  payment_reference text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reviewed_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  match_id uuid REFERENCES public.matches(id) ON DELETE CASCADE,
  rating int CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reported_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  match_id uuid REFERENCES public.matches(id) ON DELETE SET NULL,
  reason text NOT NULL,
  status public.report_status DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  details jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.user_roles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'player',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pitch_id text NOT NULL,
  date text NOT NULL,
  hour int NOT NULL,
  duration int DEFAULT 1,
  status text DEFAULT 'tentative',
  customer_name text NOT NULL,
  customer_phone text,
  price decimal(10,2) DEFAULT 0,
  notes text,
  payment text DEFAULT 'unpaid',
  source text DEFAULT 'manual',
  created_at timestamptz DEFAULT now()
);

-- ------------------------------------------------------------
-- 3. INDEXES
-- ------------------------------------------------------------
CREATE INDEX idx_matches_status_date ON public.matches(status, match_date);
CREATE INDEX idx_matches_join_code ON public.matches(join_code);
CREATE INDEX idx_matches_organizer ON public.matches(organizer_id);
CREATE INDEX idx_matches_venue ON public.matches(venue_id);
CREATE INDEX idx_match_participants_match_user ON public.match_participants(match_id, user_id);
CREATE INDEX idx_match_participants_match_slot ON public.match_participants(match_id, slot_type);
CREATE INDEX idx_match_participants_match_status ON public.match_participants(match_id, status);
CREATE INDEX idx_messages_match_created ON public.messages(match_id, created_at);
CREATE INDEX idx_notifications_user_read_created ON public.notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_profiles_username ON public.profiles(username);
CREATE INDEX idx_venues_city ON public.venues(city);
CREATE INDEX idx_bookings_pitch_date ON public.bookings(pitch_id, date);
CREATE INDEX idx_reviews_reviewed_user ON public.reviews(reviewed_user_id);
CREATE INDEX idx_reports_status ON public.reports(status);

-- ------------------------------------------------------------
-- 4. ENABLE RLS
-- ------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 5. RLS POLICIES
-- ------------------------------------------------------------
CREATE POLICY profiles_select_all ON public.profiles FOR SELECT USING (true);
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY venues_select_all ON public.venues FOR SELECT USING (true);
CREATE POLICY venues_insert_owner ON public.venues FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY venues_update_own ON public.venues FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY matches_select_public ON public.matches FOR SELECT USING (match_type = 'public');
CREATE POLICY matches_select_participants ON public.matches FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.match_participants mp
    WHERE mp.match_id = matches.id AND mp.user_id = auth.uid()
  )
);
CREATE POLICY matches_select_organizer ON public.matches FOR SELECT USING (organizer_id = auth.uid());
CREATE POLICY matches_insert_organizer ON public.matches FOR INSERT WITH CHECK (organizer_id = auth.uid());
CREATE POLICY matches_update_organizer ON public.matches FOR UPDATE USING (organizer_id = auth.uid());

CREATE POLICY mp_select_match ON public.match_participants FOR SELECT USING (
  user_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = match_participants.match_id AND m.organizer_id = auth.uid()
  ) OR
  EXISTS (
    SELECT 1 FROM public.match_participants mp2
    WHERE mp2.match_id = match_participants.match_id AND mp2.user_id = auth.uid()
  )
);
CREATE POLICY mp_insert_own ON public.match_participants FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY mp_update_own ON public.match_participants FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY mp_update_organizer ON public.match_participants FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = match_participants.match_id AND m.organizer_id = auth.uid()
  )
);

CREATE POLICY msg_select_participants ON public.messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.match_participants mp
    WHERE mp.match_id = messages.match_id AND mp.user_id = auth.uid() AND mp.status = 'active'
  )
);
CREATE POLICY msg_insert_participants ON public.messages FOR INSERT WITH CHECK (
  sender_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM public.match_participants mp
    WHERE mp.match_id = messages.match_id AND mp.user_id = auth.uid() AND mp.status = 'active'
  )
);

CREATE POLICY notif_select_own ON public.notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY notif_update_own ON public.notifications FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY txn_select_own ON public.transactions FOR SELECT USING (user_id = auth.uid());

CREATE POLICY reviews_select_all ON public.reviews FOR SELECT USING (true);
CREATE POLICY reviews_insert_auth ON public.reviews FOR INSERT WITH CHECK (reviewer_id = auth.uid());
CREATE POLICY reviews_update_own ON public.reviews FOR UPDATE USING (reviewer_id = auth.uid());

CREATE POLICY reports_insert_auth ON public.reports FOR INSERT WITH CHECK (reporter_id = auth.uid());
CREATE POLICY reports_select_admin ON public.reports FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
);

CREATE POLICY audit_select_admin ON public.audit_log FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
);

CREATE POLICY ur_select_own ON public.user_roles FOR SELECT USING (user_id = auth.uid());

CREATE POLICY bookings_select_all ON public.bookings FOR SELECT USING (true);

-- ------------------------------------------------------------
-- 6. TRIGGERS
-- ------------------------------------------------------------

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _role public.app_role;
  _skill public.skill_level;
BEGIN
  _skill := case new.raw_user_meta_data->>'skill_level'
    when 'intermediate' then 'intermediate'::public.skill_level
    when 'advanced' then 'advanced'::public.skill_level
    when 'pro' then 'pro'::public.skill_level
    else 'beginner'::public.skill_level
  end;

  INSERT INTO public.profiles (
    id, full_name, avatar_url, username, phone_number, location, bio,
    skill_level, preferred_sports, total_matches_played, total_wins,
    reputation_score, is_verified, is_banned
  )
  VALUES (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''), nullif(trim(new.raw_user_meta_data->>'name'),''), ''),
    coalesce(nullif(trim(new.raw_user_meta_data->>'avatar_url'),''), nullif(trim(new.raw_user_meta_data->>'picture'),''), ''),
    nullif(trim(coalesce(split_part(new.email, '@', 1), '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'phone_number', '')), ''),
    coalesce(new.raw_user_meta_data->>'location', ''),
    coalesce(new.raw_user_meta_data->>'bio', ''),
    _skill,
    ARRAY[]::text[],
    0, 0, 5.0, false, false
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    avatar_url = EXCLUDED.avatar_url;

  _role := case
    when (new.raw_user_meta_data->>'role') = 'turf_owner' then 'turf_owner'::public.app_role
    else 'player'::public.app_role
  end;

  INSERT INTO public.user_roles (user_id, role) VALUES (new.id, _role)
  ON CONFLICT DO NOTHING;

  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Recalculate core_paid_count
CREATE OR REPLACE FUNCTION public.recalc_core_paid()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.matches
  SET core_paid_count = (
    SELECT count(*)::int
    FROM public.match_participants
    WHERE match_id = COALESCE(NEW.match_id, OLD.match_id)
      AND slot_type = 'core'
      AND payment_status = 'paid'
      AND status = 'active'
  )
  WHERE id = COALESCE(NEW.match_id, OLD.match_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_recalc_core_paid
  AFTER INSERT OR UPDATE OR DELETE ON public.match_participants
  FOR EACH ROW EXECUTE FUNCTION public.recalc_core_paid();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_matches_updated_at
  BEFORE UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_venues_updated_at
  BEFORE UPDATE ON public.venues
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Realtime
DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;

-- ------------------------------------------------------------
-- 7. GRANTS
-- ------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_core_paid() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO authenticated;

-- ------------------------------------------------------------
-- 8. SEED DATA (venues only — matches will be created via app)
-- ------------------------------------------------------------
INSERT INTO public.venues (name, city, area, surface, lat, lng, is_active, price_per_hour, capacity)
VALUES
  ('Bantama Astro', 'Kumasi', 'Bantama', 'Astroturf', 6.6820, -1.5710, true, 180, 12),
  ('Madina Park', 'Accra', 'Madina', 'Astroturf', 5.6820, -0.1710, true, 150, 10),
  ('Legon Field', 'Accra', 'Legon', 'Grass', 5.6500, -0.1870, true, 200, 22),
  ('Spintex Indoor', 'Accra', 'Spintex', 'Indoor', 5.6100, -0.1300, true, 220, 10);

-- After signing up your first user, run this to create demo matches:
-- UPDATE matches SET organizer_id = '<YOUR_USER_UUID>' WHERE organizer_id IS NULL;
