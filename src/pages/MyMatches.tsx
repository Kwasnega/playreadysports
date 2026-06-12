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
      return "border-foreground text-background bg-foreground";
    case "full":
      return "border-foreground text-foreground bg-transparent";
    case "live":
      return "border-foreground text-background bg-foreground animate-pulse";
    case "completed":
      return "border-border text-foreground bg-secondary/50";
    case "cancelled":
      return "border-foreground text-foreground bg-background opacity-50";
    default:
      return "border-border text-muted-foreground bg-secondary/50";
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

  const filtered = matches.filter((m) => {
    const effectiveStatus = m.status === "full" ? "upcoming" : m.status;
    return effectiveStatus === tab;
  });

  return (
    <main className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b-2 border-border">
        <div className="max-w-[680px] mx-auto px-5 h-16 flex items-center gap-3">
          <button onClick={() => nav(-1)} className="w-10 h-10 -ml-2 rounded-full border-2 border-transparent hover:border-border flex items-center justify-center transition-colors" aria-label="Back">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-display font-black text-xl tracking-tight uppercase flex-1">My Matches</h1>
        </div>
      </header>

      <div className="max-w-[680px] mx-auto px-5 py-4 space-y-4">
        {/* View toggle */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none -mx-1 px-1">
          {(["organized", "joined"] as View[]).map((v) => {
            const active = view === v;
            const Icon = v === "organized" ? User : Users;
            return (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                  active ? "bg-foreground border-foreground text-background" : "bg-card border-border text-foreground hover:border-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {v === "organized" ? "Organized" : "Joined"}
              </button>
            );
          })}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1 pb-2 border-b-2 border-border border-dashed">
          {(Object.keys(TAB_META) as Tab[]).map((t) => {
            const Icon = TAB_META[t].icon;
            const active = tab === t;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-widest border-2 transition-colors ${
                  active
                    ? "bg-foreground border-foreground text-background"
                    : "bg-background border-border text-muted-foreground hover:border-foreground hover:text-foreground"
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
              <div key={i} className="bg-card rounded-2xl p-4 border-2 border-border h-[100px]" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-14 px-5 border-2 border-dashed border-border rounded-3xl bg-secondary/30 mt-4">
            <Calendar className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
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
                className="mt-5 inline-flex items-center justify-center gap-2 h-10 px-6 rounded-full bg-foreground text-background text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-opacity"
              >
                CREATE MATCH
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
                  className="w-full group flex text-left bg-card rounded-2xl border-2 border-border overflow-hidden transition-all duration-200 hover:border-foreground/40 active:scale-[0.99] relative"
                >
                  {/* Sub-stub cutouts for realism */}
                  <div className="absolute left-[84px] top-[-7px] w-3.5 h-3.5 rounded-full bg-background border-2 border-border z-10" />
                  <div className="absolute left-[84px] bottom-[-7px] w-3.5 h-3.5 rounded-full bg-background border-2 border-border z-10" />

                  {/* Date Block */}
                  <div className="w-[90px] shrink-0 border-r-2 border-border border-dashed bg-secondary/40 flex flex-col items-center justify-center p-2 group-hover:bg-secondary/60 transition-colors">
                    <span className="text-[10px] font-black uppercase tracking-widest mb-1 text-muted-foreground">
                      {new Date(m.match_date).toLocaleDateString('en-US', { weekday: 'short' })}
                    </span>
                    <span className="text-xl font-display font-black tracking-tighter leading-none text-foreground">
                      {new Date(m.match_date).getDate()}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-0.5">
                      {new Date(m.match_date).toLocaleDateString('en-US', { month: 'short' })}
                    </span>
                  </div>

                  <div className="flex-1 p-3.5 flex flex-col justify-center min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-sm font-bold text-foreground leading-tight truncate">
                        {m.venue?.name ?? "Venue"}
                      </p>
                      <span className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-sm border-[1.5px] text-[8px] font-black uppercase tracking-widest ${statusBadge(m.status)}`}>
                        {m.status === "full" ? "FULL" : m.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground truncate mb-3">
                      <Clock className="w-3 h-3 text-foreground" />
                      {getFormattedTime(m.match_date).split('·')[1]?.trim() ?? getFormattedTime(m.match_date)}
                      <span className="mx-0.5">•</span>
                      <MapPin className="w-3 h-3 text-foreground" />
                      {m.venue?.city ? m.venue.city : "Location"}
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="inline-flex items-center gap-1 rounded-sm border-2 border-border bg-secondary/50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                        <Users className="w-2.5 h-2.5" />
                        {m.match_mode === "gala" ? "Gala" : m.format}
                      </span>
                      {m.entry_fee > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-sm border-2 border-border bg-secondary/50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                          <Trophy className="w-2.5 h-2.5" />
                          ₵{m.entry_fee}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-sm border-2 border-foreground bg-foreground text-background px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest">
                          Free
                        </span>
                      )}
                      {m.status === "cancelled" ? (
                        <span className="inline-flex items-center gap-1 rounded-sm border-[1.5px] border-foreground text-foreground px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest bg-background opacity-50">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          Refunded
                        </span>
                      ) : (
                        <span className={`inline-flex items-center gap-1 rounded-sm border-[1.5px] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest ${
                          isFull ? "border-foreground text-background bg-foreground" : "border-border text-muted-foreground bg-secondary/50"
                        }`}>
                          {m.core_paid_count}/{max} PAID
                        </span>
                      )}
                    </div>
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
