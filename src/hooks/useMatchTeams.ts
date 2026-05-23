import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type TeamStats = {
  count: number;
  max: number;
  open: number;
};

export type MatchTeams = {
  reds: TeamStats;
  blues: TeamStats;
  isGala: boolean;
  teamsIn: number;
  capTeams: number;
};

/** Count active core participants per team for a two-team match */
export function useMatchTeams(matchId?: string) {
  const [teams, setTeams] = useState<MatchTeams | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!matchId) { setTeams(null); return; }

    let cancelled = false;
    setLoading(true);

    const load = async () => {
      const { data, error } = await supabase
        .from("match_participants")
        .select("team, status, slot_type")
        .eq("match_id", matchId)
        .eq("status", "active" as any)
        .eq("slot_type", "core" as any);

      if (cancelled) return;

      if (error) {
        setTeams(null);
      } else {
        const list = (data ?? []) as { team: string; status: string; slot_type: string }[];
        const reds = list.filter((p) => p.team === "reds").length;
        const blues = list.filter((p) => p.team === "blues").length;
        const maxPerSide = Math.max(reds, blues, 5); // fallback estimate

        setTeams({
          reds: { count: reds, max: maxPerSide, open: Math.max(0, maxPerSide - reds) },
          blues: { count: blues, max: maxPerSide, open: Math.max(0, maxPerSide - blues) },
          isGala: false,
          teamsIn: 0,
          capTeams: 0,
        });
      }
      setLoading(false);
    };

    load();

    return () => { cancelled = true; };
  }, [matchId]);

  return { teams, loading };
}
