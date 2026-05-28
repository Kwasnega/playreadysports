import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronRight, CalendarDays, Trophy,
  MapPin, Clock, Loader2, Users, Search, Plus, Download,
  X, Pencil, Trash2, Ban, Check, Filter, RefreshCw,
} from "lucide-react";

interface Venue { id: string; name: string; }

interface CalMatch {
  id: string;
  join_code: string;
  title: string;
  match_date: string;
  status: "upcoming" | "live" | "completed" | "cancelled";
  venue_id: string | null;
  venue_name: string | null;
  entry_fee: number;
  core_paid_count: number;
  max_core_players: number;
  match_type: string;
  match_mode: string;
  format: string;
  organizer_id: string;
  duration_minutes: number;
}

const ALL_STATUSES = ["upcoming", "full", "live", "completed", "cancelled"] as const;

const statusColor: Record<string, string> = {
  upcoming: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  full: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  live: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  completed: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
};

const statusLabel: Record<string, string> = {
  upcoming: "Upcoming", full: "Full", live: "Live", completed: "Completed", cancelled: "Cancelled",
};

const statusDot: Record<string, string> = {
  upcoming: "bg-emerald-400", full: "bg-cyan-400", live: "bg-amber-400", completed: "bg-slate-400", cancelled: "bg-red-400",
};

