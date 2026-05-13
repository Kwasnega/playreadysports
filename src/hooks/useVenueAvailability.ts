import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, format } from "date-fns";

export type DayAvailability = "free" | "tentative" | "booked";

export type MatchSlot = {
  id: string;
  match_date: string;
  status: string;
  core_paid_count: number;
  max_core_players: number | null;
  entry_fee: number;
  format: string;
  match_mode: string;
};

export function useVenueAvailability(venueId: string | null, monthDate: Date) {
  const [matches, setMatches] = useState<MatchSlot[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!venueId) { setMatches([]); return; }

    let cancelled = false;
    setLoading(true);

    const start = startOfMonth(monthDate);
    const end = endOfMonth(monthDate);
    const startIso = start.toISOString();
    const endIso = end.toISOString();

    const load = async () => {
      const { data, error } = await supabase
        .from("matches")
        .select("id, match_date, status, core_paid_count, max_core_players, entry_fee, format, match_mode")
        .eq("venue_id", venueId)
        .gte("match_date", startIso)
        .lte("match_date", endIso)
        .order("match_date", { ascending: true });

      if (cancelled) return;

      if (error) {
        console.error("useVenueAvailability error:", error);
        setMatches([]);
      } else {
        setMatches((data ?? []) as MatchSlot[]);
      }
      setLoading(false);
    };

    load();
  }, [venueId, monthDate.getFullYear(), monthDate.getMonth()]);

  const availability = useMemo(() => {
    const map = new Map<string, DayAvailability>();

    for (const m of matches) {
      const day = format(new Date(m.match_date), "yyyy-MM-dd");
      const max = m.max_core_players ?? 10;
      const isFull = m.status === "live" || m.core_paid_count >= max;
      const current = map.get(day);

      if (isFull) {
        map.set(day, "booked");
      } else if (current !== "booked") {
        map.set(day, "tentative");
      }
    }

    return map;
  }, [matches]);

  const bookedDays = useMemo(() => {
    const out: Date[] = [];
    availability.forEach((status, day) => {
      if (status === "booked") out.push(new Date(day + "T00:00:00"));
    });
    return out;
  }, [availability]);

  const tentativeDays = useMemo(() => {
    const out: Date[] = [];
    availability.forEach((status, day) => {
      if (status === "tentative") out.push(new Date(day + "T00:00:00"));
    });
    return out;
  }, [availability]);

  const fullyFreeDays = useMemo(() => {
    // We can't know all free days without iterating the whole month.
    // Return empty — the Calendar component will show no dot for free days.
    // If we want explicit free dots, the parent can compute from the month grid.
    return [] as Date[];
  }, []);

  const dayMatches = useMemo(() => {
    return (dayStr: string) => matches.filter((m) => format(new Date(m.match_date), "yyyy-MM-dd") === dayStr);
  }, [matches]);

  return {
    matches,
    availability,
    bookedDays,
    tentativeDays,
    fullyFreeDays,
    dayMatches,
    loading,
  };
}
