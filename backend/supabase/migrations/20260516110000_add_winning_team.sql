-- Add winning_team column to matches
-- Stores the color name of the winning team, or 'draw', or null if not yet recorded.

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS winning_team text DEFAULT NULL;

COMMENT ON COLUMN matches.winning_team IS 'Winning team color (e.g. red, blue) set by organizer after match completes, or "draw".';
