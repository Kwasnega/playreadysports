import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Venue } from "@/hooks/useVenues";

export type RecommendedMatch = {
  id: string;
  join_code: string;
  match_mode: string;
  format: string;
  match_date: string;
  entry_fee: number;
  core_paid_count: number;
  max_core_players: number;
  status: string;
  venue: Venue | null;
  score: number;
  reason: string;
};

async function fetchRecommendations(userId: string): Promise<RecommendedMatch[]> {
  // 1. Fetch user's match history
  const { data: myMatches } = await supabase
    .from("match_participants")
    .select("match_id, matches(venue_id, match_mode, format, match_date)")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("joined_at", { ascending: false })
    .limit(20);

  const venueIds = new Set<string>();
  const preferredModes = new Map<string, number>();
  const preferredFormats = new Map<string, number>();
  const preferredHours = new Map<number, number>();

  (myMatches ?? []).forEach((mp: any) => {
    const m = mp.matches;
    if (!m) return;
    if (m.venue_id) venueIds.add(m.venue_id);
    preferredModes.set(m.match_mode, (preferredModes.get(m.match_mode) || 0) + 1);
    preferredFormats.set(m.format, (preferredFormats.get(m.format) || 0) + 1);
    const hour = new Date(m.match_date).getHours();
    preferredHours.set(hour, (preferredHours.get(hour) || 0) + 1);
  });

  // 2. Fetch upcoming public matches
  const now = new Date().toISOString();
  const { data: upcoming } = await supabase
    .from("matches")
    .select("*, venue:venues(*)")
    .eq("status", "upcoming")
    .eq("match_type", "public")
    .gt("match_date", now)
    .order("match_date", { ascending: true })
    .limit(50);

  // 3. Score each match
  const scored = (upcoming ?? []).map((m: any) => {
    let score = 0;
    const reasons: string[] = [];
    const venue = Array.isArray(m.venue) ? m.venue[0] ?? null : m.venue ?? null;

    if (venue?.id && venueIds.has(venue.id)) {
      score += 40;
      reasons.push("Venue you played at before");
    }

    if (preferredModes.has(m.match_mode)) {
      score += 20;
      reasons.push(`${m.match_mode === "gala" ? "Gala" : "Two-team"} mode`);
    }

    if (preferredFormats.has(m.format)) {
      score += 15;
      reasons.push(`${m.format}-a-side`);
    }

    const matchHour = new Date(m.match_date).getHours();
    if (preferredHours.has(matchHour)) {
      score += 15;
      reasons.push("Fits your usual time");
    }

    const paid = m.core_paid_count ?? 0;
    const max = m.max_core_players ?? m.players_per_side ?? 10;
    const fillRate = paid / max;
    if (fillRate > 0.5 && fillRate < 1) {
      score += 10;
      reasons.push("Filling up fast");
    }

    const hoursUntil = (new Date(m.match_date).getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntil < 48) score += 5;

    return {
      id: m.id,
      join_code: m.join_code,
      match_mode: m.match_mode,
      format: m.format,
      match_date: m.match_date,
      entry_fee: m.entry_fee ?? 0,
      core_paid_count: paid,
      max_core_players: max,
      status: m.status,
      venue,
      score,
      reason: reasons[0] || "Upcoming match",
    };
  });

  const myMatchIds = new Set((myMatches ?? []).map((mp: any) => mp.match_id));
  return scored
    .filter((m) => !myMatchIds.has(m.id))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

export function useSmartRecommendations() {
  const { user } = useAuth();

  const { data: recommendations = [], isLoading: loading } = useQuery({
    queryKey: ["smart-recommendations", user?.id],
    queryFn: () => fetchRecommendations(user!.id),
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });

  return { recommendations, loading };
}
