-- ============================================================
-- PLAYREADY SPORTS — COMPLETE SCHEMA
-- Run in Supabase Dashboard → SQL Editor → New Query → Paste → Run
-- ============================================================

-- ------------------------------------------------------------
-- 1. ENUMS
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('player', 'turf_owner');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'skill_level') THEN
    CREATE TYPE public.skill_level AS ENUM ('beginner', 'intermediate', 'advanced', 'pro');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'match_status') THEN
    CREATE TYPE public.match_status AS ENUM ('upcoming', 'in_progress', 'completed', 'cancelled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'participant_team') THEN
    CREATE TYPE public.participant_team AS ENUM ('A', 'B', 'unassigned');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'participant_payment_status') THEN
    CREATE TYPE public.participant_payment_status AS ENUM ('none', 'pending', 'paid', 'refunded');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'participant_status') THEN
    CREATE TYPE public.participant_status AS ENUM ('confirmed', 'waitlisted', 'left');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invite_status') THEN
    CREATE TYPE public.invite_status AS ENUM ('pending', 'accepted', 'declined');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_type') THEN
    CREATE TYPE public.message_type AS ENUM ('text', 'system', 'image');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
    CREATE TYPE public.notification_type AS ENUM ('match_invite', 'match_reminder', 'payment', 'system', 'new_match_nearby');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_type') THEN
    CREATE TYPE public.transaction_type AS ENUM ('entry_fee', 'refund', 'payout');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_status') THEN
    CREATE TYPE public.transaction_status AS ENUM ('pending', 'completed', 'failed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_status') THEN
    CREATE TYPE public.report_status AS ENUM ('pending', 'reviewed', 'resolved');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'escrow_status') THEN
    CREATE TYPE public.escrow_status AS ENUM ('none', 'holding', 'released', 'refunded');
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. EXTEND EXISTING profiles TABLE
-- ------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text UNIQUE,
  ADD COLUMN IF NOT EXISTS phone_number text UNIQUE,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS skill_level public.skill_level DEFAULT 'beginner',
  ADD COLUMN IF NOT EXISTS preferred_sports text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS total_matches_played int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_wins int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reputation_score float DEFAULT 5.0,
  ADD COLUMN IF NOT EXISTS is_verified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_banned boolean DEFAULT false;

-- GIN index for array lookups
CREATE INDEX IF NOT EXISTS idx_profiles_preferred_sports ON public.profiles USING GIN(preferred_sports);

-- ------------------------------------------------------------
-- 3. NEW TABLES
-- ------------------------------------------------------------

-- sports lookup
CREATE TABLE IF NOT EXISTS public.sports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  icon_url text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- venues / pitches
CREATE TABLE IF NOT EXISTS public.venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text NOT NULL,
  city text NOT NULL,
  lat numeric(10,8),
  lng numeric(11,8),
  description text,
  sport_ids uuid[] DEFAULT '{}',
  amenities text[] DEFAULT '{}',
  price_per_hour numeric(10,2) NOT NULL DEFAULT 0,
  images text[] DEFAULT '{}',
  owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_verified boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- matches / games
CREATE TABLE IF NOT EXISTS public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  sport_id uuid REFERENCES public.sports(id) ON DELETE SET NULL,
  venue_id uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  organizer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  join_code text NOT NULL UNIQUE CHECK (char_length(join_code) = 6),
  description text,
  match_date timestamptz NOT NULL,
  duration_minutes int NOT NULL DEFAULT 90,
  max_players int NOT NULL DEFAULT 10,
  current_players_count int NOT NULL DEFAULT 0,
  skill_level_required public.skill_level DEFAULT 'beginner',
  is_public boolean DEFAULT true,
  status public.match_status DEFAULT 'upcoming',
  entry_fee numeric(10,2),
  escrow_status public.escrow_status DEFAULT 'none',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- match participants
CREATE TABLE IF NOT EXISTS public.match_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team public.participant_team DEFAULT 'unassigned',
  joined_at timestamptz DEFAULT now(),
  payment_status public.participant_payment_status DEFAULT 'none',
  status public.participant_status DEFAULT 'confirmed',
  UNIQUE (match_id, user_id)
);

