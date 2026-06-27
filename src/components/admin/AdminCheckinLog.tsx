import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { QrCode, RefreshCw } from "lucide-react";

interface CheckinEvent {
  id: string;
  match_id: string;
  venue_id: string;
  user_id: string;
  scanned_at: string;
  match?: { join_code: string } | null;
  venue?: { name: string } | null;
  profile?: { full_name: string | null; username: string | null } | null;
}

export function AdminCheckinLog() {
  const [events, setEvents] = useState<CheckinEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("match_checkin_events")
      .select(`
        id, match_id, venue_id, user_id, scanned_at,
        match:matches(join_code),
        venue:venues(name),
        profile:profiles(full_name, username)
      `)
      .order("scanned_at", { ascending: false })
      .limit(50);
    if (!error) {
      const normalized = (data ?? []).map((row: any) => ({
        id: row.id,
        match_id: row.match_id,
        venue_id: row.venue_id,
        user_id: row.user_id,
        scanned_at: row.scanned_at,
        match: Array.isArray(row.match) ? row.match[0] : row.match,
        venue: Array.isArray(row.venue) ? row.venue[0] : row.venue,
        profile: Array.isArray(row.profile) ? row.profile[0] : row.profile,
      }));
      setEvents(normalized);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <QrCode className="w-4 h-4 text-primary" />
        <h3 className="font-display font-bold text-sm flex-1">QR Check-in Log</h3>
        <button onClick={load} className="p-1.5 rounded-lg hover:bg-secondary" aria-label="Refresh">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
      {loading ? (
        <div className="p-5 space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-secondary rounded-xl" />)}
        </div>
      ) : events.length === 0 ? (
        <p className="p-5 text-sm text-muted-foreground text-center">No check-ins recorded yet.</p>
      ) : (
        <ul className="divide-y divide-border/60 max-h-[400px] overflow-y-auto">
          {events.map((ev) => (
            <li key={ev.id} className="px-5 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                <QrCode className="w-4 h-4 text-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">
                  {ev.profile?.full_name || ev.profile?.username || "Player"}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {ev.match?.join_code ?? "—"} · {ev.venue?.name ?? "Venue"}
                </p>
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0">
                {new Date(ev.scanned_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
