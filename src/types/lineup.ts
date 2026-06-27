/**
 * Match Lineup Types
 * Supports formations, player positioning, and tactical organization
 */

export type TeamSide = "team_a" | "team_b";

export type FootballPosition =
  | "GK"   // Goalkeeper
  | "LB"   // Left Back
  | "CB"   // Center Back
  | "RB"   // Right Back
  | "LWB"  // Left Wing-Back
  | "RWB"  // Right Wing-Back
  | "CM"   // Center Midfield
  | "CDM"  // Central Defensive Midfield
  | "CAM"  // Central Attacking Midfield
  | "LM"   // Left Midfield
  | "RM"   // Right Midfield
  | "LW"   // Left Wing
  | "RW"   // Right Wing
  | "ST"   // Striker
  | "CF";  // Center Forward

export interface PitchPosition {
  position: FootballPosition;
  x: number; // 0-100 (left to right)
  y: number; // 0-100 (defensive to attacking)
  label: string;
}

export interface Formation {
  id: string;
  name: string; // '4-3-3', '4-4-2', etc.
  description?: string;
  positions: PitchPosition[];
  created_at: string;
}

export interface MatchLineup {
  id: string;
  match_id: string;
  team_side: TeamSide;
  player_id: string;
  assigned_position: FootballPosition;
  jersey_number?: number;
  formation: string; // e.g., '4-3-3'
  x_position?: number;
  y_position?: number;
  is_starting_player: boolean;
  updated_at: string;
  updated_by?: string;
}

export interface LineupWithPlayer extends MatchLineup {
  player?: {
    id: string;
    full_name: string;
    avatar_url?: string;
  };
}

export interface TeamLineup {
  team_side: TeamSide;
  formation: string;
  starters: LineupWithPlayer[];
  substitutes: LineupWithPlayer[];
  totalPlayers: number;
}

export interface LineupModalState {
  isOpen: boolean;
  player?: LineupWithPlayer;
  availablePositions?: FootballPosition[];
}

export interface PitchPlayerCard {
  id: string;
  playerName: string;
  initials: string;
  position: FootballPosition;
  jerseyNumber?: number;
  x: number;
  y: number;
  teamColor: "white" | "black"; // Team A or Team B
}

export interface LineupFormation {
  name: string;
  count: number; // Total players in formation
}

// Common formations with player counts
export const COMMON_FORMATIONS: Record<string, { count: number; description: string }> = {
  "4-3-3": { count: 11, description: "Balanced" },
  "4-4-2": { count: 11, description: "Classic" },
  "4-2-3-1": { count: 11, description: "Defensive" },
  "3-5-2": { count: 10, description: "Wing-heavy" },
  "4-5-1": { count: 10, description: "Midfield" },
  "3-4-3": { count: 10, description: "Attacking 3-back" },
  "5-3-2": { count: 10, description: "Defensive 5-back" },
  "4-3-2-1": { count: 11, description: "Balanced hybrid" },
  "3-4-1-2": { count: 10, description: "Attacking trident" },
  "4-1-4-1": { count: 11, description: "Defensive pivot" },
};
