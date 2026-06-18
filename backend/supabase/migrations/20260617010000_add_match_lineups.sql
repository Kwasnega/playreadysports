-- ============================================================
-- Match Lineups System
-- Supports formation-based tactical lineups with real-time updates
-- ============================================================

-- 1. Create match_lineups table
CREATE TABLE IF NOT EXISTS public.match_lineups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  team_side text NOT NULL CHECK (team_side IN ('team_a', 'team_b')),
  player_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_position text NOT NULL, -- e.g., 'ST', 'CM', 'GK', 'LB', 'RB', etc.
  jersey_number int,
  formation text NOT NULL, -- e.g., '4-3-3', '4-4-2', etc.
  x_position int, -- Pitch position (0-100)
  y_position int, -- Pitch position (0-100)
  is_starting_player boolean DEFAULT true,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (match_id, team_side, player_id),
  CHECK (jersey_number IS NULL OR (jersey_number >= 1 AND jersey_number <= 99))
);

-- 2. Create lineup_formations reference table
CREATE TABLE IF NOT EXISTS public.lineup_formations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE, -- '4-3-3', '4-4-2', etc.
  description text,
  positions jsonb NOT NULL, -- Array of {position: "ST", x: 50, y: 10, label: "Striker"}
  created_at timestamptz DEFAULT now()
);

-- 3. Insert popular formations
INSERT INTO public.lineup_formations (name, description, positions) VALUES
  ('4-3-3', 'Balanced formation', jsonb_build_array(
    jsonb_build_object('position', 'GK', 'x', 50, 'y', 95, 'label', 'Goalkeeper'),
    jsonb_build_object('position', 'LB', 'x', 20, 'y', 75, 'label', 'Left Back'),
    jsonb_build_object('position', 'CB', 'x', 35, 'y', 75, 'label', 'Center Back'),
    jsonb_build_object('position', 'CB', 'x', 65, 'y', 75, 'label', 'Center Back'),
    jsonb_build_object('position', 'RB', 'x', 80, 'y', 75, 'label', 'Right Back'),
    jsonb_build_object('position', 'LM', 'x', 20, 'y', 50, 'label', 'Left Midfield'),
    jsonb_build_object('position', 'CM', 'x', 50, 'y', 50, 'label', 'Center Midfield'),
    jsonb_build_object('position', 'RM', 'x', 80, 'y', 50, 'label', 'Right Midfield'),
    jsonb_build_object('position', 'LW', 'x', 20, 'y', 20, 'label', 'Left Wing'),
    jsonb_build_object('position', 'ST', 'x', 50, 'y', 10, 'label', 'Striker'),
    jsonb_build_object('position', 'RW', 'x', 80, 'y', 20, 'label', 'Right Wing')
  ))
ON CONFLICT DO NOTHING;

INSERT INTO public.lineup_formations (name, description, positions) VALUES
  ('4-4-2', 'Classic formation', jsonb_build_array(
    jsonb_build_object('position', 'GK', 'x', 50, 'y', 95, 'label', 'Goalkeeper'),
    jsonb_build_object('position', 'LB', 'x', 20, 'y', 75, 'label', 'Left Back'),
    jsonb_build_object('position', 'CB', 'x', 35, 'y', 75, 'label', 'Center Back'),
    jsonb_build_object('position', 'CB', 'x', 65, 'y', 75, 'label', 'Center Back'),
    jsonb_build_object('position', 'RB', 'x', 80, 'y', 75, 'label', 'Right Back'),
    jsonb_build_object('position', 'LM', 'x', 20, 'y', 50, 'label', 'Left Midfield'),
    jsonb_build_object('position', 'CM', 'x', 40, 'y', 50, 'label', 'Center Midfield'),
    jsonb_build_object('position', 'CM', 'x', 60, 'y', 50, 'label', 'Center Midfield'),
    jsonb_build_object('position', 'RM', 'x', 80, 'y', 50, 'label', 'Right Midfield'),
    jsonb_build_object('position', 'ST', 'x', 35, 'y', 15, 'label', 'Striker'),
    jsonb_build_object('position', 'ST', 'x', 65, 'y', 15, 'label', 'Striker')
  ))
ON CONFLICT DO NOTHING;

