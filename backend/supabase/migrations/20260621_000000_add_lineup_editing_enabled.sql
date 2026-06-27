-- Add lineup_editing_enabled field to matches table
-- This field controls whether players can edit the lineup or only the organizer can

ALTER TABLE matches 
ADD COLUMN IF NOT EXISTS lineup_editing_enabled BOOLEAN DEFAULT true;

-- Add comment
COMMENT ON COLUMN matches.lineup_editing_enabled IS 'Controls whether players can edit the lineup (true) or only the organizer can edit (false). Defaults to true (open for editing).';
