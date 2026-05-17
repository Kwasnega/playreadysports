import { useQuery } from "@tanstack/react-query";
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

async function fetchLeaderboard(timeframe: Timeframe, city?: string | null) {
  const now = new Date();
  let cutoff: string | null = null;
  if (timeframe === "week") {
    cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  } else if (timeframe === "month") {
    cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  }

  // Use leaderboard_mv for "all" timeframe (materialized view = fast)
  let q;
  if (timeframe === "all") {
    q = supabase
      .from("leaderboard_mv")
      .select("*")
      .limit(50);
    if (city) q = q.eq("city", city);
  } else {
    q = supabase
      .from("profiles")
      .select("id, username, full_name, avatar_url, reputation_score, total_matches_played, total_wins, city")
      .gt("reputation_score", 0)
      .or("role.is.null,role.neq.turf_owner");
    if (city) q = q.eq("city", city);
    if (cutoff) q = q.gte("created_at", cutoff);
    q = q.order("reputation_score", { ascending: false }).limit(50);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const list = (data ?? []) as LeaderboardPlayer[];

  // Fetch distinct cities
  const { data: cityData } = await supabase
    .from("profiles")
    .select("city")
    .not("city", "is", null)
    .order("city");
  const cities = Array.from(new Set((cityData ?? []).map((c: any) => c.city as string)));

  // Top venue
  const playerIds = list.slice(0, 20).map((p) => p.id);
  let topVenue: TopVenue | null = null;
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
    if (top) topVenue = { venueId: top[0], venueName: top[1].name, playerCount: top[1].count };
  }

  // Rising star
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: rsRows } = await supabase
    .from("match_participants")
    .select("user_id")
    .gte("joined_at", weekAgo)
    .eq("status", "active");

  let risingStar: RisingStar | null = null;
  if (rsRows && rsRows.length > 0) {
    const counts: Record<string, number> = {};
    rsRows.forEach((row: any) => { counts[row.user_id] = (counts[row.user_id] || 0) + 1; });
    const topUserId = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const topCount = topUserId ? counts[topUserId] : 0;
    if (topUserId) {
      const { data: rsProfile } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url")
        .eq("id", topUserId)
        .single();
      if (rsProfile) {
        risingStar = {
          id: rsProfile.id,
          username: rsProfile.username,
          full_name: rsProfile.full_name,
          avatar_url: rsProfile.avatar_url,
          recentMatches: topCount,
        };
      }
    }
  }

  return { list, cities, topVenue, risingStar };
}

export const useLeaderboard = (timeframe: Timeframe = "all", city?: string | null) => {
  const { user } = useAuth();

  const { data, isLoading: loading, error } = useQuery({
    queryKey: ["leaderboard", timeframe, city],
    queryFn: () => fetchLeaderboard(timeframe, city),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });

  const players = data?.list ?? [];
  const cities = data?.cities ?? [];
  const topVenue = data?.topVenue ?? null;
  const risingStar = data?.risingStar ?? null;

  // Compute user rank from cached list
  const userRank = user ? players.findIndex((p) => p.id === user.id) + 1 || null : null;
  const userEntry = userRank ? players[userRank - 1] ?? null : null;

  if (error) console.error("useLeaderboard error:", error);

  return { players, cities, topVenue, risingStar, loading, userRank, userEntry };
};