INSERT INTO public.lineup_formations (name, description, positions) VALUES
  ('4-2-3-1', 'Defensive midfielder support', jsonb_build_array(
    jsonb_build_object('position', 'GK', 'x', 50, 'y', 95, 'label', 'Goalkeeper'),
    jsonb_build_object('position', 'LB', 'x', 20, 'y', 75, 'label', 'Left Back'),
    jsonb_build_object('position', 'CB', 'x', 35, 'y', 75, 'label', 'Center Back'),
    jsonb_build_object('position', 'CB', 'x', 65, 'y', 75, 'label', 'Center Back'),
    jsonb_build_object('position', 'RB', 'x', 80, 'y', 75, 'label', 'Right Back'),
    jsonb_build_object('position', 'CDM', 'x', 40, 'y', 55, 'label', 'Defensive Midfield'),
    jsonb_build_object('position', 'CDM', 'x', 60, 'y', 55, 'label', 'Defensive Midfield'),
    jsonb_build_object('position', 'LM', 'x', 20, 'y', 35, 'label', 'Left Midfield'),
    jsonb_build_object('position', 'CAM', 'x', 50, 'y', 35, 'label', 'Attacking Midfield'),
    jsonb_build_object('position', 'RM', 'x', 80, 'y', 35, 'label', 'Right Midfield'),
    jsonb_build_object('position', 'ST', 'x', 50, 'y', 10, 'label', 'Striker')
  ))
ON CONFLICT DO NOTHING;

INSERT INTO public.lineup_formations (name, description, positions) VALUES
  ('3-5-2', 'Wing-heavy formation', jsonb_build_array(
    jsonb_build_object('position', 'GK', 'x', 50, 'y', 95, 'label', 'Goalkeeper'),
    jsonb_build_object('position', 'CB', 'x', 35, 'y', 75, 'label', 'Center Back'),
    jsonb_build_object('position', 'CB', 'x', 50, 'y', 80, 'label', 'Center Back'),
    jsonb_build_object('position', 'CB', 'x', 65, 'y', 75, 'label', 'Center Back'),
    jsonb_build_object('position', 'LWB', 'x', 15, 'y', 50, 'label', 'Left Wing-Back'),
    jsonb_build_object('position', 'CM', 'x', 35, 'y', 55, 'label', 'Center Midfield'),
    jsonb_build_object('position', 'CM', 'x', 65, 'y', 55, 'label', 'Center Midfield'),
    jsonb_build_object('position', 'RWB', 'x', 85, 'y', 50, 'label', 'Right Wing-Back'),
    jsonb_build_object('position', 'ST', 'x', 35, 'y', 15, 'label', 'Striker'),
    jsonb_build_object('position', 'ST', 'x', 65, 'y', 15, 'label', 'Striker')
  ))
ON CONFLICT DO NOTHING;

INSERT INTO public.lineup_formations (name, description, positions) VALUES
  ('4-5-1', 'Midfield-focused', jsonb_build_array(
    jsonb_build_object('position', 'GK', 'x', 50, 'y', 95, 'label', 'Goalkeeper'),
    jsonb_build_object('position', 'LB', 'x', 20, 'y', 75, 'label', 'Left Back'),
    jsonb_build_object('position', 'CB', 'x', 35, 'y', 75, 'label', 'Center Back'),
    jsonb_build_object('position', 'CB', 'x', 65, 'y', 75, 'label', 'Center Back'),
    jsonb_build_object('position', 'RB', 'x', 80, 'y', 75, 'label', 'Right Back'),
    jsonb_build_object('position', 'LM', 'x', 15, 'y', 45, 'label', 'Left Midfield'),
    jsonb_build_object('position', 'CM', 'x', 35, 'y', 50, 'label', 'Center Midfield'),
    jsonb_build_object('position', 'CM', 'x', 65, 'y', 50, 'label', 'Center Midfield'),
    jsonb_build_object('position', 'RM', 'x', 85, 'y', 45, 'label', 'Right Midfield'),
    jsonb_build_object('position', 'CAM', 'x', 50, 'y', 25, 'label', 'Attacking Midfield'),
    jsonb_build_object('position', 'ST', 'x', 50, 'y', 8, 'label', 'Striker')
  ))
ON CONFLICT DO NOTHING;

