import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Search, Eye, ShieldCheck, ShieldX, Shield, Users, Filter, Crown } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface Profile {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  city: string | null;
  total_matches_played: number;
  reputation_score: number;
  role: string;
  is_banned: boolean;
  banned_until: string | null;
  created_at: string;
}

function logAudit(adminId: string, action: string, targetType: string, targetId: string, details: any) {
  return supabase.from("audit_log").insert({
    admin_id: adminId,
    action,
    target_type: targetType,
    target_id: targetId,
    details,
  });
}

export default function AdminPlayers() {
  const { user } = useAuth();
  const [players, setPlayers] = useState<Profile[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [banModalOpen, setBanModalOpen] = useState(false);
  const [banTarget, setBanTarget] = useState<Profile | null>(null);
  const [banReason, setBanReason] = useState("");
  const [banDuration, setBanDuration] = useState<"7d" | "30d" | "permanent">("7d");

  const load = async () => {
    const { data } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
    setPlayers((data ?? []) as Profile[]);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return players.filter((p) => {
      const matchesSearch = (p.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
        (p.username || "").toLowerCase().includes(search.toLowerCase());
      const matchesRole = roleFilter === "all" || p.role === roleFilter;
      const banned = p.is_banned || (p.banned_until && new Date(p.banned_until) > new Date());
      const matchesStatus = statusFilter === "all" || (statusFilter === "banned" ? banned : !banned);
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [players, search, roleFilter, statusFilter]);

  const stats = useMemo(() => ({
    total: players.length,
    active: players.filter(p => !(p.is_banned || (p.banned_until && new Date(p.banned_until) > new Date()))).length,
    banned: players.filter(p => p.is_banned || (p.banned_until && new Date(p.banned_until) > new Date())).length,
    admins: players.filter(p => p.role === "admin" || p.role === "super_admin").length,
  }), [players]);

  const applyBan = async () => {
    if (!banTarget || !user) return;
    const until = banDuration === "permanent" ? null
      : banDuration === "30d" ? new Date(Date.now() + 30 * 86400000).toISOString()
      : new Date(Date.now() + 7 * 86400000).toISOString();

    await supabase.from("profiles").update({
      is_banned: true,
      banned_until: until,
      ban_reason: banReason,
    }).eq("id", banTarget.id);

    await logAudit(user.id, "ban_user", "profile", banTarget.id, {
      reason: banReason,
      duration: banDuration,
      banned_until: until,
    });

    toast.success("User banned");
    setBanModalOpen(false);
    setBanTarget(null);
    setBanReason("");
    load();
  };

  const makeAdmin = async (p: Profile) => {
    if (!user) return;
    await supabase.from("profiles").update({ role: "admin" }).eq("id", p.id);
    await logAudit(user.id, "make_admin", "profile", p.id, {});
    toast.success(`${p.username || p.full_name} is now an admin`);
    load();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-display font-bold text-white tracking-tight">Players</h1>
        <p className="text-sm text-slate-400 mt-1">Manage player accounts, roles, and access</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total Players", value: stats.total, icon: Users, color: "text-blue-400", bg: "bg-blue-500/10" },
          { label: "Active", value: stats.active, icon: ShieldCheck, color: "text-emerald-400", bg: "bg-emerald-500/10" },
          { label: "Banned", value: stats.banned, icon: ShieldX, color: "text-rose-400", bg: "bg-rose-500/10" },
          { label: "Admins", value: stats.admins, icon: Crown, color: "text-amber-400", bg: "bg-amber-500/10" },
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

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search players…"
            className="pl-9 pr-4 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20 w-72 transition-all"
          />
        </div>
        <div className="relative">
          <Filter className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="pl-8 pr-8 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-slate-300 outline-none focus:border-white/20 appearance-none cursor-pointer">
            <option value="all" className="bg-[#0B1120]">All roles</option>
            <option value="player" className="bg-[#0B1120]">Player</option>
            <option value="admin" className="bg-[#0B1120]">Admin</option>
            <option value="super_admin" className="bg-[#0B1120]">Super Admin</option>
          </select>
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-10 px-4 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-slate-300 outline-none focus:border-white/20 appearance-none cursor-pointer">
          <option value="all" className="bg-[#0B1120]">All status</option>
          <option value="active" className="bg-[#0B1120]">Active</option>
          <option value="banned" className="bg-[#0B1120]">Banned</option>
        </select>
        <span className="text-xs text-slate-500 ml-auto">{filtered.length} results</span>
      </div>

      {/* Table */}
      <div className="bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-2xl overflow-hidden hover:border-white/[0.12] transition-all">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Player</th>
                <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">City</th>
                <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Matches</th>
                <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Rep</th>
                <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Role</th>
                <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Joined</th>
                <th className="text-right px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const banned = p.is_banned || (p.banned_until && new Date(p.banned_until) > new Date());
                return (
                  <tr key={p.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        {p.avatar_url ? (
                          <img src={p.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover ring-2 ring-white/5" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-300 ring-2 ring-white/5">
                            {(p.full_name || p.username || "?").slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="text-slate-200 font-medium text-sm">{p.full_name || p.username || "—"}</p>
                          <p className="text-xs text-slate-500">@{p.username || "—"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-400">{p.city || "—"}</td>
                    <td className="px-5 py-3.5 text-slate-300 font-mono">{p.total_matches_played ?? 0}</td>
                    <td className="px-5 py-3.5 text-slate-300 font-mono">{p.reputation_score ?? 0}</td>
                    <td className="px-5 py-3.5">
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                        p.role === "super_admin" ? "bg-purple-500/10 text-purple-400" :
                        p.role === "admin" ? "bg-amber-500/10 text-amber-400" :
                        "bg-slate-500/10 text-slate-400"
                      }`}>
                        {p.role || "player"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${banned ? "bg-rose-500/10 text-rose-400" : "bg-emerald-500/10 text-emerald-400"}`}>
                        {banned ? "Banned" : "Active"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-500">{new Date(p.created_at).toLocaleDateString()}</td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link to={`/player/${p.username || p.id}`} className="p-2 rounded-lg hover:bg-white/[0.06] transition-colors" title="View Profile">
                          <Eye className="w-3.5 h-3.5 text-slate-400" />
                        </Link>
                        {banned ? (
                          <button onClick={async () => {
                            if (!user) return;
                            await supabase.from("profiles").update({ is_banned: false, banned_until: null, ban_reason: null }).eq("id", p.id);
                            await logAudit(user.id, "unban_user", "profile", p.id, {});
                            toast.success("User unbanned");
                            load();
                          }} className="p-2 rounded-lg hover:bg-white/[0.06] transition-colors" title="Unban">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                          </button>
                        ) : (
                          <button onClick={() => { setBanTarget(p); setBanModalOpen(true); }} className="p-2 rounded-lg hover:bg-white/[0.06] transition-colors" title="Ban">
                            <ShieldX className="w-3.5 h-3.5 text-rose-400" />
                          </button>
                        )}
                        {p.role !== "admin" && p.role !== "super_admin" && (
                          <button onClick={() => makeAdmin(p)} className="p-2 rounded-lg hover:bg-white/[0.06] transition-colors" title="Make Admin">
                            <Shield className="w-3.5 h-3.5 text-amber-400" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-500 text-sm">No players found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ban modal */}
      {banModalOpen && banTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setBanModalOpen(false)}>
          <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-6 w-full max-w-md space-y-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div>
              <h2 className="text-lg font-bold text-white">Ban Player</h2>
              <p className="text-sm text-slate-400 mt-1">{banTarget.full_name || banTarget.username}</p>
            </div>
            <textarea
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder="Reason for ban…"
              className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] p-3.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20 resize-none h-24 transition-all"
            />
            <div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-2">Duration</p>
              <div className="flex gap-2">
                {(["7d", "30d", "permanent"] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setBanDuration(d)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-all ${banDuration === d ? "bg-white/[0.08] text-white border-white/20" : "bg-transparent text-slate-400 border-white/[0.08] hover:border-white/15"}`}
                  >
                    {d === "permanent" ? "Permanent" : d}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setBanModalOpen(false)} className="flex-1 py-2.5 rounded-xl bg-white/[0.04] text-slate-300 text-sm font-semibold hover:bg-white/[0.08] transition-all">Cancel</button>
              <button onClick={applyBan} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 text-white text-sm font-semibold hover:from-rose-500 hover:to-red-500 transition-all shadow-lg shadow-rose-500/20">Ban User</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
