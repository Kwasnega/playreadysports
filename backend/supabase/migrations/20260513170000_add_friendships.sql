-- Friend system: friendships table, indexes, RLS, realtime

CREATE TYPE public.friendship_status AS ENUM ('pending', 'accepted', 'blocked');

CREATE TABLE public.friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status public.friendship_status DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT no_self_friendship CHECK (requester_id <> recipient_id),
  CONSTRAINT unique_friendship_pair UNIQUE (requester_id, recipient_id)
);

CREATE INDEX idx_friendships_requester ON public.friendships(requester_id, status);
CREATE INDEX idx_friendships_recipient ON public.friendships(recipient_id, status);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

-- Users can see friendships they are part of
CREATE POLICY friendships_select_own ON public.friendships
  FOR SELECT USING (requester_id = auth.uid() OR recipient_id = auth.uid());

-- Users can create friend requests
CREATE POLICY friendships_insert_own ON public.friendships
  FOR INSERT WITH CHECK (requester_id = auth.uid());

-- Both parties can update status (accept, block)
CREATE POLICY friendships_update_own ON public.friendships
  FOR UPDATE USING (requester_id = auth.uid() OR recipient_id = auth.uid());

-- Both parties can delete (unfriend, cancel request)
CREATE POLICY friendships_delete_own ON public.friendships
  FOR DELETE USING (requester_id = auth.uid() OR recipient_id = auth.uid());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