INSERT INTO public.lineup_formations (name, description, positions) VALUES
  ('3-4-3', 'Attacking 3-back', jsonb_build_array(
    jsonb_build_object('position', 'GK', 'x', 50, 'y', 95, 'label', 'Goalkeeper'),
    jsonb_build_object('position', 'CB', 'x', 35, 'y', 75, 'label', 'Center Back'),
    jsonb_build_object('position', 'CB', 'x', 50, 'y', 80, 'label', 'Center Back'),
    jsonb_build_object('position', 'CB', 'x', 65, 'y', 75, 'label', 'Center Back'),
    jsonb_build_object('position', 'LB', 'x', 15, 'y', 50, 'label', 'Left Back'),
    jsonb_build_object('position', 'CM', 'x', 40, 'y', 50, 'label', 'Center Midfield'),
    jsonb_build_object('position', 'CM', 'x', 60, 'y', 50, 'label', 'Center Midfield'),
    jsonb_build_object('position', 'RB', 'x', 85, 'y', 50, 'label', 'Right Back'),
    jsonb_build_object('position', 'LW', 'x', 20, 'y', 20, 'label', 'Left Wing'),
    jsonb_build_object('position', 'ST', 'x', 50, 'y', 10, 'label', 'Striker'),
    jsonb_build_object('position', 'RW', 'x', 80, 'y', 20, 'label', 'Right Wing')
  ))
ON CONFLICT DO NOTHING;

INSERT INTO public.lineup_formations (name, description, positions) VALUES
  ('5-3-2', 'Defensive 5-back', jsonb_build_array(
    jsonb_build_object('position', 'GK', 'x', 50, 'y', 95, 'label', 'Goalkeeper'),
    jsonb_build_object('position', 'LB', 'x', 15, 'y', 70, 'label', 'Left Back'),
    jsonb_build_object('position', 'CB', 'x', 30, 'y', 75, 'label', 'Center Back'),
    jsonb_build_object('position', 'CB', 'x', 50, 'y', 80, 'label', 'Center Back'),
    jsonb_build_object('position', 'CB', 'x', 70, 'y', 75, 'label', 'Center Back'),
    jsonb_build_object('position', 'RB', 'x', 85, 'y', 70, 'label', 'Right Back'),
    jsonb_build_object('position', 'LM', 'x', 25, 'y', 45, 'label', 'Left Midfield'),
    jsonb_build_object('position', 'CM', 'x', 50, 'y', 50, 'label', 'Center Midfield'),
    jsonb_build_object('position', 'RM', 'x', 75, 'y', 45, 'label', 'Right Midfield'),
    jsonb_build_object('position', 'ST', 'x', 35, 'y', 15, 'label', 'Striker'),
    jsonb_build_object('position', 'ST', 'x', 65, 'y', 15, 'label', 'Striker')
  ))
ON CONFLICT DO NOTHING;

INSERT INTO public.lineup_formations (name, description, positions) VALUES
  ('4-3-2-1', 'Balanced hybrid', jsonb_build_array(
    jsonb_build_object('position', 'GK', 'x', 50, 'y', 95, 'label', 'Goalkeeper'),
    jsonb_build_object('position', 'LB', 'x', 20, 'y', 75, 'label', 'Left Back'),
    jsonb_build_object('position', 'CB', 'x', 35, 'y', 75, 'label', 'Center Back'),
    jsonb_build_object('position', 'CB', 'x', 65, 'y', 75, 'label', 'Center Back'),
    jsonb_build_object('position', 'RB', 'x', 80, 'y', 75, 'label', 'Right Back'),
    jsonb_build_object('position', 'LM', 'x', 20, 'y', 50, 'label', 'Left Midfield'),
    jsonb_build_object('position', 'CM', 'x', 50, 'y', 55, 'label', 'Center Midfield'),
    jsonb_build_object('position', 'RM', 'x', 80, 'y', 50, 'label', 'Right Midfield'),
    jsonb_build_object('position', 'CAM', 'x', 35, 'y', 25, 'label', 'Attacking Midfield'),
    jsonb_build_object('position', 'CAM', 'x', 65, 'y', 25, 'label', 'Attacking Midfield'),
    jsonb_build_object('position', 'ST', 'x', 50, 'y', 8, 'label', 'Striker')
  ))
ON CONFLICT DO NOTHING;

