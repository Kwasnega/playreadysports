import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MatchLineup, Formation, TeamSide, FootballPosition, LineupWithPlayer } from "@/types/lineup";
import { toast } from "sonner";

export function useMatchLineup(matchId: string | null, teamSide: TeamSide | null) {
  const { user } = useAuth();
  const [lineups, setLineups] = useState<LineupWithPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formations, setFormations] = useState<Formation[]>([]);
  const [currentFormation, setCurrentFormation] = useState<string | null>(null);
  const subscriptionRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Fetch formations once
  const fetchFormations = useCallback(async () => {
    try {
      const { data, error: err } = await supabase
        .from("lineup_formations")
        .select("id, name, description, positions")
        .order("name");

      if (err) throw err;
      setFormations((data as Formation[]) || []);
    } catch (err: any) {
      console.error("Failed to fetch formations:", err);
      setError(err.message);
    }
  }, []);

  // Fetch lineups for a specific team
  const fetchLineups = useCallback(async () => {
    if (!matchId || !teamSide) {
      setLineups([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: err } = await supabase
        .from("match_lineups")
        .select(
          `id, match_id, team_side, player_id, assigned_position, jersey_number, 
           formation, x_position, y_position, is_starting_player, updated_at, updated_by,
           player:profiles(id, full_name, avatar_url)`
        )
        .eq("match_id", matchId)
        .eq("team_side", teamSide)
        .order("is_starting_player", { ascending: false })
        .order("created_at");

      if (err) throw err;

      const lineupData = (data as any[]) || [];
      setLineups(lineupData);

      // Extract current formation from first lineup entry
      if (lineupData.length > 0 && lineupData[0].formation) {
        setCurrentFormation(lineupData[0].formation);
      }
    } catch (err: any) {
      console.error("Failed to fetch lineups:", err);
      setError(err.message);
      setLineups([]);
    } finally {
      setLoading(false);
    }
  }, [matchId, teamSide]);

  // Set up real-time subscription
  useEffect(() => {
    if (!matchId || !teamSide || !user) return;

    fetchLineups();

    // Subscribe to lineup changes
    const channel = supabase
      .channel(`match_lineups:${matchId}:${teamSide}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "match_lineups",
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => {
          if ((payload.new as any)?.team_side === teamSide) {
            // Refresh lineups on any change
            fetchLineups();
          }
        }
      )
      .subscribe();

    subscriptionRef.current = channel;

    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
      }
    };
  }, [matchId, teamSide, user, fetchLineups]);

  // Update a player's position
  const updatePlayerPosition = useCallback(
    async (
      playerId: string,
      position: FootballPosition,
      x?: number,
      y?: number
    ): Promise<boolean> => {
      if (!matchId || !teamSide || !user) {
        setError("Missing required info");
        return false;
      }

      try {
        // Get current lineup entry
        const { data: existing, error: fetchErr } = await supabase
          .from("match_lineups")
          .select("id")
          .eq("match_id", matchId)
          .eq("team_side", teamSide)
          .eq("player_id", playerId)
          .maybeSingle();

        if (fetchErr) throw fetchErr;

        if (existing) {
          // Update existing
          const { error: updateErr } = await supabase
            .from("match_lineups")
            .update({
              assigned_position: position,
              x_position: x,
              y_position: y,
              updated_at: new Date().toISOString(),
              updated_by: user.id,
            })
            .eq("id", existing.id);

          if (updateErr) throw updateErr;
        } else {
          // Insert new
          const { error: insertErr } = await supabase
            .from("match_lineups")
            .insert({
              match_id: matchId,
              team_side: teamSide,
              player_id: playerId,
              assigned_position: position,
              x_position: x,
              y_position: y,
              formation: currentFormation || "4-3-3",
              is_starting_player: true,
              updated_by: user.id,
            });

          if (insertErr) throw insertErr;
        }

        toast.success("Position updated");
        await fetchLineups();
        return true;
      } catch (err: any) {
        const msg = err.message || "Failed to update position";
        setError(msg);
        toast.error(msg);
        return false;
      }
    },
    [matchId, teamSide, user, currentFormation, fetchLineups]
  );

  // Change formation (bulk update positions)
  const changeFormation = useCallback(
    async (formationName: string): Promise<boolean> => {
      if (!matchId || !teamSide || !user) {
        setError("Missing required info");
        return false;
      }

      try {
        const selectedFormation = formations.find((f) => f.name === formationName);
        if (!selectedFormation) {
          throw new Error("Formation not found");
        }

        // Fetch all current lineups for this team
        const { data: currentLineups, error: fetchErr } = await supabase
          .from("match_lineups")
          .select("player_id, is_starting_player")
          .eq("match_id", matchId)
          .eq("team_side", teamSide);

        if (fetchErr) throw fetchErr;

        const starters = (currentLineups || [])
          .filter((l: any) => l.is_starting_player)
          .map((l: any) => l.player_id);

        // Assign positions from formation to starters
        const updates = starters.slice(0, selectedFormation.positions.length).map((playerId: string, idx: number) => ({
          player_id: playerId,
          position: selectedFormation.positions[idx],
        }));

        // Update all positions
        for (const update of updates) {
          const pos = update.position;
          await updatePlayerPosition(
            update.player_id,
            pos.position,
            pos.x,
            pos.y
          );
        }

        // Update formation field for all lineups
        const { error: formationErr } = await supabase
          .from("match_lineups")
          .update({
            formation: formationName,
            updated_at: new Date().toISOString(),
            updated_by: user.id,
          })
          .eq("match_id", matchId)
          .eq("team_side", teamSide);

        if (formationErr) throw formationErr;

        setCurrentFormation(formationName);
        toast.success(`Formation changed to ${formationName}`);
        await fetchLineups();
        return true;
      } catch (err: any) {
        const msg = err.message || "Failed to change formation";
        setError(msg);
        toast.error(msg);
        return false;
      }
    },
    [matchId, teamSide, user, formations, updatePlayerPosition, fetchLineups]
  );

  // Get starting vs bench players
  const starters = lineups.filter((l) => l.is_starting_player);
  const subs = lineups.filter((l) => !l.is_starting_player);

  return {
    // Data
    lineups,
    starters,
    subs,
    currentFormation,
    formations,

    // State
    loading,
    error,

    // Actions
    fetchLineups,
    fetchFormations,
    updatePlayerPosition,
    changeFormation,
    setCurrentFormation,
  };
}
