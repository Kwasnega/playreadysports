import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Radio, Users, Clock, MapPin, Trophy, AlertCircle, Zap,
  ChevronRight, Eye, Ban, CheckCircle2, Send, PauseCircle, PlayCircle,
  LayoutList, Map as MapIcon, Bell, AlertTriangle, ShieldAlert,
  TrendingUp, Wallet, Activity, RefreshCw, X, MessageSquare,
  Check, Info, RotateCcw, Megaphone, Lock, Unlock
} from "lucide-react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { AdminCheckinLog } from "@/components/admin/AdminCheckinLog";

interface Venue {
  name: string;
  city: string;
  lat: number | null;
  lng: number | null;
}

interface Participant {
  id: string;
  user_id: string;
  status: string;
  payment_status: string;
  slot_type: string;
  team: string;
  joined_at: string;
  attendance_scanned?: boolean;
  profiles: { full_name: string; username: string } | null;
}

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
  payments_frozen: boolean;
  duration_minutes: number;
  venue: Venue | null;
  organizer: { full_name: string; username: string; id: string } | null;
  participants: Participant[];
}

interface DashboardStats {
  live_matches: number;
  players_on_pitch: number;
  total_escrow: number;
  active_users: number;
}

interface CriticalAlert {
  id: string;
  severity: "critical" | "warning" | "info";
  category: string;
  title: string;
  message: string;
  match_id?: string;
}

interface InterventionLog {
  id: string;
  match_id: string;
  rule_name: string;
  trigger_reason: string;
  action_taken: string;
  status: string;
  created_at: string;
}

type ViewMode = "list" | "map";

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMins = Math.round((d.getTime() - now.getTime()) / (1000 * 60));
  if (diffMins < 0) return `${Math.abs(diffMins)}m ago`;
  if (diffMins < 60) return `${diffMins}m`;
  if (diffMins < 1440) return `${Math.round(diffMins / 60)}h`;
  return d.toLocaleDateString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
}

function usePulse<T>(value: T, deps: React.DependencyList) {
  const [pulse, setPulse] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    const changed = JSON.stringify(prev.current) !== JSON.stringify(value);
    if (changed) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 1500);
      prev.current = value;
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return pulse;
}

