import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  city: string | null;
  position: string | null;
  phone_number: string | null;
  bio: string | null;
  reputation_score: number | null;
  created_at: string;
};

export type MatchHistoryRow = {
  id: string;
  join_code: string;
  match_date: string;
  format: string;
  match_mode: string;
  status: string;
  venue_name: string | null;
  venue_city: string | null;
};

export type ReviewRow = {
  id: string;
  reviewer_id: string;
  reviewer_name: string | null;
  reviewer_avatar: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
};

export type ProfileStats = {
  matchesPlayed: number;
  reviewsReceived: number;
  avgRating: number | null;
};

export function useProfile(username: string | undefined) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [matchHistory, setMatchHistory] = useState<MatchHistoryRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!username) { setLoading(false); return; }
    setLoading(true);

    // Fetch profile
    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("id, username, full_name, avatar_url, city, position, phone_number, bio, reputation_score, created_at")
      .eq("username", username)
      .maybeSingle();

    if (profErr || !prof) {
      setProfile(null);
      setLoading(false);
      return;
    }

    setProfile(prof as Profile);

    const userId = prof.id;

    // Stats: matches played
    const { count: matchesCount } = await supabase
      .from("match_participants")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "active");

    // Stats: reviews received + avg
    const { data: reviewAgg } = await supabase
      .from("reviews")
      .select("rating")
      .eq("reviewed_user_id", userId);

    const reviewsReceived = reviewAgg?.length ?? 0;
    const avgRating = reviewsReceived > 0
      ? (reviewAgg!.reduce((s, r) => s + (r.rating ?? 0), 0) / reviewsReceived)
      : null;

    setStats({
      matchesPlayed: matchesCount ?? 0,
      reviewsReceived,
      avgRating: avgRating ? Math.round(avgRating * 10) / 10 : null,
    });

    // Match history (last 10)
    const { data: hist } = await supabase
      .from("match_participants")
      .select(`
        match:matches(
          id, join_code, match_date, format, match_mode, status,
          venue:venues(name, city)
        )
      `)
      .eq("user_id", userId)
      .eq("status", "active")
      .order("joined_at", { ascending: false })
      .limit(10);

    const historyRows: MatchHistoryRow[] = [];
    for (const row of hist ?? []) {
      const m = (row as any).match;
      if (!m) continue;
      const venue = Array.isArray(m.venue) ? m.venue[0] ?? null : m.venue ?? null;
      historyRows.push({
        id: m.id,
        join_code: m.join_code,
        match_date: m.match_date,
        format: m.format,
        match_mode: m.match_mode,
        status: m.status,
        venue_name: venue?.name ?? null,
        venue_city: venue?.city ?? null,
      });
    }
    setMatchHistory(historyRows);

    // Reviews received
    const { data: reviewRows } = await supabase
      .from("reviews")
      .select(`
        id, reviewer_id, rating, comment, created_at,
        reviewer:profiles(full_name, username, avatar_url)
      `)
      .eq("reviewed_user_id", userId)
      .order("created_at", { ascending: false });

    const normalizedReviews: ReviewRow[] = [];
    for (const r of reviewRows ?? []) {
      const rev = (r as any).reviewer;
      const revProf = Array.isArray(rev) ? rev[0] ?? null : rev ?? null;
      normalizedReviews.push({
        id: r.id,
        reviewer_id: r.reviewer_id,
        reviewer_name: revProf?.full_name ?? revProf?.username ?? "Anonymous",
        reviewer_avatar: revProf?.avatar_url ?? null,
        rating: r.rating,
        comment: r.comment,
        created_at: r.created_at,
      });
    }
    setReviews(normalizedReviews);
    setLoading(false);
  }, [username]);

  useEffect(() => { load(); }, [load]);

  return { profile, stats, matchHistory, reviews, loading, refresh: load };
}
