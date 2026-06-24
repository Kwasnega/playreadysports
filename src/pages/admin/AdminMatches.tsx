import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trophy, ExternalLink, X, Unlock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useConfirm } from "@/components/ui/ConfirmProvider";

interface MatchRow {
  id: string;
  join_code: string;
  venue: { name: string; city: string } | null;
  organizer: { full_name: string | null; username: string | null } | null;
  match_date: string;
  format: string;
  players_per_side: number;
  entry_fee: number;
  status: string;
  escrow_status: string;
}

function logAudit(adminId: string, action: string, targetType: string, targetId: string, details: any) {
  return supabase.from("audit_log").insert({ admin_id: adminId, action, target_type: targetType, target_id: targetId, details });
}

export default function AdminMatches() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = async () => {
    let q = supabase.from("matches").select("id, join_code, match_date, format, players_per_side, entry_fee, status, escrow_status, venue:venues(name, city), organizer:profiles(full_name, username)").order("created_at", { ascending: false });
    if (statusFilter !== "all") q = q.eq("status", statusFilter as any);
    if (dateFrom) q = q.gte("match_date", dateFrom);
    if (dateTo) q = q.lte("match_date", dateTo + "T23:59:59");
    const { data } = await q;
    setMatches((data ?? []) as any);
  };

  useEffect(() => { load(); }, [statusFilter, dateFrom, dateTo]);

  const forceCancel = async (m: MatchRow) => {
    if (!user) return;
    const ok = await confirm({
      description: `Force cancel match ${m.join_code}? All paid players will be refunded.`,
      variant: "destructive",
      confirmText: "Cancel Match",
    });
    if (!ok) return;
    const { error } = await supabase.functions.invoke("cancel-match", { body: { matchId: m.id } });
    if (error) { toast.error(error.message); return; }
    await logAudit(user.id, "force_cancel_match", "match", m.id, {});
    toast.success("Match cancelled");
    load();
  };

  const forceRelease = async (m: MatchRow) => {
    if (!user) return;
    const ok = await confirm({
      description: `Force release escrow for ${m.join_code}?`,
      variant: "destructive",
      confirmText: "Release",
    });
    if (!ok) return;
    if (m.status === "live" || m.status === "full") {
      const { error: rpcErr } = await (supabase as any).rpc("complete_match_atomic", {
        p_match_id: m.id,
        p_caller_id: user.id,
        p_winning_team: null,
      });
      if (rpcErr) { toast.error(`Failed to complete match: ${rpcErr.message}`); return; }
    } else {
      const { error } = await supabase.from("matches").update({ escrow_status: "released" } as any).eq("id", m.id);
      if (error) { toast.error(error.message); return; }
    }
    await logAudit(user.id, "force_release_escrow", "match", m.id, { status: m.status });
    toast.success("Escrow released");
    load();
  };

  const filteredMatches = useMemo(() => {
    if (statusFilter === "all") return matches;
    if (statusFilter === "upcoming") return matches.filter(m => m.status === "upcoming" || m.status === "full");
    return matches.filter(m => m.status === statusFilter);
  }, [matches, statusFilter]);

  const stats = useMemo(() => ({
    total: matches.length,
    upcoming: matches.filter(m => m.status === "upcoming" || m.status === "full").length,
    live: matches.filter(m => m.status === "live").length,
    completed: matches.filter(m => m.status === "completed").length,
    cancelled: matches.filter(m => m.status === "cancelled").length,
  }), [matches]);

  const groupedMatches = useMemo(() => ({
    upcoming: filteredMatches.filter(m => m.status === "upcoming" || m.status === "full"),
    live: filteredMatches.filter(m => m.status === "live"),
    past: filteredMatches.filter(m => m.status === "completed" || m.status === "cancelled"),
  }), [filteredMatches]);

  const statusBadge = (status: string) => {
    switch(status) {
      case "upcoming": return "bg-blue-500/10 text-blue-400";
      case "full": return "bg-cyan-500/10 text-cyan-400";
      case "live": return "bg-emerald-500/10 text-emerald-400";
      case "completed": return "bg-slate-500/10 text-slate-400";
      case "cancelled": return "bg-rose-500/10 text-rose-400";
      default: return "bg-slate-500/10 text-slate-400";
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-white tracking-tight">Matches</h1>
        <p className="text-sm text-slate-400 mt-1">Monitor and manage all platform matches</p>
      </div>

      <div className="grid grid-cols-5 gap-4">
        {[
          { label: "Total", value: stats.total, icon: Trophy, color: "text-blue-400", bg: "bg-blue-500/10" },
          { label: "Upcoming", value: stats.upcoming, icon: Trophy, color: "text-emerald-400", bg: "bg-emerald-500/10" },
          { label: "Live", value: stats.live, icon: Trophy, color: "text-amber-400", bg: "bg-amber-500/10" },
          { label: "Completed", value: stats.completed, icon: Trophy, color: "text-slate-400", bg: "bg-slate-500/10" },
          { label: "Cancelled", value: stats.cancelled, icon: Trophy, color: "text-rose-400", bg: "bg-rose-500/10" },
        ].map((s) => (
          <div key={s.label} className="bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-xl p-4 hover:border-white/[0.12] transition-all">
            <div className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center mb-2`}>
              <s.icon className={`w-4 h-4 ${s.color}`} />
            </div>
            <p className="text-xl font-bold text-white">{s.value}</p>
            <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wider mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-10 px-4 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-slate-300 outline-none focus:border-white/20 appearance-none cursor-pointer">
          <option value="all" className="bg-[#0B1120]">All status</option>
          <option value="upcoming" className="bg-[#0B1120]">Upcoming</option>
          <option value="live" className="bg-[#0B1120]">Live</option>
          <option value="completed" className="bg-[#0B1120]">Completed</option>
          <option value="cancelled" className="bg-[#0B1120]">Cancelled</option>
          <option value="full" className="bg-[#0B1120]">Full</option>
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-10 px-4 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-slate-300 outline-none focus:border-white/20" />
        <span className="text-xs text-slate-500">to</span>
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-10 px-4 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-slate-300 outline-none focus:border-white/20" />
        <span className="text-xs text-slate-500 ml-auto">{matches.length} results</span>
      </div>

      {Object.entries(groupedMatches).map(([groupKey, groupMatches]) => {
        const groupLabel = groupKey === "upcoming" ? "Upcoming & Full" : groupKey === "live" ? "Live" : "Past";
        return (
          <div key={groupKey} className="bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-xl overflow-hidden hover:border-white/[0.12] transition-all">
            <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-white">{groupLabel}</p>
                <p className="text-xs text-slate-500 mt-1">{groupMatches.length} {groupMatches.length === 1 ? "match" : "matches"}</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Code</th>
                    <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Venue</th>
                    <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Organizer</th>
                    <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Date</th>
                    <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Format</th>
                    <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Fee</th>
                    <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Escrow</th>
                    <th className="text-right px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {groupMatches.map((m) => {
                    const venue = Array.isArray(m.venue) ? m.venue[0] : m.venue;
                    const org = Array.isArray(m.organizer) ? m.organizer[0] : m.organizer;
                    return (
                      <tr key={m.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                        <td className="px-5 py-3.5 font-mono text-xs text-slate-300">{m.join_code}</td>
                        <td className="px-5 py-3.5 text-slate-300">{venue?.name || "—"} <span className="text-slate-500">· {venue?.city || "—"}</span></td>
                        <td className="px-5 py-3.5 text-slate-300">{org?.full_name || org?.username || "—"}</td>
                        <td className="px-5 py-3.5 text-xs text-slate-400">{new Date(m.match_date).toLocaleDateString()}</td>
                        <td className="px-5 py-3.5 text-slate-300">{m.format} · {m.players_per_side}v{m.players_per_side}</td>
                        <td className="px-5 py-3.5 text-slate-300 font-mono">{m.entry_fee > 0 ? `₵${m.entry_fee}` : "Free"}</td>
                        <td className="px-5 py-3.5">
                          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${statusBadge(m.status)}`}>
                            {m.status}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-slate-400 capitalize">{m.escrow_status}</td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Link to={`/lobby/${m.join_code}`} className="p-2 rounded-lg hover:bg-white/[0.06] transition-colors" title="View Lobby"><ExternalLink className="w-3.5 h-3.5 text-slate-400" /></Link>
                            {m.status !== "cancelled" && m.status !== "completed" && (
                              <button onClick={() => forceCancel(m)} className="p-2 rounded-lg hover:bg-white/[0.06] transition-colors" title="Force Cancel"><X className="w-3.5 h-3.5 text-rose-400" /></button>
                            )}
                            {m.escrow_status === "holding" && (
                              <button onClick={() => forceRelease(m)} className="p-2 rounded-lg hover:bg-white/[0.06] transition-colors" title="Force Release"><Unlock className="w-3.5 h-3.5 text-amber-400" /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {groupMatches.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-5 py-10 text-center text-slate-500 text-sm">No matches in this section</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
