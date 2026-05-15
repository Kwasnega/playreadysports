import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Flag, Check, UserX, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useConfirm } from "@/components/ui/ConfirmProvider";

interface Report {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  match_id: string | null;
  reason: string;
  description: string | null;
  status: string;
  created_at: string;
  reporter: { full_name: string | null; username: string | null } | null;
  reported: { full_name: string | null; username: string | null } | null;
  match: { join_code: string } | null;
}

function logAudit(adminId: string, action: string, targetType: string, targetId: string, details: any) {
  return supabase.from("audit_log").insert({ admin_id: adminId, action, target_type: targetType, target_id: targetId, details });
}

export default function AdminReports() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [reports, setReports] = useState<Report[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from("reports")
      .select("*, reporter:profiles!reports_reporter_id_fkey(full_name, username), reported:profiles!reports_reported_user_id_fkey(full_name, username), match:matches(join_code)")
      .order("status", { ascending: true }) // unresolved first
      .order("created_at", { ascending: false });
    setReports((data ?? []) as any);
  };

  useEffect(() => { load(); }, []);

  const resolve = async (r: Report) => {
    if (!user) return;
    await supabase.from("reports").update({ status: "resolved" }).eq("id", r.id);
    await logAudit(user.id, "resolve_report", "report", r.id, {});
    toast.success("Report resolved");
    load();
  };

  const dismiss = async (r: Report) => {
    if (!user) return;
    await supabase.from("reports").update({ status: "dismissed" }).eq("id", r.id);
    await logAudit(user.id, "dismiss_report", "report", r.id, {});
    toast.success("Report dismissed");
    load();
  };

  const banUser = async (r: Report) => {
    if (!user) return;
    const ok = await confirm({
      description: `Ban ${r.reported?.full_name || r.reported?.username || "this user"}?`,
      variant: "destructive",
      confirmText: "Ban",
    });
    if (!ok) return;
    await supabase.from("profiles").update({ is_banned: true, banned_until: null, ban_reason: r.reason }).eq("id", r.reported_user_id);
    await logAudit(user.id, "ban_user_from_report", "profile", r.reported_user_id, { report_id: r.id });
    toast.success("User banned");
    load();
  };

  const stats = useMemo(() => ({
    total: reports.length,
    unresolved: reports.filter(r => r.status === "unresolved").length,
    resolved: reports.filter(r => r.status === "resolved").length,
    dismissed: reports.filter(r => r.status === "dismissed").length,
  }), [reports]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-white tracking-tight">Reports</h1>
        <p className="text-sm text-slate-400 mt-1">Handle user reports and disputes</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total", value: stats.total, color: "text-blue-400", bg: "bg-blue-500/10" },
          { label: "Unresolved", value: stats.unresolved, color: "text-amber-400", bg: "bg-amber-500/10" },
          { label: "Resolved", value: stats.resolved, color: "text-emerald-400", bg: "bg-emerald-500/10" },
          { label: "Dismissed", value: stats.dismissed, color: "text-slate-400", bg: "bg-slate-500/10" },
        ].map((s) => (
          <div key={s.label} className="bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-xl p-4 hover:border-white/[0.12] transition-all">
            <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wider mb-1">{s.label}</p>
            <p className="text-2xl font-bold text-white">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-2xl overflow-hidden hover:border-white/[0.12] transition-all">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Reporter</th>
                <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Reported</th>
                <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Match</th>
                <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Reason</th>
                <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Date</th>
                <th className="text-right px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => {
                const reporter = Array.isArray(r.reporter) ? r.reporter[0] : r.reporter;
                const reported = Array.isArray(r.reported) ? r.reported[0] : r.reported;
                const match = Array.isArray(r.match) ? r.match[0] : r.match;
                const isExpanded = expanded === r.id;
                return (
                  <>
                    <tr key={r.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] cursor-pointer transition-colors" onClick={() => setExpanded(isExpanded ? null : r.id)}>
                      <td className="px-5 py-3.5 text-slate-300">{reporter?.full_name || reporter?.username || "—"}</td>
                      <td className="px-5 py-3.5 text-slate-300">{reported?.full_name || reported?.username || "—"}</td>
                      <td className="px-5 py-3.5 font-mono text-xs text-slate-400">{match?.join_code || "—"}</td>
                      <td className="px-5 py-3.5 text-slate-300">{r.reason}</td>
                      <td className="px-5 py-3.5">
                        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                          r.status === "unresolved" ? "bg-amber-500/10 text-amber-400" : 
                          r.status === "resolved" ? "bg-emerald-500/10 text-emerald-400" : 
                          "bg-slate-500/10 text-slate-400"
                        }`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-500">{new Date(r.created_at).toLocaleDateString()}</td>
                      <td className="px-5 py-3.5 text-right">
                        <button onClick={(e) => { e.stopPropagation(); setExpanded(isExpanded ? null : r.id); }} className="p-2 rounded-lg hover:bg-white/[0.06] transition-colors">
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-white/[0.02]">
                        <td colSpan={7} className="px-5 py-4">
                          <p className="text-sm text-slate-300 mb-4 leading-relaxed">{r.description || "No description provided."}</p>
                          <div className="flex gap-2">
                            {r.status === "unresolved" && (
                              <>
                                <button onClick={() => resolve(r)} className="px-4 py-2 rounded-xl bg-emerald-500/10 text-emerald-400 text-xs font-semibold flex items-center gap-1.5 hover:bg-emerald-500/20 transition-all"><Check className="w-3.5 h-3.5" /> Resolve</button>
                                <button onClick={() => banUser(r)} className="px-4 py-2 rounded-xl bg-rose-500/10 text-rose-400 text-xs font-semibold flex items-center gap-1.5 hover:bg-rose-500/20 transition-all"><UserX className="w-3.5 h-3.5" /> Ban User</button>
                                <button onClick={() => dismiss(r)} className="px-4 py-2 rounded-xl bg-white/[0.04] text-slate-400 text-xs font-semibold flex items-center gap-1.5 hover:bg-white/[0.08] transition-all"><Trash2 className="w-3.5 h-3.5" /> Dismiss</button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
              {reports.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-500 text-sm">No reports</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
