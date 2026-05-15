-- Admin Players Enhancements
-- 1. Add email to profiles for searchability
-- 2. Add reputation_history table
-- 3. Update trigger to populate email
-- 4. Backfill existing emails
-- 5. Add admin SELECT policies

-- Add email column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

-- Add index for email search
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- Create reputation_history table
CREATE TABLE IF NOT EXISTS public.reputation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  old_score float,
  new_score float NOT NULL,
  reason text,
  admin_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reputation_history_user ON public.reputation_history(user_id, created_at DESC);

-- Enable RLS on reputation_history
ALTER TABLE public.reputation_history ENABLE ROW LEVEL SECURITY;

-- Admin can see all reputation history
DROP POLICY IF EXISTS reputation_history_select_admin ON public.reputation_history;
CREATE POLICY reputation_history_select_admin ON public.reputation_history
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

-- Update handle_new_user to populate email
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

  _role := case
    when (new.raw_user_meta_data->>'role') = 'turf_owner' then 'turf_owner'::public.app_role
    else 'player'::public.app_role
  end;

  INSERT INTO public.user_roles (user_id, role) VALUES (new.id, _role)
  ON CONFLICT DO NOTHING;

  RETURN new;
END;
$$;

-- Backfill email for existing users from auth.users
UPDATE public.profiles
SET email = auth.users.email
FROM auth.users
WHERE public.profiles.id = auth.users.id
  AND public.profiles.email IS NULL;

-- Add admin SELECT policies for deep profile access

-- Admin can view all matches
DROP POLICY IF EXISTS matches_select_admin ON public.matches;
CREATE POLICY matches_select_admin ON public.matches
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

-- Admin can view all match_participants
DROP POLICY IF EXISTS mp_select_admin ON public.match_participants;
CREATE POLICY mp_select_admin ON public.match_participants
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

-- Admin can view all messages
DROP POLICY IF EXISTS msg_select_admin ON public.messages;
CREATE POLICY msg_select_admin ON public.messages
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

-- Admin can view all notifications
DROP POLICY IF EXISTS notif_select_admin ON public.notifications;
CREATE POLICY notif_select_admin ON public.notifications
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

-- Admin can view all transactions
DROP POLICY IF EXISTS txn_select_admin ON public.transactions;
CREATE POLICY txn_select_admin ON public.transactions
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

-- Admin can view all wallet_transactions (fix existing is_admin check)
DROP POLICY IF EXISTS "Admin can view all wallet transactions" ON public.wallet_transactions;
CREATE POLICY "Admin can view all wallet transactions"
  ON public.wallet_transactions
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

-- Admin can view all wallet_balances (fix existing is_admin check)
DROP POLICY IF EXISTS "Admin can view all wallet balances" ON public.wallet_balances;
CREATE POLICY "Admin can view all wallet balances"
  ON public.wallet_balances
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')));

-- Reviews already has reviews_select_all, so admin can already see
