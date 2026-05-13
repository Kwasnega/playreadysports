import { useEffect, useState } from "react";
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
  venue: Venue | null;
  organizer: Organizer | null;
  participants: Participant[];
};

export function useHomeMatches() {
  const [matches, setMatches] = useState<HomeMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      const now = new Date().toISOString();

      const { data, error: supaError } = await supabase
        .from("matches")
        .select(`
          *,
          venue:venues(id, name, city, area, lat, lng),
          organizer:profiles(id, username, full_name, avatar_url, reputation_score),
          participants:match_participants(id, user_id, status, team, slot_type, payment_status)
        `)
        .in("status", ["upcoming", "live"] as any)
        .eq("match_type", "public" as any)
        .gte("match_date", now)
        .order("match_date", { ascending: true })
        .limit(10);

      if (cancelled) return;

      if (supaError) {
        console.error("useHomeMatches error:", supaError);
        setError(supaError.message);
        setMatches([]);
      } else {
        const normalized = (data ?? []).map((row: any) => ({
          ...row,
          venue: Array.isArray(row.venue) ? row.venue[0] ?? null : row.venue ?? null,
          organizer: Array.isArray(row.organizer) ? row.organizer[0] ?? null : row.organizer ?? null,
          participants: Array.isArray(row.participants) ? row.participants : [],
        })) as HomeMatch[];
        setMatches(normalized);
      }

      setLoading(false);
    };

    load();

    // Realtime subscription for matches
    const channelName = "home-matches:" + crypto.randomUUID();
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches", filter: `match_type=eq.public` } as any,
        () => load()
      )
      .subscribe();

    return () => {
      cancelled = true;
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, []);

  return { matches, loading, error };
}