INSERT INTO public.lineup_formations (name, description, positions) VALUES
  ('3-4-1-2', 'Attacking trident', jsonb_build_array(
    jsonb_build_object('position', 'GK', 'x', 50, 'y', 95, 'label', 'Goalkeeper'),
    jsonb_build_object('position', 'CB', 'x', 35, 'y', 75, 'label', 'Center Back'),
    jsonb_build_object('position', 'CB', 'x', 50, 'y', 80, 'label', 'Center Back'),
    jsonb_build_object('position', 'CB', 'x', 65, 'y', 75, 'label', 'Center Back'),
    jsonb_build_object('position', 'LB', 'x', 15, 'y', 50, 'label', 'Left Back'),
    jsonb_build_object('position', 'CM', 'x', 40, 'y', 50, 'label', 'Center Midfield'),
    jsonb_build_object('position', 'CM', 'x', 60, 'y', 50, 'label', 'Center Midfield'),
    jsonb_build_object('position', 'RB', 'x', 85, 'y', 50, 'label', 'Right Back'),
    jsonb_build_object('position', 'CAM', 'x', 50, 'y', 25, 'label', 'Attacking Midfield'),
    jsonb_build_object('position', 'ST', 'x', 35, 'y', 10, 'label', 'Striker'),
    jsonb_build_object('position', 'ST', 'x', 65, 'y', 10, 'label', 'Striker')
  ))
ON CONFLICT DO NOTHING;

INSERT INTO public.lineup_formations (name, description, positions) VALUES
  ('4-1-4-1', 'Defensive pivot', jsonb_build_array(
    jsonb_build_object('position', 'GK', 'x', 50, 'y', 95, 'label', 'Goalkeeper'),
    jsonb_build_object('position', 'LB', 'x', 20, 'y', 75, 'label', 'Left Back'),
    jsonb_build_object('position', 'CB', 'x', 35, 'y', 75, 'label', 'Center Back'),
    jsonb_build_object('position', 'CB', 'x', 65, 'y', 75, 'label', 'Center Back'),
    jsonb_build_object('position', 'RB', 'x', 80, 'y', 75, 'label', 'Right Back'),
    jsonb_build_object('position', 'CDM', 'x', 50, 'y', 55, 'label', 'Defensive Midfield'),
    jsonb_build_object('position', 'LM', 'x', 15, 'y', 35, 'label', 'Left Midfield'),
    jsonb_build_object('position', 'CM', 'x', 40, 'y', 40, 'label', 'Center Midfield'),
    jsonb_build_object('position', 'CM', 'x', 60, 'y', 40, 'label', 'Center Midfield'),
    jsonb_build_object('position', 'RM', 'x', 85, 'y', 35, 'label', 'Right Midfield'),
    jsonb_build_object('position', 'ST', 'x', 50, 'y', 8, 'label', 'Striker')
  ))
ON CONFLICT DO NOTHING;

-- 4. Enable RLS
ALTER TABLE public.match_lineups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lineup_formations ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies

-- Formations are readable by all
DROP POLICY IF EXISTS "Formations readable by all" ON public.lineup_formations;
CREATE POLICY "Formations readable by all" ON public.lineup_formations FOR SELECT USING (true);

-- Lineups are readable by:
-- - Players on the same match
-- - Match organizer
-- Writable by:
-- - Players in their own team's lineup (only own position)
-- - Match organizer (can change positions for all)
DROP POLICY IF EXISTS "Lineups readable by match participants" ON public.match_lineups;
CREATE POLICY "Lineups readable by match participants" ON public.match_lineups FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.match_participants mp
    WHERE mp.match_id = match_id AND mp.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = match_id AND m.organizer_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Lineups insertable by organizer only" ON public.match_lineups;
CREATE POLICY "Lineups insertable by organizer only" ON public.match_lineups FOR INSERT TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = match_id AND m.organizer_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Players can update own position" ON public.match_lineups;
CREATE POLICY "Players can update own position" ON public.match_lineups FOR UPDATE TO authenticated USING (
  player_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = match_id AND m.organizer_id = auth.uid()
  )
) WITH CHECK (
  player_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = match_id AND m.organizer_id = auth.uid()
  )
);

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_match_lineups_match ON public.match_lineups(match_id);
CREATE INDEX IF NOT EXISTS idx_match_lineups_player ON public.match_lineups(player_id);
CREATE INDEX IF NOT EXISTS idx_match_lineups_team ON public.match_lineups(match_id, team_side);
CREATE INDEX IF NOT EXISTS idx_match_lineups_formation ON public.match_lineups(formation);

-- 7. Add to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.match_lineups;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.lineup_formations;