export default function AdminCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [matches, setMatches] = useState<CalMatch[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [venueFilter, setVenueFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set(ALL_STATUSES));
  const [detailMatch, setDetailMatch] = useState<CalMatch | null>(null);
  const [createDate, setCreateDate] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const channelRef = useRef<any>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const todayStr = new Date().toISOString().slice(0, 10);

  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDay = firstOfMonth.getDay();

  const loadVenues = async () => {
    const { data } = await (supabase as any).from("venues").select("id, name").order("name");
    setVenues((data ?? []) as Venue[]);
  };

  const load = async () => {
    setLoading(true);
    try {
      const start = new Date(year, month, 1).toISOString();
      const end = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

      const { data, error } = await (supabase as any)
        .from("matches")
        .select("id, join_code, title, match_date, status, entry_fee, core_paid_count, max_core_players, match_type, match_mode, format, organizer_id, duration_minutes, venue_id, venue:venues(name)")
        .gte("match_date", start)
        .lte("match_date", end)
        .order("match_date", { ascending: true });

      if (error) throw error;

      setMatches(
        (data ?? []).map((row: any) => {
          const v = Array.isArray(row.venue) ? row.venue[0] ?? {} : row.venue ?? {};
          return {
            id: row.id,
            join_code: row.join_code,
            title: row.title,
            match_date: row.match_date,
            status: row.status,
            venue_id: row.venue_id,
            venue_name: v.name ?? null,
            entry_fee: row.entry_fee ?? 0,
            core_paid_count: row.core_paid_count ?? 0,
            max_core_players: row.max_core_players ?? 0,
            match_type: row.match_type ?? "public",
            match_mode: row.match_mode ?? "two_team",
            format: row.format ?? "6v6",
            organizer_id: row.organizer_id,
            duration_minutes: row.duration_minutes ?? 60,
          };
        })
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to load matches");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVenues();
  }, []);

  useEffect(() => {
    load();
    // Realtime subscription
    const ch = (supabase as any)
      .channel("admin-calendar-matches")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () => load())
      .subscribe();
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [year, month]);

  const filteredMatches = useMemo(() => {
    return matches.filter((m) => {
      const inVenue = venueFilter === "all" || m.venue_id === venueFilter;
      const inStatus = statusFilter.has(m.status);
      const inSearch = !search || (m.title || "").toLowerCase().includes(search.toLowerCase()) || (m.join_code || "").toLowerCase().includes(search.toLowerCase());
      return inVenue && inStatus && inSearch;
    });
  }, [matches, venueFilter, statusFilter, search]);

  const byDay = useMemo(() => {
    const map: Record<string, CalMatch[]> = {};
    filteredMatches.forEach((m) => {
      const d = m.match_date.slice(0, 10);
      if (!map[d]) map[d] = [];
      map[d].push(m);
    });
    return map;
  }, [filteredMatches]);

  const dayMatches = selectedDay ? byDay[selectedDay] || [] : [];

  const toggleStatus = (s: string) => {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  };

  const exportCSV = () => {
    const rows = filteredMatches.map((m) => ({
      Date: m.match_date.slice(0, 10),
      Time: new Date(m.match_date).toLocaleTimeString(),
      Title: m.title || m.join_code,
      Status: m.status,
      Venue: m.venue_name || "",
      "Entry Fee": m.entry_fee,
      Paid: m.core_paid_count,
      Max: m.max_core_players,
    }));
    if (rows.length === 0) { toast.info("No matches to export"); return; }
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => `"${(r as any)[h]}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `matches-${year}-${String(month + 1).padStart(2, "0")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  const updateMatch = async (id: string, patch: Partial<CalMatch>) => {
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("matches").update(patch).eq("id", id);
      if (error) throw error;
      toast.success("Match updated");
      load();
      setDetailMatch(null);
    } catch (err: any) {
      toast.error(err.message || "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const cancelSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Cancel ${selectedIds.size} match(es)?`)) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("matches").update({ status: "cancelled" }).in("id", Array.from(selectedIds));
      if (error) throw error;
      toast.success("Matches cancelled");
      setSelectedIds(new Set());
      load();
    } catch (err: any) {
      toast.error(err.message || "Cancel failed");
    } finally {
      setSaving(false);
    }
  };

  const createMatch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!createDate) return;
    const fd = new FormData(e.currentTarget);
    const payload = {
      title: fd.get("title") as string,
      match_date: new Date(`${createDate}T${fd.get("time")}:00`).toISOString(),
      venue_id: fd.get("venue_id") as string || null,
      entry_fee: parseFloat(fd.get("entry_fee") as string) || 0,
      max_core_players: parseInt(fd.get("max_core") as string) || 10,
      max_spare_players: parseInt(fd.get("max_spare") as string) || 2,
      duration_minutes: parseInt(fd.get("duration") as string) || 60,
      match_type: fd.get("match_type") as string,
      match_mode: fd.get("match_mode") as string,
      format: fd.get("format") as string,
      organizer_id: fd.get("organizer_id") as string,
      status: "upcoming",
    };
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("matches").insert(payload);
      if (error) throw error;
      toast.success("Match created");
      setCreateDate(null);
      load();
    } catch (err: any) {
      toast.error(err.message || "Create failed");
    } finally {
      setSaving(false);
    }
  };

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  return (
    <div>
      {/* Header */}
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-display font-bold text-white">Match Calendar</h2>
          <p className="text-slate-400 text-sm mt-1">
            {filteredMatches.length} of {matches.length} match{matches.length !== 1 ? "es" : ""} this month
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search matches..."
              className="h-10 pl-9 pr-4 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20 w-52"
            />
          </div>
          <select
            value={venueFilter}
            onChange={(e) => setVenueFilter(e.target.value)}
            className="h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none focus:border-white/20"
          >
            <option value="all">All Venues</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 h-10 px-3 rounded-xl bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] transition-all text-xs font-medium"
          >
            <Download className="w-4 h-4" /> Export
          </button>
          {selectedIds.size > 0 && (
            <button
              onClick={cancelSelected}
              disabled={saving}
              className="flex items-center gap-2 h-10 px-3 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all text-xs font-medium disabled:opacity-50"
            >
              <Ban className="w-4 h-4" /> Cancel {selectedIds.size}
            </button>
          )}
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="p-2 rounded-xl bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] transition-all">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-bold text-white min-w-[140px] text-center">
              {currentDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </span>
            <button onClick={nextMonth} className="p-2 rounded-xl bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] transition-all">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Status Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Filter className="w-3.5 h-3.5 text-slate-500" />
        {ALL_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => toggleStatus(s)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider border transition-all ${
              statusFilter.has(s)
                ? statusColor[s]
                : "bg-white/[0.03] text-slate-500 border-white/[0.06] hover:border-white/10"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${statusDot[s]} ${statusFilter.has(s) ? "opacity-100" : "opacity-30"}`} />
            {statusLabel[s]}
          </button>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="bg-[#0B1120] border border-white/[0.06] rounded-2xl p-4">
        {loading ? (
          <div className="h-80 flex items-center justify-center gap-2 text-slate-400 text-sm">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-7 gap-1 mb-2">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: startDay }).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-square rounded-xl" />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const dayNum = i + 1;
                const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
                const dayList = byDay[dateStr] || [];
                const isToday = dateStr === todayStr;
                const isSelected = selectedDay === dateStr;
                return (
                  <button
                    key={dayNum}
                    onClick={() => setSelectedDay(dateStr === selectedDay ? null : dateStr)}
                    className={`aspect-square rounded-xl p-1 flex flex-col items-center justify-start gap-0.5 transition-all border relative ${
                      isSelected
                        ? "bg-white/[0.08] border-white/20"
                        : isToday
                        ? "bg-emerald-500/10 border-emerald-500/30"
                        : "bg-white/[0.02] border-transparent hover:border-white/10"
                    }`}
                  >
                    <span className={`text-xs font-bold ${isToday ? "text-emerald-400" : "text-white"}`}>{dayNum}</span>
                    {dayList.length > 0 && (
                      <div className="flex flex-wrap justify-center gap-0.5 mt-0.5">
                        {dayList.slice(0, 4).map((m, idx) => (
                          <span key={idx} className={`w-1.5 h-1.5 rounded-full ${statusDot[m.status]}`} />
                        ))}
                        {dayList.length > 4 && <span className="text-[7px] text-slate-500 leading-none">+</span>}
                      </div>
                    )}
                    {dayList.length === 0 && (
                      <span
                        onClick={(e) => { e.stopPropagation(); setCreateDate(dateStr); }}
                        className="mt-1 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
                      >
                        <Plus className="w-3 h-3 text-slate-500 hover:text-white" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Selected Day Detail */}
      {selectedDay && (
        <div className="mt-6 bg-[#0B1120] border border-white/[0.06] rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-white">
              {new Date(selectedDay + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCreateDate(selectedDay)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all text-[11px] font-bold uppercase tracking-wider"
              >
                <Plus className="w-3.5 h-3.5" /> Add Match
              </button>
              <span className="text-xs text-slate-400">{dayMatches.length} match{dayMatches.length !== 1 ? "es" : ""}</span>
            </div>
          </div>
          <div className="space-y-2">
            {dayMatches.map((m) => (
              <div
                key={m.id}
                className={`flex items-center gap-3 p-3 rounded-xl border ${statusColor[m.status]} cursor-pointer hover:bg-white/[0.03] transition-all`}
                onClick={() => setDetailMatch(m)}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(m.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    const next = new Set(selectedIds);
                    if (e.target.checked) next.add(m.id); else next.delete(m.id);
                    setSelectedIds(next);
                  }}
                  className="w-4 h-4 accent-emerald-500 shrink-0"
                />
                <div className="w-9 h-9 rounded-full bg-white/[0.06] flex items-center justify-center shrink-0">
                  <Trophy className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white truncate">{m.title || m.join_code}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/[0.06]">{statusLabel[m.status]}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-0.5">
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {m.venue_name || "—"}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(m.match_date).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {m.core_paid_count}/{m.max_core_players}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-white">₵{m.entry_fee.toFixed(2)}</p>
                </div>
              </div>
            ))}
            {dayMatches.length === 0 && (
              <div className="text-center py-6">
                <p className="text-slate-500 text-sm mb-2">No matches on this day.</p>
                <button
                  onClick={() => setCreateDate(selectedDay)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all text-xs font-bold uppercase tracking-wider"
                >
                  <Plus className="w-3.5 h-3.5" /> Create Match
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Match Modal */}
      {createDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#0B1120] border border-white/[0.08] rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Create Match</h3>
              <button onClick={() => setCreateDate(null)} className="p-1 rounded-lg hover:bg-white/[0.06] text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={createMatch} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Title</label>
                <input name="title" required className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none focus:border-white/20" placeholder="Match title" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Date</label>
                  <input value={createDate} readOnly className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-slate-400 outline-none" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Time</label>
                  <input name="time" type="time" required defaultValue="18:00" className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none focus:border-white/20" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Venue</label>
                <select name="venue_id" className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none focus:border-white/20">
                  <option value="">Select venue</option>
                  {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Entry Fee (₵)</label>
                  <input name="entry_fee" type="number" min="0" step="0.01" defaultValue="10" className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none focus:border-white/20" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Max Core</label>
                  <input name="max_core" type="number" min="1" defaultValue="10" className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none focus:border-white/20" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Spares</label>
                  <input name="max_spare" type="number" min="0" defaultValue="2" className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none focus:border-white/20" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Type</label>
                  <select name="match_type" defaultValue="public" className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none focus:border-white/20">
                    <option value="public">Public</option>
                    <option value="private">Private</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Mode</label>
                  <select name="match_mode" defaultValue="two_team" className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none focus:border-white/20">
                    <option value="two_team">Two Team</option>
                    <option value="gala">Gala</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Format</label>
                  <select name="format" defaultValue="6v6" className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none focus:border-white/20">
                    {["5v5", "6v6", "7v7", "8v8", "9v9", "10v10", "11v11"].map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Duration (min)</label>
                <input name="duration" type="number" min="15" defaultValue="60" className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none focus:border-white/20" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Organizer ID</label>
                <input name="organizer_id" required className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none focus:border-white/20" placeholder="UUID of organizer profile" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setCreateDate(null)} className="px-4 py-2 rounded-xl bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] text-sm font-medium transition-all">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-xl bg-emerald-500 text-white hover:bg-emerald-400 text-sm font-bold transition-all disabled:opacity-50">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Match"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Match Detail / Edit Modal */}
      {detailMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#0B1120] border border-white/[0.08] rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Match Details</h3>
              <button onClick={() => setDetailMatch(null)} className="p-1 rounded-lg hover:bg-white/[0.06] text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                updateMatch(detailMatch.id, {
                  title: fd.get("title") as string,
                  match_date: new Date(`${(fd.get("date") as string)}T${fd.get("time")}:00`).toISOString(),
                  entry_fee: parseFloat(fd.get("entry_fee") as string) || 0,
                  max_core_players: parseInt(fd.get("max_core") as string) || 10,
                  duration_minutes: parseInt(fd.get("duration") as string) || 60,
                  status: fd.get("status") as any,
                  venue_id: (fd.get("venue_id") as string) || null,
                });
              }}
              className="space-y-3"
            >
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Title</label>
                <input name="title" defaultValue={detailMatch.title || ""} className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none focus:border-white/20" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Date</label>
                  <input name="date" type="date" defaultValue={detailMatch.match_date.slice(0, 10)} className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none focus:border-white/20" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Time</label>
                  <input name="time" type="time" defaultValue={detailMatch.match_date.slice(11, 16)} className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none focus:border-white/20" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Venue</label>
                <select name="venue_id" defaultValue={detailMatch.venue_id || ""} className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none focus:border-white/20">
                  <option value="">No venue</option>
                  {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Entry Fee</label>
                  <input name="entry_fee" type="number" min="0" step="0.01" defaultValue={detailMatch.entry_fee} className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none focus:border-white/20" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Max Core</label>
                  <input name="max_core" type="number" min="1" defaultValue={detailMatch.max_core_players} className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none focus:border-white/20" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Duration</label>
                  <input name="duration" type="number" min="15" defaultValue={detailMatch.duration_minutes} className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none focus:border-white/20" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Status</label>
                <select name="status" defaultValue={detailMatch.status} className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none focus:border-white/20">
                  {ALL_STATUSES.map((s) => <option key={s} value={s}>{statusLabel[s]}</option>)}
                </select>
              </div>
              <div className="bg-white/[0.03] rounded-xl p-3 space-y-1">
                <p className="text-[11px] text-slate-500">Join Code: <span className="text-slate-300 font-mono">{detailMatch.join_code}</span></p>
                <p className="text-[11px] text-slate-500">Format: <span className="text-slate-300">{detailMatch.format}</span></p>
                <p className="text-[11px] text-slate-500">Mode: <span className="text-slate-300">{detailMatch.match_mode}</span></p>
                <p className="text-[11px] text-slate-500">Type: <span className="text-slate-300">{detailMatch.match_type}</span></p>
                <p className="text-[11px] text-slate-500">Organizer: <span className="text-slate-300 font-mono">{detailMatch.organizer_id}</span></p>
              </div>
              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Delete this match permanently?")) {
                      (supabase as any).from("matches").delete().eq("id", detailMatch.id).then(({ error }: any) => {
                        if (error) toast.error(error.message);
                        else { toast.success("Match deleted"); setDetailMatch(null); load(); }
                      });
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 text-xs font-bold transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setDetailMatch(null)} className="px-4 py-2 rounded-xl bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] text-sm font-medium transition-all">Close</button>
                  <button type="submit" disabled={saving} className="px-4 py-2 rounded-xl bg-emerald-500 text-white hover:bg-emerald-400 text-sm font-bold transition-all disabled:opacity-50">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Changes"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
