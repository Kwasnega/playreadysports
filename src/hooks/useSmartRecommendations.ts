import { useEffect, useState } from "react";
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

export function useSmartRecommendations() {
  const { user } = useAuth();
  const [recommendations, setRecommendations] = useState<RecommendedMatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }

    const load = async () => {
      setLoading(true);

      // 1. Fetch user's match history
      const { data: myMatches } = await supabase
        .from("match_participants")
        .select("match_id, matches(venue_id, match_mode, format, match_date)")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
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

        // Venue affinity (40 points)
        if (venue?.id && venueIds.has(venue.id)) {
          score += 40;
          reasons.push("Venue you played at before");
        }

        // Mode affinity (20 points)
        if (preferredModes.has(m.match_mode)) {
          score += 20;
          reasons.push(`${m.match_mode === "gala" ? "Gala" : "Two-team"} mode`);
        }

        // Format affinity (15 points)
        if (preferredFormats.has(m.format)) {
          score += 15;
          reasons.push(`${m.format}-a-side`);
        }

        // Time affinity (15 points)
        const matchHour = new Date(m.match_date).getHours();
        if (preferredHours.has(matchHour)) {
          score += 15;
          reasons.push("Fits your usual time");
        }

        // Near fill bonus (10 points)
        const paid = m.core_paid_count ?? 0;
        const max = m.max_core_players ?? m.players_per_side ?? 10;
        const fillRate = paid / max;
        if (fillRate > 0.5 && fillRate < 1) {
          score += 10;
          reasons.push("Filling up fast");
        }

        // Recency bonus: closer matches score slightly higher
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

      // Filter out matches user already joined
      const myMatchIds = new Set((myMatches ?? []).map((mp: any) => mp.match_id));
      const filtered = scored
        .filter((m) => !myMatchIds.has(m.id))
        .filter((m) => m.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      setRecommendations(filtered);
      setLoading(false);
    };

    load();
  }, [user]);

  return { recommendations, loading };
}
