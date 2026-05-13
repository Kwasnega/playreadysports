import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Radio, Users, Clock, MapPin, Trophy, AlertCircle,
  ChevronRight, Eye, Ban, CheckCircle2,
} from "lucide-react";

interface LiveMatch {
  id: string;
  join_code: string;
  title: string | null;
  match_date: string;
  status: string;
  match_mode: string;
  format: string;
  entry_fee: number;
  max_core_players: number;
  core_paid_count: number;
  escrow_status: string;
  venue: { name: string; city: string } | null;
  organizer: { full_name: string; username: string } | null;
  participants: {
    id: string;
    user_id: string;
    status: string;
    payment_status: string;
    slot_type: string;
    team: string;
    profiles: { full_name: string; username: string } | null;
  }[];
}

export default function AdminLiveMonitor() {
  const [matches, setMatches] = useState<LiveMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("matches")
      .select(`
        id, join_code, title, match_date, status, match_mode, format, entry_fee,
        max_core_players, core_paid_count, escrow_status,
        venue:venues(name, city),
        organizer:profiles(full_name, username),
        participants:match_participants(
          id, user_id, status, payment_status, slot_type, team,
          profiles(full_name, username)
        )
      `)
      .in("status", ["upcoming", "live"])
      .order("match_date", { ascending: true });

    const normalized = (data ?? []).map((m: any) => ({
      ...m,
      venue: Array.isArray(m.venue) ? m.venue[0] ?? null : m.venue ?? null,
      organizer: Array.isArray(m.organizer) ? m.organizer[0] ?? null : m.organizer ?? null,
      participants: (m.participants ?? []).map((p: any) => ({
        ...p,
        profiles: Array.isArray(p.profiles) ? p.profiles[0] ?? null : p.profiles ?? null,
      })),
    })) as LiveMatch[];

    setMatches(normalized);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const cancelMatch = async (matchId: string) => {
    if (!confirm("Cancel this match? All paid players will be refunded.")) return;
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cancel-match`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session?.access_token ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ matchId }),
    });
    const data = await res.json();
    if (data.success) {
      toast.success("Match cancelled & refunds initiated");
      load();
    } else {
      toast.error(data.error || "Cancel failed");
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffHrs = (d.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (diffHrs < 0) return "Started";
    if (diffHrs < 1) return `${Math.round(diffHrs * 60)}m`;
    if (diffHrs < 24) return `${Math.round(diffHrs)}h`;
    return d.toLocaleDateString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
  };

  const paidCount = (m: LiveMatch) =>
    m.participants.filter((p) => p.payment_status === "paid").length;

  const activeCount = (m: LiveMatch) =>
    m.participants.filter((p) => p.status === "active").length;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-white tracking-tight">Live Monitor</h1>
          <p className="text-sm text-slate-400 mt-1">
            {matches.length} active match{matches.length !== 1 ? "es" : ""} right now
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-slate-300 text-xs font-semibold hover:bg-white/[0.08] transition-all"
        >
          <Clock className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="grid gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 animate-pulse">
              <div className="h-5 bg-white/5 rounded w-48 mb-3" />
              <div className="h-3 bg-white/5 rounded w-32" />
            </div>
          ))}
        </div>
      ) : matches.length === 0 ? (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-12 text-center">
          <Trophy className="w-8 h-8 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">No active or upcoming matches right now.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {matches.map((m) => {
            const isExpanded = expandedId === m.id;
            const spots = m.max_core_players ?? 10;
            const filled = paidCount(m);
            const pct = Math.round((filled / spots) * 100);
            const isFull = filled >= spots;
            const isSoon = new Date(m.match_date).getTime() - Date.now() < 1000 * 60 * 60 * 2;

            return (
              <div
                key={m.id}
                className={`bg-white/[0.03] border rounded-2xl overflow-hidden transition-all hover:border-white/[0.12] ${
                  isSoon ? "border-amber-500/20" : "border-white/[0.06]"
                }`}
              >
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-slate-500 bg-white/[0.04] px-2 py-0.5 rounded">{m.join_code}</span>
                        {m.status === "live" && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full">
                            <Radio className="w-3 h-3 animate-pulse" /> LIVE
                          </span>
                        )}
                        {isSoon && m.status === "upcoming" && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">
                            <AlertCircle className="w-3 h-3" /> Starting soon
                          </span>
                        )}
                      </div>
                      <h3 className="text-white font-semibold text-sm truncate">
                        {m.title || `${m.format} at ${m.venue?.name || "Unknown venue"}`}
                      </h3>
                      <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {m.venue?.name || "—"}, {m.venue?.city || "—"}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {formatTime(m.match_date)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          {m.entry_fee > 0 ? `₵${m.entry_fee}` : "Free"}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          Organizer: {m.organizer?.full_name || m.organizer?.username || "—"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className={`text-lg font-bold leading-none ${isFull ? "text-emerald-400" : "text-white"}`}>
                          {filled}/{spots}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5">paid slots</p>
                      </div>
                      <div className="w-12 h-12 relative">
                        <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
                          <path className="text-slate-700" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
                          <path
                            className={isFull ? "text-emerald-400" : isSoon ? "text-amber-400" : "text-blue-400"}
                            strokeDasharray={`${pct}, 100`}
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                          />
                        </svg>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-4">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : m.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] text-slate-300 text-xs font-medium hover:bg-white/[0.08] transition-all"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      {isExpanded ? "Hide roster" : "View roster"}
                      <ChevronRight className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                    </button>
                    {m.status === "upcoming" && (
                      <button
                        onClick={() => cancelMatch(m.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 text-xs font-medium hover:bg-rose-500/20 transition-all"
                      >
                        <Ban className="w-3.5 h-3.5" /> Cancel match
                      </button>
                    )}
                    <span className="ml-auto text-[11px] text-slate-500">
                      Escrow: {m.escrow_status || "none"}
                    </span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-white/[0.06] px-5 py-4">
                    <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Roster</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {m.participants.map((p) => (
                        <div
                          key={p.id}
                          className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs ${
                            p.status === "active"
                              ? "bg-white/[0.04]"
                              : "bg-white/[0.02] opacity-50"
                          }`}
                        >
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center text-[9px] font-bold text-slate-300">
                            {(p.profiles?.full_name || "?").slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-slate-200 font-medium truncate">
                              {p.profiles?.full_name || p.profiles?.username || "Unknown"}
                            </p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {p.payment_status === "paid" ? (
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <AlertCircle className="w-3 h-3 text-amber-400" />
                              )}
                              <span className={`${p.payment_status === "paid" ? "text-emerald-400" : "text-amber-400"}`}>
                                {p.payment_status}
                              </span>
                              <span className="text-slate-600">·</span>
                              <span className="text-slate-500">{p.slot_type}</span>
                              {p.team !== "unassigned" && (
                                <>
                                  <span className="text-slate-600">·</span>
                                  <span className="text-slate-500">{p.team}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      {m.participants.length === 0 && (
                        <p className="text-slate-500 text-xs col-span-full">No participants yet.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