-- match invites
CREATE TABLE IF NOT EXISTS public.match_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  invited_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invited_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status public.invite_status DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  UNIQUE (match_id, invited_user_id),
  CHECK (invited_by != invited_user_id)
);

-- messages (lobby chat)
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  message_type public.message_type DEFAULT 'text',
  created_at timestamptz DEFAULT now()
);

-- notifications inbox
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  type public.notification_type NOT NULL,
  data jsonb DEFAULT '{}',
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- transactions / payments
CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid REFERENCES public.matches(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL,
  currency text DEFAULT 'GHS',
  type public.transaction_type NOT NULL,
  status public.transaction_status DEFAULT 'pending',
  payment_reference text,
  created_at timestamptz DEFAULT now()
);

-- reviews
CREATE TABLE IF NOT EXISTS public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reviewed_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz DEFAULT now(),
  CHECK (reviewer_id != reviewed_user_id)
);

-- reports / moderation
CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reported_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  match_id uuid REFERENCES public.matches(id) ON DELETE SET NULL,
  reason text NOT NULL,
  description text,
  status public.report_status DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  CHECK (reporter_id != reported_user_id)
);

-- ------------------------------------------------------------
-- 4. INDEXES
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_location ON public.profiles(location);
CREATE INDEX IF NOT EXISTS idx_profiles_skill_level ON public.profiles(skill_level);
CREATE INDEX IF NOT EXISTS idx_profiles_banned ON public.profiles(is_banned);

CREATE INDEX IF NOT EXISTS idx_venues_city ON public.venues(city);
CREATE INDEX IF NOT EXISTS idx_venues_owner ON public.venues(owner_id);
CREATE INDEX IF NOT EXISTS idx_venues_active ON public.venues(is_active, is_verified);
CREATE INDEX IF NOT EXISTS idx_venues_sport_ids ON public.venues USING GIN(sport_ids);
CREATE INDEX IF NOT EXISTS idx_venues_amenities ON public.venues USING GIN(amenities);

CREATE INDEX IF NOT EXISTS idx_matches_sport ON public.matches(sport_id);
CREATE INDEX IF NOT EXISTS idx_matches_venue ON public.matches(venue_id);
CREATE INDEX IF NOT EXISTS idx_matches_organizer ON public.matches(organizer_id);
CREATE INDEX IF NOT EXISTS idx_matches_date ON public.matches(match_date);
CREATE INDEX IF NOT EXISTS idx_matches_code ON public.matches(join_code);
CREATE INDEX IF NOT EXISTS idx_matches_status ON public.matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_public ON public.matches(is_public, status, match_date);

CREATE INDEX IF NOT EXISTS idx_match_participants_match ON public.match_participants(match_id);
CREATE INDEX IF NOT EXISTS idx_match_participants_user ON public.match_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_match_participants_status ON public.match_participants(match_id, status);

CREATE INDEX IF NOT EXISTS idx_match_invites_match ON public.match_invites(match_id);
CREATE INDEX IF NOT EXISTS idx_match_invites_user ON public.match_invites(invited_user_id);

CREATE INDEX IF NOT EXISTS idx_messages_match ON public.messages(match_id, created_at);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, is_read, created_at);

CREATE INDEX IF NOT EXISTS idx_transactions_user ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_match ON public.transactions(match_id);

CREATE INDEX IF NOT EXISTS idx_reviews_reviewed ON public.reviews(reviewed_user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_match ON public.reviews(match_id);

CREATE INDEX IF NOT EXISTS idx_reports_reporter ON public.reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_reported ON public.reports(reported_user_id);

-- ------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS)
-- ------------------------------------------------------------
ALTER TABLE public.sports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- sports: readable by all (anon + authenticated)
DROP POLICY IF EXISTS "Sports readable by all" ON public.sports;
CREATE POLICY "Sports readable by all" ON public.sports FOR SELECT USING (true);

-- venues: readable if active; owner has full CRUD
DROP POLICY IF EXISTS "Venues readable by all if active" ON public.venues;
CREATE POLICY "Venues readable by all if active" ON public.venues FOR SELECT USING (is_active = true OR auth.uid() = owner_id);
DROP POLICY IF EXISTS "Venues insertable by authenticated" ON public.venues;
CREATE POLICY "Venues insertable by authenticated" ON public.venues FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Venues updatable by owner" ON public.venues;
CREATE POLICY "Venues updatable by owner" ON public.venues FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
DROP POLICY IF EXISTS "Venues deletable by owner" ON public.venues;
CREATE POLICY "Venues deletable by owner" ON public.venues FOR DELETE TO authenticated USING (auth.uid() = owner_id);

