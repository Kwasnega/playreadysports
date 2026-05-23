import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Calendar, MapPin, Users, Clock,
  ChevronRight, Trophy, AlertTriangle, PlayCircle, CheckCircle2, XCircle, User,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getFormattedTime } from "@/lib/matchHelpers";

type Tab = "upcoming" | "live" | "completed" | "cancelled";
type View = "organized" | "joined";

interface MyMatch {
  id: string;
  join_code: string;
  match_date: string;
  format: string;
  match_mode: string;
  entry_fee: number;
  status: string;
  core_paid_count: number;
  max_core_players: number | null;
  venue: { name: string; city: string } | null;
}

const TAB_META: Record<Tab, { label: string; icon: any; empty: string }> = {
  upcoming: { label: "Upcoming", icon: Calendar, empty: "No upcoming matches. Create one!" },
  live:     { label: "Live",     icon: PlayCircle, empty: "No live matches right now." },
  completed:{ label: "Done",    icon: CheckCircle2, empty: "No completed matches yet." },
  cancelled:{ label: "Cancelled",icon: XCircle, empty: "No cancelled matches." },
};

const statusBadge = (status: string) => {
  switch (status) {
    case "upcoming":
      return "bg-emerald-500/10 text-emerald-600";
    case "live":
      return "bg-amber-500/10 text-amber-600";
    case "completed":
      return "bg-blue-500/10 text-blue-600";
    case "cancelled":
      return "bg-red-500/10 text-red-600";
    default:
      return "bg-secondary text-muted-foreground";
  }
};

export default function MyMatches() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [view, setView] = useState<View>("organized");
  const [matches, setMatches] = useState<MyMatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);

    const fetchOrganized = async () => {
      const { data, error } = await supabase
        .from("matches")
        .select("id, join_code, match_date, format, match_mode, entry_fee, status, core_paid_count, max_core_players, venue:venues(name, city)")
        .eq("organizer_id", user.id)
        .order("match_date", { ascending: false });
      setMatches((data ?? []).map((row: any) => {
        const v = Array.isArray(row.venue) ? row.venue[0] ?? null : row.venue ?? null;
        return { ...row, venue: v };
      }));
      setLoading(false);
    };

    const fetchJoined = async () => {
      const { data: pData, error: pErr } = await supabase
        .from("match_participants")
        .select("match_id")
        .eq("user_id", user.id)
        .eq("status", "active");
      if (pErr) { setLoading(false); return; }
      const matchIds = (pData ?? []).map((p: any) => p.match_id);
      if (matchIds.length === 0) { setMatches([]); setLoading(false); return; }
      const { data, error } = await supabase
        .from("matches")
        .select("id, join_code, match_date, format, match_mode, entry_fee, status, core_paid_count, max_core_players, venue:venues(name, city)")
        .in("id", matchIds)
        .order("match_date", { ascending: false });
      setMatches((data ?? []).map((row: any) => {
        const v = Array.isArray(row.venue) ? row.venue[0] ?? null : row.venue ?? null;
        return { ...row, venue: v };
      }));
      setLoading(false);
    };

    if (view === "organized") fetchOrganized();
    else fetchJoined();
  }, [user?.id, view]);

  const filtered = matches.filter((m) => m.status === tab);

  return (
    <main className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border/50">
        <div className="max-w-[680px] mx-auto px-5 h-14 flex items-center gap-3">
          <button onClick={() => nav(-1)} className="p-2 -ml-2 rounded-full hover:bg-secondary" aria-label="Back">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-display font-bold text-xl tracking-tight flex-1">My matches</h1>
        </div>
      </header>

      <div className="max-w-[680px] mx-auto px-5 py-4 space-y-4">
        {/* View toggle */}
        <div className="flex bg-secondary rounded-full p-1">
          {(["organized", "joined"] as View[]).map((v) => {
            const active = view === v;
            const Icon = v === "organized" ? User : Users;
            return (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-bold transition-colors ${
                  active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {v === "organized" ? "Organized" : "Joined"}
              </button>
            );
          })}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1">
          {(Object.keys(TAB_META) as Tab[]).map((t) => {
            const Icon = TAB_META[t].icon;
            const active = tab === t;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
                  active
                    ? "bg-foreground text-background"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {TAB_META[t].label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-card rounded-2xl p-4 border border-border/60 h-24" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <Calendar className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-semibold">
              {view === "joined"
                ? tab === "upcoming"
                  ? "No upcoming matches you've joined. Browse the feed to find one!"
                  : tab === "live"
                  ? "No live matches you're in right now."
                  : tab === "completed"
                  ? "No completed matches you've joined yet."
                  : "No cancelled matches."
                : TAB_META[tab].empty}
            </p>
            {tab === "upcoming" && view === "organized" && (
              <button
                onClick={() => nav("/create")}
                className="mt-4 inline-flex items-center gap-1.5 bg-foreground text-background rounded-full px-4 py-2 text-xs font-bold"
              >
                Create a match
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((m) => {
              const max = m.max_core_players ?? 10;
              const isFull = m.core_paid_count >= max;
              return (
                <button
                  key={m.id}
                  onClick={() => nav(`/lobby/${m.join_code}`)}
                  className="w-full text-left bg-card rounded-2xl px-4 py-4 border border-border/60 transition-all hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.99]"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">{m.join_code}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${statusBadge(m.status)}`}>
                        {m.status}
                      </span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-2">
                    <Clock className="w-3 h-3" />
                    {getFormattedTime(m.match_date)}
                    <span className="mx-1">·</span>
                    <MapPin className="w-3 h-3" />
                    {m.venue?.name ?? "Venue"}
                    {m.venue?.city ? `, ${m.venue.city}` : ""}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-md bg-secondary text-foreground/75 px-1.5 py-0.5 text-[11px] font-semibold">
                      <Users className="w-3 h-3" />
                      {m.match_mode === "gala" ? "Gala" : m.format}
                    </span>
                    {m.entry_fee > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-secondary text-foreground/75 px-1.5 py-0.5 text-[11px] font-semibold">
                        <Trophy className="w-3 h-3" />
                        ₵{m.entry_fee}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 text-emerald-600 px-1.5 py-0.5 text-[11px] font-semibold">
                        Free
                      </span>
                    )}
                    {m.status === "cancelled" ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-red-500/10 text-red-600 px-1.5 py-0.5 text-[11px] font-semibold">
                        <AlertTriangle className="w-3 h-3" />
                        Refunded
                      </span>
                    ) : (
                      <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
                        isFull ? "bg-emerald-500/10 text-emerald-600" : "bg-secondary text-foreground/75"
                      }`}>
                        {m.core_paid_count}/{max} paid
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
