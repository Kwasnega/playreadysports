import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  getFormattedTime,
  getDistanceKm,
  getSpotsLeft,
  getActiveCoreCount,
} from "@/lib/matchHelpers";

export type BrowseMatch = {
  id: string;
  join_code: string;
  title: string | null;
  match_mode: string;
  match_type: string;
  format: string;
  players_per_side: number | null;
  max_core_players: number | null;
  match_date: string;
  entry_fee: number;
  status: string;
  core_paid_count: number;
  max_spare_players: number;
  duration_minutes: number;
  notes: string | null;
  organizer_id: string | null;
  venue: {
    id: string;
    name: string;
    city: string;
    area: string | null;
    lat: number | null;
    lng: number | null;
  } | null;
  organizer: {
    id: string;
    username: string | null;
    full_name: string | null;
    avatar_url: string | null;
    reputation_score: number | null;
  } | null;
  participants: {
    id: string;
    status: string;
    team: string;
    slot_type: string;
    payment_status: string;
  }[];
};

export type DayBucket = "tonight" | "this_weekend" | "next_week" | "later";

export type BrowseFilters = {
  mode?: "two_team" | "gala";
  sort: "soonest" | "nearest" | "cheapest";
  search?: string;
  userLat?: number;
  userLng?: number;
};

const BUCKET_LABEL: Record<DayBucket, string> = {
  tonight: "Tonight",
  this_weekend: "This weekend",
  next_week: "Next week",
  later: "Later",
};

const BUCKET_ORDER: Record<DayBucket, number> = {
  tonight: 0,
  this_weekend: 1,
  next_week: 2,
  later: 3,
};

function assignBucket(dateStr: string): DayBucket {
  const now = new Date();
  const d = new Date(dateStr);

  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  if (isToday) return "tonight";

  const dayOfWeek = d.getDay(); // 0=Sun, 5=Fri, 6=Sat
  const diffDays = Math.floor((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if ((dayOfWeek === 6 || dayOfWeek === 5) && diffDays <= 3) return "this_weekend";
  if (diffDays < 7) return "next_week";

  return "later";
}

export function useBrowseMatches(filters: BrowseFilters) {
  const [matches, setMatches] = useState<BrowseMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { mode, sort, search, userLat, userLng } = filters;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      const now = new Date().toISOString();

      let query = supabase
        .from("matches")
        .select(
          `
          *,
          venue:venues(id, name, city, area, lat, lng),
          participants:match_participants(id, status, team, slot_type, payment_status)
        `
        )
        .eq("match_type", "public" as any)
        .eq("status", "upcoming" as any)
        .gte("match_date", now)
        .order("match_date", { ascending: true })
        .limit(50);

      if (mode) {
        query = query.eq("match_mode", mode as any);
      }

      if (search?.trim()) {
        const q = `%${search.trim()}%`;
        query = query.or(`join_code.ilike.${q},title.ilike.${q},format.ilike.${q},venue(name).ilike.${q}`, { foreignTable: "venues" } as any);
      }

      const { data, error: supaErr } = await query;

      if (cancelled) return;

      if (supaErr) {
        console.error("useBrowseMatches error:", supaErr);
        setError(supaErr.message);
        setMatches([]);
      } else {
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

        const normalized = rows.map((row: any) => ({
          ...row,
          venue: Array.isArray(row.venue) ? row.venue[0] ?? null : row.venue ?? null,
          organizer: organizerMap[row.organizer_id] ?? null,
          participants: Array.isArray(row.participants) ? row.participants : [],
        })) as BrowseMatch[];
        setMatches(normalized);
      }

      setLoading(false);
    };

    load();
  }, [mode, search]);

  // Sort and bucket the loaded matches
  const sorted = useMemo(() => {
    const list = [...matches];

    if (sort === "nearest" && userLat != null && userLng != null) {
      list.sort((a, b) => {
        const da = a.venue?.lat && a.venue?.lng
          ? getDistanceKm(userLat, userLng, a.venue.lat, a.venue.lng)
          : Infinity;
        const db = b.venue?.lat && b.venue?.lng
          ? getDistanceKm(userLat, userLng, b.venue.lat, b.venue.lng)
          : Infinity;
        return da - db;
      });
    } else if (sort === "cheapest") {
      list.sort((a, b) => Number(a.entry_fee) - Number(b.entry_fee));
    }
    // soonest is default order from DB

    return list;
  }, [matches, sort, userLat, userLng]);

  const grouped = useMemo(() => {
    if (sort !== "soonest") return null;

    const groups: Record<DayBucket, BrowseMatch[]> = {
      tonight: [],
      this_weekend: [],
      next_week: [],
      later: [],
    };

    sorted.forEach((m) => {
      groups[assignBucket(m.match_date)].push(m);
    });

    return (Object.keys(groups) as DayBucket[])
      .filter((k) => groups[k].length > 0)
      .sort((a, b) => BUCKET_ORDER[a] - BUCKET_ORDER[b])
      .map((k) => ({ key: k, label: BUCKET_LABEL[k], items: groups[k] }));
  }, [sorted, sort]);

  return { matches: sorted, grouped, loading, error };
}

/** Keep filter state in URL query params so back/forward works */
export function useBrowseFilters(defaultLat = 5.6037, defaultLng = -0.187) {
  const [params, setParams] = useSearchParams();

  const mode = (params.get("mode") as "two_team" | "gala" | null) ?? undefined;
  const sort = (params.get("sort") as "soonest" | "nearest" | "cheapest") || "soonest";
  const search = params.get("search") ?? undefined;

  const setMode = (val: "two_team" | "gala" | undefined) => {
    const next = new URLSearchParams(params);
    if (val) next.set("mode", val);
    else next.delete("mode");
    setParams(next);
  };

  const setSort = (val: "soonest" | "nearest" | "cheapest") => {
    const next = new URLSearchParams(params);
    next.set("sort", val);
    setParams(next);
  };

  const setSearch = (val: string) => {
    const next = new URLSearchParams(params);
    if (val.trim()) next.set("search", val.trim());
    else next.delete("search");
    setParams(next);
  };

  return {
    filters: {
      mode,
      sort,
      search,
      userLat: defaultLat,
      userLng: defaultLng,
    } satisfies BrowseFilters,
    setMode,
    setSort,
    setSearch,
  };
}