-- matches: public = readable by all; private = organizer + participants
DROP POLICY IF EXISTS "Matches readable if public or organizer" ON public.matches;
CREATE POLICY "Matches readable if public or organizer" ON public.matches FOR SELECT USING (is_public = true OR auth.uid() = organizer_id);
DROP POLICY IF EXISTS "Private matches readable by participants" ON public.matches;
CREATE POLICY "Private matches readable by participants" ON public.matches FOR SELECT USING (
  is_public = false AND EXISTS (
    SELECT 1 FROM public.match_participants mp WHERE mp.match_id = id AND mp.user_id = auth.uid()
  )
);
DROP POLICY IF EXISTS "Matches insertable by authenticated" ON public.matches;
CREATE POLICY "Matches insertable by authenticated" ON public.matches FOR INSERT TO authenticated WITH CHECK (auth.uid() = organizer_id);
DROP POLICY IF EXISTS "Matches updatable by organizer" ON public.matches;
CREATE POLICY "Matches updatable by organizer" ON public.matches FOR UPDATE TO authenticated USING (auth.uid() = organizer_id) WITH CHECK (auth.uid() = organizer_id);
DROP POLICY IF EXISTS "Matches deletable by organizer" ON public.matches;
CREATE POLICY "Matches deletable by organizer" ON public.matches FOR DELETE TO authenticated USING (auth.uid() = organizer_id);

-- match_participants: readable by self, organizer, or fellow participants
DROP POLICY IF EXISTS "Match participants readable by match members" ON public.match_participants;
CREATE POLICY "Match participants readable by match members" ON public.match_participants FOR SELECT USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.matches m WHERE m.id = match_id AND m.organizer_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.match_participants mp WHERE mp.match_id = match_id AND mp.user_id = auth.uid())
);
DROP POLICY IF EXISTS "Users can join matches" ON public.match_participants;
CREATE POLICY "Users can join matches" ON public.match_participants FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own participation" ON public.match_participants;
CREATE POLICY "Users can update own participation" ON public.match_participants FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can leave matches" ON public.match_participants;
CREATE POLICY "Users can leave matches" ON public.match_participants FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- match_invites: readable by sender or receiver
DROP POLICY IF EXISTS "Invites readable by involved" ON public.match_invites;
CREATE POLICY "Invites readable by involved" ON public.match_invites FOR SELECT USING (invited_by = auth.uid() OR invited_user_id = auth.uid());
DROP POLICY IF EXISTS "Invites insertable by match members" ON public.match_invites;
CREATE POLICY "Invites insertable by match members" ON public.match_invites FOR INSERT TO authenticated WITH CHECK (
  invited_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.matches m WHERE m.id = match_id AND (m.organizer_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.match_participants mp WHERE mp.match_id = match_id AND mp.user_id = auth.uid()
    ))
  )
);
DROP POLICY IF EXISTS "Invited users can update own invites" ON public.match_invites;
CREATE POLICY "Invited users can update own invites" ON public.match_invites FOR UPDATE TO authenticated USING (invited_user_id = auth.uid()) WITH CHECK (invited_user_id = auth.uid());

-- messages: readable/postable by match participants
DROP POLICY IF EXISTS "Messages readable by match participants" ON public.messages;
CREATE POLICY "Messages readable by match participants" ON public.messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.match_participants mp WHERE mp.match_id = match_id AND mp.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.matches m WHERE m.id = match_id AND m.organizer_id = auth.uid())
);
DROP POLICY IF EXISTS "Messages insertable by match participants" ON public.messages;
CREATE POLICY "Messages insertable by match participants" ON public.messages FOR INSERT TO authenticated WITH CHECK (
  sender_id = auth.uid()
  AND (
    EXISTS (SELECT 1 FROM public.match_participants mp WHERE mp.match_id = match_id AND mp.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.matches m WHERE m.id = match_id AND m.organizer_id = auth.uid())
  )
);

