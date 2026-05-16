import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type Timeframe = "all" | "week" | "month";

export interface LeaderboardPlayer {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  reputation_score: number;
  total_matches_played: number;
  total_wins: number;
  city: string | null;
}

export interface RisingStar {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  recentMatches: number;
}

export interface TopVenue {
  venueId: string;
  venueName: string;
  playerCount: number;
}

export const useLeaderboard = (timeframe: Timeframe = "all", city?: string | null) => {
  const { user } = useAuth();
  const [players, setPlayers] = useState<LeaderboardPlayer[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [topVenue, setTopVenue] = useState<TopVenue | null>(null);
  const [risingStar, setRisingStar] = useState<RisingStar | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [userEntry, setUserEntry] = useState<LeaderboardPlayer | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      // Get cutoff date for timeframe
      const now = new Date();
      let cutoff: string | null = null;
      if (timeframe === "week") {
        const d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        cutoff = d.toISOString();
      } else if (timeframe === "month") {
        const d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        cutoff = d.toISOString();
      }

      // Build base query
      let q = supabase
        .from("profiles")
        .select(
          "id, username, full_name, avatar_url, reputation_score, total_matches_played, total_wins, city"
        )
        .gt("reputation_score", 0)
        .or("role.is.null,role.neq.turf_owner");

      if (city) q = q.eq("city", city);
      if (cutoff) q = q.gte("created_at", cutoff);

      const { data, error } = await q
        .order("reputation_score", { ascending: false })
        .limit(50);

      if (error) {
        setLoading(false);
        return;
      }

      const list = (data ?? []) as LeaderboardPlayer[];
      setPlayers(list);

      // Fetch distinct cities
      const { data: cityData } = await supabase
        .from("profiles")
        .select("city")
        .not("city", "is", null)
        .order("city");
      const distinct = Array.from(new Set((cityData ?? []).map((c: any) => c.city as string)));
      setCities(distinct);

      // Fetch top venue (venue with most unique ranked players in recent matches)
      const playerIds = list.slice(0, 20).map((p) => p.id);
      if (playerIds.length > 0) {
        const { data: venueData } = await supabase
          .from("match_participants")
          .select("match:matches!inner(venue:venues!inner(id, name))")
          .in("user_id", playerIds)
          .eq("status", "active");

        const counts: Record<string, { name: string; count: number }> = {};
        (venueData ?? []).forEach((row: any) => {
          const v = row.match?.venue;
          if (v?.id) {
            if (!counts[v.id]) counts[v.id] = { name: v.name, count: 0 };
            counts[v.id].count++;
          }
        });
        const top = Object.entries(counts).sort((a, b) => b[1].count - a[1].count)[0];
        if (top) {
          setTopVenue({ venueId: top[0], venueName: top[1].name, playerCount: top[1].count });
        } else {
          setTopVenue(null);
        }
      }

      // Fetch rising star: most matches joined in the last 7 days (count in JS since .group() isn't in supabase-js)
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: rsRows } = await supabase
        .from("match_participants")
        .select("user_id")
        .gte("joined_at", weekAgo)
        .eq("status", "active");

      if (rsRows && rsRows.length > 0) {
        const counts: Record<string, number> = {};
        rsRows.forEach((row: any) => {
          counts[row.user_id] = (counts[row.user_id] || 0) + 1;
        });
        const topUserId = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
        const topCount = topUserId ? counts[topUserId] : 0;
        if (topUserId) {
          const { data: rsProfile } = await supabase
            .from("profiles")
            .select("id, username, full_name, avatar_url")
            .eq("id", topUserId)
            .single();
          if (rsProfile) {
            setRisingStar({
              id: rsProfile.id,
              username: rsProfile.username,
              full_name: rsProfile.full_name,
              avatar_url: rsProfile.avatar_url,
              recentMatches: topCount,
            });
          } else {
            setRisingStar(null);
          }
        } else {
          setRisingStar(null);
        }
      } else {
        setRisingStar(null);
      }

      if (user) {
        const idx = list.findIndex((p) => p.id === user.id);
        if (idx >= 0) {
          setUserRank(idx + 1);
          setUserEntry(list[idx]);
        } else {
          const { data: me } = await supabase
            .from("profiles")
            .select(
              "id, username, full_name, avatar_url, reputation_score, total_matches_played, total_wins, city"
            )
            .eq("id", user.id)
            .single();
          if (me) {
            setUserEntry(me as LeaderboardPlayer);
            const { count } = await supabase
              .from("profiles")
              .select("*", { count: "exact", head: true })
              .gt("reputation_score", me.reputation_score ?? 0);
            setUserRank((count ?? 0) + 1);
          }
        }
      }

      setLoading(false);
    };

    load();
  }, [user, timeframe, city]);

  return { players, cities, topVenue, risingStar, loading, userRank, userEntry };
};