/* ─── Live Map View ─── */
function LiveMapView({ matches, onSelectMatch }: { matches: LiveMatch[]; onSelectMatch: (m: LiveMatch) => void }) {
  const matchesWithCoords = useMemo(() => {
    return matches.filter((m) => m.venue?.lat != null && m.venue?.lng != null);
  }, [matches]);

  const { viewBox, dots } = useMemo(() => {
    const coords = matchesWithCoords.map((m) => ({ lat: m.venue!.lat!, lng: m.venue!.lng! }));
    if (coords.length === 0) return { viewBox: "0 0 100 60", dots: [] as any[] };

    const lats = coords.map((c) => c.lat);
    const lngs = coords.map((c) => c.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const pad = 8;
    const rangeLat = Math.max(maxLat - minLat, 0.001);
    const rangeLng = Math.max(maxLng - minLng, 0.001);

    const norm = (lat: number, lng: number) => ({
      x: pad + ((lng - minLng) / rangeLng) * (100 - pad * 2),
      y: pad + (1 - (lat - minLat) / rangeLat) * (60 - pad * 2),
    });

    const mappedDots = matchesWithCoords.map((m) => {
      const pos = norm(m.venue!.lat!, m.venue!.lng!);
      const color =
        m.status === "live" ? "#f43f5e" :
        m.status === "upcoming" ? "#22d3ee" :
        "#94a3b8";
      return { ...pos, color, match: m };
    });

    return { viewBox: "0 0 100 60", dots: mappedDots };
  }, [matchesWithCoords]);

  const [selected, setSelected] = useState<LiveMatch | null>(null);

  if (matchesWithCoords.length === 0) {
    return (
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-12 text-center">
        <MapIcon className="w-8 h-8 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-400 text-sm">No matches have venue coordinates for mapping.</p>
      </div>
    );
  }

  return (
    <div className="relative bg-[#070B14] border border-white/[0.06] rounded-xl overflow-hidden" style={{ aspectRatio: "16/9" }}>
      <svg viewBox={viewBox} className="w-full h-full" preserveAspectRatio="xMidYMid slice">
        {/* Grid */}
        {Array.from({ length: 11 }).map((_, i) => (
          <g key={i}>
            <line x1={i * 10} y1={0} x2={i * 10} y2={60} stroke="rgba(255,255,255,0.03)" strokeWidth="0.2" />
            <line x1={0} y1={i * 6} x2={100} y2={i * 6} stroke="rgba(255,255,255,0.03)" strokeWidth="0.2" />
          </g>
        ))}
        {/* Dots */}
        {dots.map((d, i) => (
          <g key={i} className="cursor-pointer" onClick={() => { setSelected(d.match); onSelectMatch(d.match); }}>
            <circle cx={d.x} cy={d.y} r="3" fill={d.color} opacity="0.15">
              <animate attributeName="r" values="3;6;3" dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.15;0.05;0.15" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle cx={d.x} cy={d.y} r="1.8" fill={d.color} opacity="0.9" />
          </g>
        ))}
      </svg>

      {/* Overlay stats */}
      <div className="absolute top-3 left-3 flex gap-2">
        <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-rose-500/10 text-rose-400 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" /> Live
        </span>
        <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" /> Upcoming
        </span>
      </div>

      {/* Selected match card */}
      {selected && (
        <div className="absolute bottom-3 left-3 right-3 md:right-auto md:w-80 bg-[#0F172A]/95 backdrop-blur border border-white/[0.08] rounded-xl p-4 shadow-2xl">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-mono text-slate-500 bg-white/[0.04] px-1.5 py-0.5 rounded inline-block">{selected.join_code}</p>
              <h4 className="text-sm font-semibold text-white mt-1">{selected.title || `${selected.format} match`}</h4>
              <p className="text-xs text-slate-400 mt-0.5">{selected.venue?.name || "—"}, {selected.venue?.city || "—"}</p>
            </div>
            <button onClick={() => setSelected(null)} className="p-1 rounded hover:bg-white/[0.06]">
              <X className="w-3 h-3 text-slate-500" />
            </button>
          </div>
          <div className="flex gap-3 mt-3 text-xs text-slate-400">
            <span>{formatTime(selected.match_date)}</span>
            <span>{selected.entry_fee > 0 ? `₵${selected.entry_fee}` : "Free"}</span>
            <span>{selected.participants.filter((p) => p.status === "active").length}/{selected.max_core_players} players</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Main Component ─── */
export default function AdminLiveMonitor() {
  const confirm = useConfirm();
  const [matches, setMatches] = useState<LiveMatch[]>([]);
  const [stats, setStats] = useState<DashboardStats>({ live_matches: 0, players_on_pitch: 0, total_escrow: 0, active_users: 0 });
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [broadcastModal, setBroadcastModal] = useState<{ open: boolean; matchId: string; joinCode: string }>({ open: false, matchId: "", joinCode: "" });
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [interventions, setInterventions] = useState<InterventionLog[]>([]);
  const [alerts, setAlerts] = useState<CriticalAlert[]>([]);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [checkins, setCheckins] = useState<{ id: string; scanned_at: string; user_id: string }[]>([]);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());
  const [runningCleanup, setRunningCleanup] = useState(false);

  useEffect(() => {
    if (!expandedId) {
      setCheckins([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("match_checkin_events")
        .select("id, scanned_at, user_id")
        .eq("match_id", expandedId)
        .order("scanned_at", { ascending: false })
        .limit(40);
      if (!cancelled) setCheckins(data ?? []);
    })();
    return () => { cancelled = true; };
  }, [expandedId, matches]);

  const statsPulse = usePulse(stats, [stats.live_matches, stats.players_on_pitch, stats.total_escrow, stats.active_users]);

  /* ─── Data loading ─── */
  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const { data: matchesRaw } = await supabase
        .from("matches")
        .select(`
          id, join_code, title, match_date, status, match_mode, format, entry_fee,
          max_core_players, core_paid_count, escrow_status, duration_minutes,
          venue:venues(name, city, lat, lng),
          participants:match_participants(
            id, user_id, status, payment_status, slot_type, team, joined_at, attendance_scanned,
            profiles(full_name, username)
          )
        `)
        .in("status", ["upcoming", "live", "full"] as any)
        .order("match_date", { ascending: true });

      const normalized = (matchesRaw ?? []).map((m: any) => ({
        ...m,
        payments_frozen: false,
        venue: Array.isArray(m.venue) ? m.venue[0] ?? null : m.venue ?? null,
        organizer: null,
        participants: (m.participants ?? []).map((p: any) => ({
          ...p,
          profiles: Array.isArray(p.profiles) ? p.profiles[0] ?? null : p.profiles ?? null,
        })),
      })) as LiveMatch[];

      setMatches(normalized);

      // Compute stats client-side from matches
      const liveMatches = normalized.filter((m) => m.status === "live");
      const playersOnPitch = liveMatches.reduce((sum, m) => sum + m.participants.filter((p: any) => p.status === "active").length, 0);
      
      // Escrow: sum of entry fees for confirmed paid core spots
      const totalEscrow = normalized
        .filter((m: any) => (Number(m.entry_fee ?? 0) > 0))
        .reduce((sum, m: any) => {
          const paidCoreCount = Number(m.core_paid_count ?? 0);
          return sum + (Number(m.entry_fee ?? 0) * paidCoreCount);
        }, 0);
      
      setStats({ live_matches: liveMatches.length, players_on_pitch: playersOnPitch, total_escrow: totalEscrow, active_users: 0 });
      setInterventions([]);
      setLastRefresh(new Date());

      // Compute critical alerts client-side
      const computedAlerts: CriticalAlert[] = [];
      const now = Date.now();

      normalized.forEach((m) => {
        const matchTime = new Date(m.match_date).getTime();
        const isLive = m.status === "live";
        const isUpcoming = m.status === "upcoming";
        const activeParts = m.participants.filter((p) => p.status === "active");
        const paidParts = activeParts.filter((p) => p.payment_status === "paid");
        const unpaidParts = activeParts.filter((p) => p.payment_status !== "paid");

        // Stuck match > 3h
        if (isLive && now - matchTime > 3 * 60 * 60 * 1000) {
          computedAlerts.push({
            id: `stuck-${m.id}`,
            severity: "critical",
            category: "stuck_match",
            title: "Stuck Match",
            message: `Match ${m.join_code} has been live for over 3 hours.`,
            match_id: m.id,
          });
        }

        // Organizer MIA at kickoff
        if (isUpcoming && matchTime < now && matchTime > now - 15 * 60 * 1000) {
          computedAlerts.push({
            id: `mia-${m.id}`,
            severity: "critical",
            category: "organizer_mia",
            title: "Organizer MIA",
            message: `Match ${m.join_code} should have started but is still upcoming.`,
            match_id: m.id,
          });
        }

        // Mass payment failure (< 50% paid, starts in < 30min)
        if (isUpcoming && m.entry_fee > 0 && activeParts.length > 0) {
          const pctPaid = paidParts.length / activeParts.length;
          const minsToStart = (matchTime - now) / (60 * 1000);
          if (minsToStart < 30 && minsToStart > 0 && pctPaid < 0.5) {
            computedAlerts.push({
              id: `pay-${m.id}`,
              severity: "warning",
              category: "mass_payment_failure",
              title: "Mass Payment Failure",
              message: `Match ${m.join_code} has only ${Math.round(pctPaid * 100)}% paid with ${Math.round(minsToStart)}m to kickoff.`,
              match_id: m.id,
            });
          }
        }

        void unpaidParts;
      });

      // High report rate in last hour
      const { data: recentReports } = await supabase
        .from("reports")
        .select("match_id")
        .gte("created_at", new Date(now - 60 * 60 * 1000).toISOString())
        .not("match_id", "is", null);

      const reportCounts: Record<string, number> = {};
      (recentReports ?? []).forEach((r: any) => {
        if (r.match_id) reportCounts[r.match_id] = (reportCounts[r.match_id] || 0) + 1;
      });

      Object.entries(reportCounts).forEach(([matchId, count]) => {
        if (count >= 2) {
          const match = normalized.find((m) => m.id === matchId);
          computedAlerts.push({
            id: `report-${matchId}`,
            severity: "critical",
            category: "high_report_rate",
            title: "High Report Rate",
            message: `Match ${match?.join_code || matchId.slice(0, 6)} has ${count} reports in the last hour.`,
            match_id: matchId,
          });
        }
      });

      setAlerts(computedAlerts);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load monitor data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 10s (silent — no skeleton flicker)
  useEffect(() => {
    const timer = setInterval(() => { load({ silent: true }); }, 10000);
    return () => clearInterval(timer);
  }, [load]);

  /* ─── Actions ─── */
  const cancelMatch = async (matchId: string) => {
    const ok = await confirm({
      description: "Cancel this match? All paid players will be refunded.",
      variant: "destructive",
      confirmText: "Cancel Match",
    });
    if (!ok) return;
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
    if (data.success) { toast.success("Match cancelled · player wallets credited"); load(); }
    else { toast.error(data.error || "Cancel failed"); }
  };

  const markComplete = async (matchId: string) => {
    const ok = await confirm({
      description: "Release escrow? Organizer gets Play wallet incentive; venue owner gets their cut.",
      confirmText: "Mark Complete",
    });
    if (!ok) return;
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/complete-match`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session?.access_token ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ matchId }),
    });
    const data = await res.json();
    if (data.success) {
      toast.success(
        `Released · organizer ₵${data.organizerIncentive ?? 0} · venue ₵${data.venueCut ?? 0} · platform ₵${data.platformFee ?? 0}`,
      );
      load();
    } else {
      toast.error(data.error || "Complete failed");
    }
  };

  const sendBroadcast = async () => {
    if (!broadcastMsg.trim()) return;
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/broadcast-match`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session?.access_token ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        matchId: broadcastModal.matchId,
        title: "Admin Broadcast",
        message: broadcastMsg,
        type: "admin_broadcast",
      }),
    });
    const data = await res.json();
    if (data.success) {
      toast.success(`Broadcast sent to ${data.sent} players`);
      setBroadcastModal({ open: false, matchId: "", joinCode: "" });
      setBroadcastMsg("");
    } else {
      toast.error(data.error || "Broadcast failed");
    }
  };

  const toggleFreezePayments = async (m: LiveMatch) => {
    const newVal = !m.payments_frozen;
    const { data, error } = await supabase
      .from("matches")
      .update({ payments_frozen: newVal } as any)
      .eq("id", m.id)
      .select()
      .single();

    if (error || !data) {
      toast.error(error?.message || "Failed to update freeze status");
      return;
    }

    toast.success(newVal ? "Payments frozen for this match" : "Payments unfrozen");
    load();
  };

  const runAutoCleanup = async () => {
    setRunningCleanup(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auto-cancel-matches`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}`, "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Cleanup: ${data.cancelled ?? 0} match${data.cancelled !== 1 ? "es" : ""} cancelled (${data.checked ?? 0} checked)`);
        load();
      } else {
        toast.error(data.error || "Cleanup failed");
      }
    } catch (err: any) {
      toast.error(err.message || "Cleanup failed");
    } finally {
      setRunningCleanup(false);
    }
  };

  const runAutoIntervention = async () => {
    const now = Date.now();
    const triggered: { matchId: string; users: string[] }[] = [];

    for (const m of matches) {
      if (m.status !== "upcoming" || m.entry_fee <= 0) continue;
      const matchTime = new Date(m.match_date).getTime();
      const minsToStart = (matchTime - now) / (60 * 1000);
      if (minsToStart >= 25 && minsToStart <= 35) {
        const activeParts = m.participants.filter((p) => p.status === "active");
        const paidCount = activeParts.filter((p) => p.payment_status === "paid").length;
        const pctPaid = activeParts.length > 0 ? paidCount / activeParts.length : 1;
        if (pctPaid < 0.5) {
          const unpaidUsers = activeParts.filter((p) => p.payment_status !== "paid").map((p) => p.user_id);
          if (unpaidUsers.length > 0) triggered.push({ matchId: m.id, users: unpaidUsers });
        }
      }
    }

    if (triggered.length === 0) {
      toast.info("No matches need intervention right now.");
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    for (const t of triggered) {
      const match = matches.find((m) => m.id === t.matchId);
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/broadcast-match`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.access_token ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          matchId: t.matchId,
          title: "Payment Reminder",
          message: `Your match ${match?.join_code} starts in ~30 minutes. Please complete your payment to secure your slot.`,
          type: "payment_reminder",
        }),
      });

      await supabase.from("auto_intervention_logs").insert({
        match_id: t.matchId,
        rule_name: "unpaid_reminder_30min",
        trigger_reason: `<50% paid, kickoff in ~30min`,
        action_taken: `Sent payment reminder to ${t.users.length} unpaid player(s)`,
        status: "executed",
      });
    }

    toast.success(`Auto-intervention ran: ${triggered.length} match(es) notified`);
    load();
  };

  const paidCount = (m: LiveMatch) => m.participants.filter((p) => p.payment_status === "paid").length;
  const activeCount = (m: LiveMatch) => m.participants.filter((p) => p.status === "active").length;

  const visibleAlerts = alerts.filter((a) => !dismissedAlerts.has(a.id));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-white tracking-tight">Live Monitor</h1>
          <p className="text-sm text-slate-400 mt-1">
            {matches.length} active match{matches.length !== 1 ? "es" : ""} · Refreshed {lastRefresh.toLocaleTimeString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode(viewMode === "list" ? "map" : "list")}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-slate-300 text-xs font-semibold hover:bg-white/[0.08] transition-all"
          >
            {viewMode === "list" ? <><MapIcon className="w-3.5 h-3.5" /> Map View</> : <><LayoutList className="w-3.5 h-3.5" /> List View</>}
          </button>
          <button
            onClick={load}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-slate-300 text-xs font-semibold hover:bg-white/[0.08] transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      {/* Live Status Ticker */}
      <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 transition-all ${statsPulse ? "scale-[1.01]" : ""}`}>
        {[
          { label: "Live Matches", value: stats.live_matches, icon: Radio, color: "text-rose-400", bg: "bg-rose-500/10", pulse: stats.live_matches > 0 },
          { label: "Players On Pitch", value: stats.players_on_pitch, icon: Users, color: "text-emerald-400", bg: "bg-emerald-500/10" },
          { label: "Escrow Held", value: `₵${Number(stats.total_escrow ?? 0).toFixed(2)}`, icon: Wallet, color: "text-cyan-400", bg: "bg-cyan-500/10" },
          { label: "Active Users", value: stats.active_users, icon: Activity, color: "text-amber-400", bg: "bg-amber-500/10" },
        ].map((s) => (
          <div key={s.label} className={`bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-xl p-4 hover:border-white/[0.12] transition-all ${statsPulse ? "ring-1 ring-cyan-400/20" : ""}`}>
            <div className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center mb-2 relative`}>
              <s.icon className={`w-4 h-4 ${s.color}`} />
              {s.pulse && <span className="absolute inset-0 rounded-lg animate-ping opacity-20 bg-rose-400" />}
            </div>
            <p className="text-2xl font-bold text-white">{s.value}</p>
            <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wider mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Critical Alerts Panel */}
      {visibleAlerts.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            <h3 className="text-sm font-semibold text-rose-400">Critical Alerts ({visibleAlerts.length})</h3>
          </div>
          {visibleAlerts.map((alert) => (
            <div key={alert.id} className={`flex items-start gap-3 p-3 rounded-xl border ${alert.severity === "critical" ? "bg-rose-500/5 border-rose-500/15" : "bg-amber-500/5 border-amber-500/15"}`}>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${alert.severity === "critical" ? "bg-rose-500/10" : "bg-amber-500/10"}`}>
                {alert.severity === "critical" ? <AlertTriangle className="w-3.5 h-3.5 text-rose-400" /> : <AlertCircle className="w-3.5 h-3.5 text-amber-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${alert.severity === "critical" ? "text-rose-300" : "text-amber-300"}`}>{alert.title}</p>
                <p className="text-xs text-slate-400 mt-0.5">{alert.message}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {alert.match_id && (
                  <button
                    onClick={() => { const m = matches.find((x) => x.id === alert.match_id); if (m) setExpandedId(m.id); }}
                    className="p-1.5 rounded-lg hover:bg-white/[0.06] text-slate-400 hover:text-white transition-colors"
                    title="View match"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => setDismissedAlerts((prev) => new Set([...prev, alert.id]))}
                  className="p-1.5 rounded-lg hover:bg-white/[0.06] text-slate-400 hover:text-white transition-colors"
                  title="Dismiss"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Auto-intervention bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 flex items-center justify-between bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <Zap className="w-4 h-4 text-cyan-400 shrink-0" />
            <span className="text-sm text-slate-300 shrink-0">Auto-intervention rules active</span>
            <span className="text-[10px] text-slate-500 bg-white/[0.04] px-2 py-0.5 rounded-full hidden md:block">
              If match starts in 30min and &lt; 50% paid → auto-remind unpaid players
            </span>
          </div>
          <button
            onClick={runAutoIntervention}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600/10 text-cyan-400 text-xs font-semibold hover:bg-cyan-600/20 transition-all shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Run Now
          </button>
        </div>
        <button
          onClick={runAutoCleanup}
          disabled={runningCleanup}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold hover:bg-rose-500/20 transition-all disabled:opacity-50 shrink-0"
        >
          <Ban className="w-3.5 h-3.5" />
          {runningCleanup ? "Running…" : "Run Cleanup"}
        </button>
      </div>

      {/* Map View */}
      {viewMode === "map" && (
        <div className="space-y-4">
          <LiveMapView matches={matches} onSelectMatch={(m) => setExpandedId(m.id)} />
        </div>
      )}

      {/* Match List */}
      {viewMode === "list" && (
        <div className="space-y-4">
          {loading ? (
            <div className="grid gap-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 animate-pulse">
                  <div className="h-5 bg-white/5 rounded w-48 mb-3" />
                  <div className="h-3 bg-white/5 rounded w-32" />
                </div>
              ))}
            </div>
          ) : matches.length === 0 ? (
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-12 text-center">
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
                const matchTime = new Date(m.match_date).getTime();
                const live = m.status === "live";
                const isExpired = !live && matchTime < Date.now();
                const isSoon = !live && !isExpired && matchTime - Date.now() < 1000 * 60 * 60 * 2;

                return (
                  <div
                    key={m.id}
                    className={`bg-white/[0.03] border rounded-xl overflow-hidden transition-all hover:border-white/[0.12] ${
                      isExpired ? "border-rose-500/20 opacity-70" : isSoon ? "border-amber-500/20" : "border-white/[0.06]"
                    } ${live ? "ring-1 ring-rose-500/10" : ""}`}
                  >
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-mono text-slate-500 bg-white/[0.04] px-2 py-0.5 rounded">{m.join_code}</span>
                            {live && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full">
                                <Radio className="w-3 h-3 animate-pulse" /> LIVE
                              </span>
                            )}
                            {isExpired && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full">
                                <AlertTriangle className="w-3 h-3" /> Expired
                              </span>
                            )}
                            {isSoon && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">
                                <AlertCircle className="w-3 h-3" /> Starting soon
                              </span>
                            )}
                            {m.status === "full" && !isExpired && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full">
                                <Users className="w-3 h-3" /> FULL
                              </span>
                            )}
                            {m.payments_frozen && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-300 bg-slate-500/10 px-2 py-0.5 rounded-full">
                                <Lock className="w-3 h-3" /> Payments frozen
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
                            <span className="inline-flex items-center gap-1">
                              Escrow: {m.escrow_status || "none"}
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

                      {/* One-click actions */}
                      <div className="flex flex-wrap items-center gap-2 mt-4">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : m.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] text-slate-300 text-xs font-medium hover:bg-white/[0.08] transition-all"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          {isExpanded ? "Hide roster" : "View roster"}
                          <ChevronRight className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                        </button>

                        {(m.status === "upcoming" || m.status === "full" || isExpired) && (
                          <button
                            onClick={() => cancelMatch(m.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 text-xs font-medium hover:bg-rose-500/20 transition-all"
                          >
                            <Ban className="w-3.5 h-3.5" /> Cancel
                          </button>
                        )}

                        <button
                          onClick={() => setBroadcastModal({ open: true, matchId: m.id, joinCode: m.join_code })}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 text-xs font-medium hover:bg-cyan-500/20 transition-all"
                        >
                          <Megaphone className="w-3.5 h-3.5" /> Broadcast
                        </button>

                        {live && (
                          <button
                            onClick={() => markComplete(m.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-medium hover:bg-emerald-500/20 transition-all"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Mark Complete
                          </button>
                        )}

                        <button
                          onClick={() => toggleFreezePayments(m)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] text-slate-300 text-xs font-medium hover:bg-white/[0.08] transition-all"
                        >
                          {m.payments_frozen ? <><Unlock className="w-3.5 h-3.5" /> Unfreeze</> : <><Lock className="w-3.5 h-3.5" /> Freeze</>}
                        </button>

                        <span className="ml-auto text-[11px] text-slate-500">
                          {activeCount(m)} active · {m.participants.filter((p) => p.payment_status === "unpaid").length} unpaid
                        </span>
                      </div>
                    </div>

                    {/* Expanded roster */}
                    {isExpanded && (
                      <div className="border-t border-white/[0.06] px-5 py-4 space-y-5">
                        <div>
                          <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Venue check-ins</h4>
                          {checkins.length === 0 ? (
                            <p className="text-slate-500 text-xs">No QR check-ins logged for this match yet.</p>
                          ) : (
                            <ul className="space-y-1.5 max-h-40 overflow-y-auto">
                              {checkins.map((c) => {
                                const nm = m.participants.find((p) => p.user_id === c.user_id)?.profiles?.full_name
                                  || m.participants.find((p) => p.user_id === c.user_id)?.profiles?.username
                                  || c.user_id.slice(0, 8);
                                return (
                                  <li key={c.id} className="flex justify-between gap-2 text-xs text-slate-300 bg-white/[0.03] rounded-lg px-2 py-1.5">
                                    <span className="truncate">{nm}</span>
                                    <span className="text-slate-500 shrink-0">{new Date(c.scanned_at).toLocaleTimeString()}</span>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>

                        <div>
                        <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Roster</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {m.participants.map((p) => (
                            <div
                              key={p.id}
                              className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs ${
                                p.status === "active" ? "bg-white/[0.04]" : "bg-white/[0.02] opacity-50"
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
                                  {p.attendance_scanned && (
                                    <>
                                      <span className="text-slate-600">·</span>
                                      <span className="text-[10px] text-cyan-400 font-semibold">QR in</span>
                                    </>
                                  )}
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
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Intervention logs */}
      {interventions.length > 0 && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-slate-400" /> Recent Auto-Interventions
          </h3>
          <div className="space-y-2">
            {interventions.map((log) => (
              <div key={log.id} className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${log.status === "executed" ? "bg-emerald-400" : "bg-amber-400"}`} />
                  <span className="text-slate-300">{log.rule_name}</span>
                  <span className="text-slate-500">— {log.action_taken}</span>
                </div>
                <span className="text-slate-600">{new Date(log.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Broadcast Modal */}
      {broadcastModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setBroadcastModal({ open: false, matchId: "", joinCode: "" })}>
          <div className="bg-[#0F172A] border border-white/10 rounded-xl p-6 w-full max-w-md space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div>
              <h2 className="text-lg font-bold text-white">Broadcast to Players</h2>
              <p className="text-sm text-slate-400 mt-1">Match {broadcastModal.joinCode}</p>
            </div>
            <textarea
              value={broadcastMsg}
              onChange={(e) => setBroadcastMsg(e.target.value)}
              placeholder="Type your broadcast message…"
              className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] p-3.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20 resize-none h-28 transition-all"
            />
            <div className="flex gap-3">
              <button onClick={() => setBroadcastModal({ open: false, matchId: "", joinCode: "" })} className="flex-1 py-2.5 rounded-xl bg-white/[0.04] text-slate-300 text-sm font-semibold hover:bg-white/[0.08] transition-all">Cancel</button>
              <button onClick={sendBroadcast} disabled={!broadcastMsg.trim()} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-sm font-semibold hover:from-cyan-500 hover:to-blue-500 transition-all shadow-lg shadow-cyan-500/20 disabled:opacity-40">Send Broadcast</button>
            </div>
          </div>
        </div>
      )}

      {/* QR Check-in Log */}
      <AdminCheckinLog />
    </div>
  );
}