-- notifications: strictly own
DROP POLICY IF EXISTS "Notifications readable by owner" ON public.notifications;
CREATE POLICY "Notifications readable by owner" ON public.notifications FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Notifications updatable by owner" ON public.notifications;
CREATE POLICY "Notifications updatable by owner" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- transactions: strictly own
DROP POLICY IF EXISTS "Transactions readable by owner" ON public.transactions;
CREATE POLICY "Transactions readable by owner" ON public.transactions FOR SELECT USING (user_id = auth.uid());

-- reviews: readable by all; writable by reviewer
DROP POLICY IF EXISTS "Reviews readable by all" ON public.reviews;
CREATE POLICY "Reviews readable by all" ON public.reviews FOR SELECT USING (true);
DROP POLICY IF EXISTS "Reviews insertable by reviewer" ON public.reviews;
CREATE POLICY "Reviews insertable by reviewer" ON public.reviews FOR INSERT TO authenticated WITH CHECK (reviewer_id = auth.uid());

-- reports: readable by reporter; writable by reporter
DROP POLICY IF EXISTS "Reports readable by reporter" ON public.reports;
CREATE POLICY "Reports readable by reporter" ON public.reports FOR SELECT USING (reporter_id = auth.uid());
DROP POLICY IF EXISTS "Reports insertable by reporter" ON public.reports;
CREATE POLICY "Reports insertable by reporter" ON public.reports FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid());

-- ------------------------------------------------------------
-- 6. TRIGGERS
-- ------------------------------------------------------------

-- Update handle_new_user to populate all profile fields on signup
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
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'username', '')), ''),
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-generate join_code if not provided
CREATE OR REPLACE FUNCTION public.generate_match_join_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  new_code text;
  exists_check boolean;
BEGIN
  IF NEW.join_code IS NOT NULL AND char_length(NEW.join_code) = 6 THEN
    RETURN NEW;
  END IF;
  LOOP
    new_code := upper(substring(md5(random()::text), 1, 6));
    SELECT EXISTS(SELECT 1 FROM public.matches WHERE join_code = new_code) INTO exists_check;
    EXIT WHEN NOT exists_check;
  END LOOP;
  NEW.join_code := new_code;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS matches_generate_code ON public.matches;
CREATE TRIGGER matches_generate_code
  BEFORE INSERT ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.generate_match_join_code();

-- Auto-update matches.updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS matches_set_updated_at ON public.matches;
CREATE TRIGGER matches_set_updated_at
  BEFORE UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Keep current_players_count in sync
CREATE OR REPLACE FUNCTION public.update_match_player_count()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'confirmed' THEN
    UPDATE public.matches SET current_players_count = current_players_count + 1 WHERE id = NEW.match_id;
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'confirmed' THEN
    UPDATE public.matches SET current_players_count = current_players_count - 1 WHERE id = OLD.match_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'confirmed' AND NEW.status != 'confirmed' THEN
      UPDATE public.matches SET current_players_count = current_players_count - 1 WHERE id = NEW.match_id;
    ELSIF OLD.status != 'confirmed' AND NEW.status = 'confirmed' THEN
      UPDATE public.matches SET current_players_count = current_players_count + 1 WHERE id = NEW.match_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS match_participants_count ON public.match_participants;
CREATE TRIGGER match_participants_count
  AFTER INSERT OR UPDATE OR DELETE ON public.match_participants
  FOR EACH ROW EXECUTE FUNCTION public.update_match_player_count();

-- ------------------------------------------------------------
-- 7. REALTIME (live updates)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'match_participants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.match_participants;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'matches'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 8. SEED DATA (Ghana sports)
-- ------------------------------------------------------------
INSERT INTO public.sports (name, icon_url, is_active) VALUES
  ('Football', '⚽', true),
  ('Basketball', '🏀', true),
  ('Tennis', '🎾', true),
  ('Volleyball', '🏐', true),
  ('Table Tennis', '🏓', true),
  ('Badminton', '🏸', true),
  ('Cricket', '🏏', true),
  ('Rugby', '🏉', true),
  ('Athletics', '🏃', true),
  ('Swimming', '🏊', true)
ON CONFLICT (name) DO NOTHING;
