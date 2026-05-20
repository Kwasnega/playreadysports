import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Venue = {
  id: string;
  name: string;
  city: string;
  area: string | null;
  lat: number | null;
  lng: number | null;
};

export type Organizer = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  reputation_score: number | null;
};

export type Participant = {
  id: string;
  user_id: string;
  status: string;
  team: string;
  slot_type: string;
  payment_status: string;
};

export type HomeMatch = {
  id: string;
  join_code: string;
  title: string | null;
  match_mode: string;
  match_type: string;
  format: string;
  players_per_side: number | null;
  max_core_players: number | null;
  max_spare_players: number;
  match_date: string;
  duration_minutes: number;
  entry_fee: number;
  status: string;
  core_paid_count: number;
  notes: string | null;
  organizer_id: string | null;
  venue: Venue | null;
  organizer: Organizer | null;
  participants: Participant[];
};

const PAGE_SIZE = 10;

async function fetchHomeMatches(cursor?: string): Promise<HomeMatch[]> {
  const now = new Date().toISOString();
  let q = supabase
    .from("matches")
    .select(`
      *,
      venue:venues(id, name, city, area, lat, lng),
      participants:match_participants(id, user_id, status, team, slot_type, payment_status)
    `)
    .in("status", ["upcoming", "live"] as any)
    .eq("match_type", "public" as any)
    .gte("match_date", now)
    .order("match_date", { ascending: true })
    .limit(PAGE_SIZE);

  if (cursor) q = q.gt("match_date", cursor);

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Match feed timed out. Please check your connection and refresh.")), 10000)
  );

  const { data, error } = await Promise.race([q, timeout]);

  if (error) {
    console.error("useHomeMatches error:", error);
    // If the user is logged out and RLS blocks the query, return empty
    // instead of crashing the entire feed.
    const code = (error as any).code ?? "";
    const status = (error as any).status ?? 0;
    if (status === 401 || status === 403 || code === "PGRST301") {
      return [];
    }
    throw new Error(error.message);
  }

  const rows = data ?? [];

  // Two-step: fetch organizer profiles from public_profiles (safe view)
  const organizerIds = [...new Set(rows.map((r: any) => r.organizer_id).filter(Boolean))];
  const organizerMap: Record<string, any> = {};
  if (organizerIds.length > 0) {
    const { data: profs } = await (supabase as any)
      .from("public_profiles")
      .select("id, username, full_name, avatar_url, reputation_score")
      .in("id", organizerIds);
    (profs ?? []).forEach((p: any) => { organizerMap[p.id] = p; });
  }

  return rows.map((row: any) => ({
    ...row,
    venue: Array.isArray(row.venue) ? row.venue[0] ?? null : row.venue ?? null,
    organizer: organizerMap[(row as any).organizer_id] ?? null,
    participants: Array.isArray(row.participants) ? row.participants : [],
  })) as HomeMatch[];
}

export function useHomeMatches() {
  const [allMatches, setAllMatches] = useState<HomeMatch[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const { data: initialMatches = [], isLoading: loading, error } = useQuery({
    queryKey: ["home-matches"],
    queryFn: () => fetchHomeMatches(),
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 2,
  });

  useEffect(() => {
    setAllMatches(initialMatches);
    setHasMore(initialMatches.length === PAGE_SIZE);
  }, [initialMatches]);

  const loadMore = useCallback(async () => {
    if (!hasMore || allMatches.length === 0) return;
    setIsLoadingMore(true);
    const lastDate = allMatches[allMatches.length - 1].match_date;
    try {
      const next = await fetchHomeMatches(lastDate);
      setAllMatches((prev) => [...prev, ...next]);
      setHasMore(next.length === PAGE_SIZE);
    } finally {
      setIsLoadingMore(false);
    }
  }, [allMatches, hasMore]);

  // Realtime subscription — naive reload on match changes
  useEffect(() => {
    const channelName = "home-matches:" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches", filter: `match_type=eq.public` } as any,
        () => {
          supabase.removeChannel(channel);
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, []);

  const errorMsg = error instanceof Error ? error.message : null;
  return { matches: allMatches, loading, error: errorMsg, hasMore, loadMore, isLoadingMore };
}
