import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type MyMatch = {
  id: string;
  join_code: string;
  match_date: string;
  format: string;
  match_mode: string;
  entry_fee: number;
  status: string;
  venue: {
    id: string;
    name: string;
    city: string | null;
    area: string | null;
  } | null;
};

export function useMySchedule(userId: string | undefined) {
  const [matches, setMatches] = useState<MyMatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setMatches([]); setLoading(false); return; }

    let cancelled = false;
    setLoading(true);

    const load = async () => {
      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from("match_participants")
        .select(`
          match:matches(id, join_code, match_date, format, match_mode, entry_fee, status, venue:venues(id, name, city, area))
        `)
        .eq("user_id", userId)
        .eq("status", "active" as any)
        .gte("match.match_date", now)
        .order("match.match_date", { ascending: true });

      if (cancelled) return;

      if (error) {
        setMatches([]);
      } else {
        const normalized = (data ?? []).map((row: any) => {
          const m = Array.isArray(row.match) ? row.match[0] ?? {} : row.match ?? {};
          const v = Array.isArray(m.venue) ? m.venue[0] ?? null : m.venue ?? null;
          return {
            id: m.id,
            join_code: m.join_code,
            match_date: m.match_date,
            format: m.format,
            match_mode: m.match_mode,
            entry_fee: m.entry_fee,
            status: m.status,
            venue: v,
          } as MyMatch;
        });
        setMatches(normalized);
      }
      setLoading(false);
    };

    load();
  }, [userId]);

  return { matches, loading };
}
