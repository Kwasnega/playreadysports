import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type HomeStats = {
  matchesToday: number;
  playersOnline: number;
};

export function useHomeStats(refreshMs = 60000) {
  const [stats, setStats] = useState<HomeStats>({ matchesToday: 0, playersOnline: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const startIso = todayStart.toISOString();
      const endIso = todayEnd.toISOString();

      // Count matches today
      const { count: matchCount, error: matchErr } = await supabase
        .from("matches")
        .select("*", { count: "exact", head: true })
        .gte("match_date", startIso)
        .lte("match_date", endIso)
        .in("status", ["upcoming", "live"] as any);

      // Count active participants today (unique users in active matches today)
      const { count: playerCount, error: playerErr } = await supabase
        .from("match_participants")
        .select("*", { count: "exact", head: true })
        .eq("status", "active" as any)
        .gte("joined_at", startIso);

      if (cancelled) return;

      if (matchErr) console.error("stats matches error:", matchErr);
      if (playerErr) console.error("stats players error:", playerErr);

      setStats({
        matchesToday: matchCount ?? 0,
        playersOnline: playerCount ?? 0,
      });
      setLoading(false);
    };

    load();
    const interval = setInterval(load, refreshMs);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [refreshMs]);

  return { stats, loading };
}
