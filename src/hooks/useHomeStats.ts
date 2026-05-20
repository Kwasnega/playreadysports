import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type HomeStats = {
  matchesToday: number;
  playersOnline: number;
};

export function useHomeStats(refreshMs = 60000) {
  const { user } = useAuth();
  const [stats, setStats] = useState<HomeStats>({ matchesToday: 0, playersOnline: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      // Skip expensive count queries for logged-out users to avoid 401s
      // and unnecessary network traffic until anon policies are applied.
      if (!user) {
        if (!cancelled) {
          setStats({ matchesToday: 0, playersOnline: 0 });
          setLoading(false);
        }
        return;
      }

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

      // Suppress 401/403 errors for logged-out users — RLS blocks these queries
      // until the anon policies are applied in the database.
      const isAuthErr = (e: any) => (e?.status === 401 || e?.status === 403 || e?.code === 'PGRST301');
      if (matchErr && !isAuthErr(matchErr)) console.error("stats matches error:", matchErr);
      if (playerErr && !isAuthErr(playerErr)) console.error("stats players error:", playerErr);

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
  }, [refreshMs, user]);

  return { stats, loading };
}
