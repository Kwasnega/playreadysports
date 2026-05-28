import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Search, Eye, ShieldCheck, ShieldX, Shield, Users, Filter, Crown,
  User, Mail, Phone, MapPin, Calendar, Star, AlertTriangle, FileText,
  Download, History, MessageSquare, Bell, CreditCard, Trophy, Activity,
  ChevronLeft, X, Edit3, Save, TrendingUp, ArrowDown, ArrowUp, Check,
  Gamepad2, Wallet, Flag, ClipboardList, BellRing, Database
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface Profile {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  city: string | null;
  email: string | null;
  phone_number: string | null;
  total_matches_played: number;
  reputation_score: number;
  role: string;
  is_banned: boolean;
  banned_until: string | null;
  ban_reason: string | null;
  created_at: string;
  updated_at: string;
  skill_level: string | null;
  position: string | null;
  bio: string | null;
  is_verified: boolean;
}

interface ReputationEntry {
  id: string;
  user_id: string;
  old_score: number | null;
  new_score: number;
  reason: string | null;
  admin_id: string | null;
  created_at: string;
}

interface MatchParticipantRow {
  id: string;
  slot_type: string;
  team: string;
  payment_status: string;
  status: string;
  joined_at: string;
  match_id: string;
  match?: {
    id: string;
    title: string | null;
    join_code: string | null;
    match_date: string | null;
    status: string;
    entry_fee: number | null;
    format: string | null;
    mode: string | null;
    match_type: string | null;
    venue?: { name: string | null; city: string | null } | null;
  } | null;
}

interface ReviewRow {
  id: string;
  reviewer_id: string;
  reviewed_user_id: string;
  match_id: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer?: { full_name: string | null; username: string | null; avatar_url: string | null } | null;
  reviewed?: { full_name: string | null; username: string | null; avatar_url: string | null } | null;
  match?: { title: string | null; join_code: string | null } | null;
}

interface ReportRow {
  id: string;
  reporter_id: string;
  reported_user_id: string | null;
  match_id: string | null;
  reason: string;
  status: string;
  created_at: string;
  reporter?: { full_name: string | null; username: string | null } | null;
  reported?: { full_name: string | null; username: string | null } | null;
  match?: { title: string | null; join_code: string | null } | null;
}

interface AuditRow {
  id: string;
  admin_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: any;
  created_at: string;
}

interface PlayerDetails {
  profile: Profile;
  matches: MatchParticipantRow[];
  walletTransactions: any[];
  reviewsGiven: ReviewRow[];
  reviewsReceived: ReviewRow[];
  reportsFiled: ReportRow[];
  reportsReceived: ReportRow[];
  auditLog: AuditRow[];
  notifications: any[];
  reputationHistory: ReputationEntry[];
  walletBalance: number | null;
}

type DetailTab = "overview" | "matches" | "payments" | "reviews" | "reports" | "audit" | "notifications" | "export";

function logAudit(adminId: string, action: string, targetType: string, targetId: string, details: any) {
  return supabase.from("audit_log").insert({
    admin_id: adminId,
    action,
    target_type: targetType,
    target_id: targetId,
    details,
  });
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fuzzyScore(text: string | null, query: string): number {
  if (!text || !query) return 0;
  text = text.toLowerCase();
  query = query.toLowerCase();
  let score = 0;
  let textIdx = 0;
  let consecutive = 0;
  for (let i = 0; i < query.length; i++) {
    const idx = text.indexOf(query[i], textIdx);
    if (idx === -1) return 0;
    score += 1;
    if (idx === textIdx) {
      consecutive++;
      score += consecutive * 0.3;
    } else {
      consecutive = 0;
    }
    textIdx = idx + 1;
  }
  if (text.includes(query)) score += 5;
  score -= (text.length - query.length) * 0.01;
  return Math.max(0, score);
}

function ReputationGraph({ entries }: { entries: ReputationEntry[] }) {
  if (entries.length < 2) return <p className="text-xs text-slate-500 mt-2">Not enough history to display graph</p>;
  const scores = entries.map((e) => e.new_score);
  const min = Math.min(...scores, 0);
  const max = Math.max(...scores, 10);
  const range = max - min || 1;
  const pad = 4;
  const w = 100 - pad * 2;
  const h = 60 - pad * 2;
  const points = entries.map((e, i) => {
    const x = pad + (i / (entries.length - 1)) * w;
    const y = pad + h - ((e.new_score - min) / range) * h;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 100 60`} className="w-full h-24 mt-2" preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke="#22d3ee" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      {entries.map((e, i) => {
        const x = pad + (i / (entries.length - 1)) * w;
        const y = pad + h - ((e.new_score - min) / range) * h;
        return <circle key={i} cx={x} cy={y} r="1.8" fill="#22d3ee" />;
      })}
    </svg>
  );
}

const TABS: { key: DetailTab; label: string; icon: React.ElementType }[] = [
  { key: "overview", label: "Overview", icon: User },
  { key: "matches", label: "Matches", icon: Gamepad2 },
  { key: "payments", label: "Payments", icon: CreditCard },
  { key: "reviews", label: "Reviews", icon: Star },
  { key: "reports", label: "Reports", icon: Flag },
  { key: "audit", label: "Audit", icon: ClipboardList },
  { key: "notifications", label: "Notifications", icon: BellRing },
  { key: "export", label: "Data Export", icon: Database },
];

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
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailPlayer, setDetailPlayer] = useState<Profile | null>(null);
  const [details, setDetails] = useState<PlayerDetails | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [detailLoading, setDetailLoading] = useState(false);
  const [joinCodeUserIds, setJoinCodeUserIds] = useState<string[]>([]);
  const [repOverrideOpen, setRepOverrideOpen] = useState(false);
  const [repNewScore, setRepNewScore] = useState<number>(50);
  const [repReason, setRepReason] = useState("");
  const [reviewSubTab, setReviewSubTab] = useState<"given" | "received">("given");
  const [reportSubTab, setReportSubTab] = useState<"filed" | "received">("filed");

  const load = async () => {
    const { data } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
    setPlayers((data ?? []) as Profile[]);
  };

  useEffect(() => { load(); }, []);

  // Debounced join_code search
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (search.length >= 3) {
        const { data: matchRows } = await supabase.from("matches").select("id").ilike("join_code", `%${search}%`);
        if (matchRows?.length) {
          const matchIds = matchRows.map((m) => m.id);
          const { data: parts } = await supabase.from("match_participants").select("user_id").in("match_id", matchIds);
          setJoinCodeUserIds([...new Set((parts || []).map((p: any) => p.user_id))]);
        } else {
          setJoinCodeUserIds([]);
        }
      } else {
        setJoinCodeUserIds([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const filtered = useMemo(() => {
    const joinCodeSet = new Set(joinCodeUserIds);
    const scored = players.map((p) => {
      let score = 0;
      score = Math.max(score, fuzzyScore(p.full_name, search));
      score = Math.max(score, fuzzyScore(p.username, search));
      score = Math.max(score, fuzzyScore(p.email, search));
      score = Math.max(score, fuzzyScore(p.phone_number, search));
      score = Math.max(score, fuzzyScore(p.id, search));
      return { p, score };
    });

    let results = scored
      .filter(({ score, p }) => score > 0 || joinCodeSet.has(p.id))
      .map(({ p, score }) => ({ p, score: score + (joinCodeSet.has(p.id) ? 10 : 0) }))
      .sort((a, b) => b.score - a.score)
      .map(({ p }) => p);

    if (!search) results = players;

    return results.filter((p) => {
      const matchesRole = roleFilter === "all" || p.role === roleFilter;
      const banned = p.is_banned || (p.banned_until && new Date(p.banned_until) > new Date());
      const matchesStatus = statusFilter === "all" || (statusFilter === "banned" ? banned : !banned);
      return matchesRole && matchesStatus;
    });
  }, [players, search, joinCodeUserIds, roleFilter, statusFilter]);

  const stats = useMemo(() => ({
    total: players.length,
    active: players.filter((p) => !(p.is_banned || (p.banned_until && new Date(p.banned_until) > new Date()))).length,
    banned: players.filter((p) => p.is_banned || (p.banned_until && new Date(p.banned_until) > new Date())).length,
    admins: players.filter((p) => p.role === "admin" || p.role === "super_admin").length,
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
    await supabase.from("profiles").update({ role: "admin", is_admin: true }).eq("id", p.id);
    await logAudit(user.id, "make_admin", "profile", p.id, {});
    toast.success(`${p.username || p.full_name} is now an admin`);
    load();
  };

  const openDetail = async (p: Profile) => {
    setDetailPlayer(p);
    setDetailModalOpen(true);
    setDetailLoading(true);
    setDetailTab("overview");
    setReviewSubTab("given");
    setReportSubTab("filed");

    const [
      profileRes,
      participantsRes,
      walletTxnsRes,
      reviewsGivenRes,
      reviewsReceivedRes,
      reportsFiledRes,
      reportsReceivedRes,
      auditRes,
      notifsRes,
      repHistoryRes,
      walletBalanceRes,
    ] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", p.id).single(),
      supabase.from("match_participants").select("*").eq("user_id", p.id).order("joined_at", { ascending: false }),
      supabase.from("wallet_transactions").select("*").eq("user_id", p.id).order("created_at", { ascending: false }),
      supabase.from("reviews").select("*").eq("reviewer_id", p.id).order("created_at", { ascending: false }),
      supabase.from("reviews").select("*").eq("reviewed_user_id", p.id).order("created_at", { ascending: false }),
      supabase.from("reports").select("*").eq("reporter_id", p.id).order("created_at", { ascending: false }),
      supabase.from("reports").select("*").eq("reported_user_id", p.id).order("created_at", { ascending: false }),
      supabase.from("audit_log").select("*").eq("target_id", p.id).order("created_at", { ascending: false }).limit(100),
      supabase.from("notifications").select("*").eq("user_id", p.id).order("created_at", { ascending: false }).limit(50),
      supabase.from("reputation_history").select("*").eq("user_id", p.id).order("created_at", { ascending: false }),
      supabase.from("wallet_balances").select("balance").eq("user_id", p.id).single(),
    ]);

    // Fetch match details for participants
    const participantRows = (participantsRes.data || []) as any[];
    const matchIds = [...new Set(participantRows.map((pr) => pr.match_id))];
    let matchesMap: Record<string, any> = {};
    if (matchIds.length > 0) {
      const { data: matchesData } = await supabase.from("matches").select("*, venues(name, city)").in("id", matchIds);
      (matchesData || []).forEach((m: any) => { matchesMap[m.id] = m; });
    }

    // Enrich reviews with user names
    const enrichReviews = async (reviews: any[]) => {
      const userIds = [...new Set(reviews.flatMap((r) => [r.reviewer_id, r.reviewed_user_id]))];
      let userMap: Record<string, any> = {};
      if (userIds.length > 0) {
        const { data: users } = await supabase.from("profiles").select("id, full_name, username, avatar_url").in("id", userIds);
        (users || []).forEach((u: any) => { userMap[u.id] = u; });
      }
      const matchIds2 = [...new Set(reviews.map((r) => r.match_id).filter(Boolean))];
      let matchMap: Record<string, any> = {};
      if (matchIds2.length > 0) {
        const { data: mData } = await supabase.from("matches").select("id, title, join_code").in("id", matchIds2);
        (mData || []).forEach((m: any) => { matchMap[m.id] = m; });
      }
      return reviews.map((r) => ({
        ...r,
        reviewer: userMap[r.reviewer_id] || null,
        reviewed: userMap[r.reviewed_user_id] || null,
        match: matchMap[r.match_id] || null,
      }));
    };

    // Enrich reports with user names
    const enrichReports = async (reports: any[]) => {
      const userIds = [...new Set(reports.flatMap((r) => [r.reporter_id, r.reported_user_id]).filter(Boolean))];
      let userMap: Record<string, any> = {};
      if (userIds.length > 0) {
        const { data: users } = await supabase.from("profiles").select("id, full_name, username").in("id", userIds);
        (users || []).forEach((u: any) => { userMap[u.id] = u; });
      }
      const matchIds2 = [...new Set(reports.map((r) => r.match_id).filter(Boolean))];
      let matchMap: Record<string, any> = {};
      if (matchIds2.length > 0) {
        const { data: mData } = await supabase.from("matches").select("id, title, join_code").in("id", matchIds2);
        (mData || []).forEach((m: any) => { matchMap[m.id] = m; });
      }
      return reports.map((r) => ({
        ...r,
        reporter: userMap[r.reporter_id] || null,
        reported: userMap[r.reported_user_id] || null,
        match: matchMap[r.match_id] || null,
      }));
    };

    const [enrichedReviewsGiven, enrichedReviewsReceived, enrichedReportsFiled, enrichedReportsReceived] = await Promise.all([
      enrichReviews(reviewsGivenRes.data || []),
      enrichReviews(reviewsReceivedRes.data || []),
      enrichReports(reportsFiledRes.data || []),
      enrichReports(reportsReceivedRes.data || []),
    ]);

    const matches = participantRows.map((pr) => ({
      ...pr,
      match: matchesMap[pr.match_id] || null,
    }));

    setDetails({
      profile: profileRes.data as Profile,
      matches,
      walletTransactions: walletTxnsRes.data || [],
      reviewsGiven: enrichedReviewsGiven,
      reviewsReceived: enrichedReviewsReceived,
      reportsFiled: enrichedReportsFiled,
      reportsReceived: enrichedReportsReceived,
      auditLog: auditRes.data || [],
      notifications: notifsRes.data || [],
      reputationHistory: repHistoryRes.data || [],
      walletBalance: walletBalanceRes.data?.balance ?? null,
    });
    setDetailLoading(false);
  };

  const applyReputationOverride = async () => {
    if (!detailPlayer || !user || !details) return;
    const oldScore = details.profile.reputation_score;
    await supabase.from("profiles").update({ reputation_score: repNewScore }).eq("id", detailPlayer.id);
    await supabase.from("reputation_history").insert({
      user_id: detailPlayer.id,
      old_score: oldScore,
      new_score: repNewScore,
      reason: repReason,
      admin_id: user.id,
    });
    await logAudit(user.id, "reputation_override", "profile", detailPlayer.id, {
      old_score: oldScore,
      new_score: repNewScore,
      reason: repReason,
    });
    toast.success("Reputation score updated");
    setRepOverrideOpen(false);
    setRepReason("");
    openDetail({ ...detailPlayer, reputation_score: repNewScore });
    load();
  };

  const exportGDPR = () => {
    if (!details) return;
    const exportData = {
      profile: details.profile,
      matches: details.matches,
      wallet_transactions: details.walletTransactions,
      wallet_balance: details.walletBalance,
      reviews_given: details.reviewsGiven,
      reviews_received: details.reviewsReceived,
      reports_filed: details.reportsFiled,
      reports_received: details.reportsReceived,
      audit_log: details.auditLog,
      notifications: details.notifications,
      reputation_history: details.reputationHistory,
      exported_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gdpr-export-${details.profile.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("GDPR export downloaded");
  };

  const renderDetailContent = useCallback(() => {
    if (detailLoading || !details) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
        </div>
      );
    }

    const { profile, matches, walletTransactions, reviewsGiven, reviewsReceived, reportsFiled, reportsReceived, auditLog, notifications, reputationHistory, walletBalance } = details;

    switch (detailTab) {
      case "overview": {
        const banned = profile.is_banned || (profile.banned_until && new Date(profile.banned_until) > new Date());
        return (
          <div className="space-y-6 p-1">
            <div className="flex items-start gap-5">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-20 h-20 rounded-2xl object-cover ring-2 ring-white/10" />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center text-lg font-bold text-slate-300 ring-2 ring-white/10">
                  {(profile.full_name || profile.username || "?").slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-bold text-white">{profile.full_name || profile.username || "Unnamed"}</h3>
                <p className="text-sm text-slate-400">@{profile.username || "—"} · {profile.id.slice(0, 8)}</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {profile.is_verified && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Verified</span>}
                  {banned && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400">Banned</span>}
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${profile.role === "super_admin" ? "bg-purple-500/10 text-purple-400" : profile.role === "admin" ? "bg-amber-500/10 text-amber-400" : "bg-slate-500/10 text-slate-400"}`}>{profile.role || "player"}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Matches", value: profile.total_matches_played ?? 0, icon: Gamepad2 },
                { label: "Rep Score", value: profile.reputation_score?.toFixed(1) ?? "—", icon: Star },
                { label: "Wallet", value: `₵${walletBalance ?? 0}`, icon: Wallet },
                { label: "Joined", value: formatDate(profile.created_at).split(",")[0], icon: Calendar },
              ].map((s) => (
                <div key={s.label} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                  <s.icon className="w-3.5 h-3.5 text-slate-500 mb-1.5" />
                  <p className="text-lg font-bold text-white">{s.value}</p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider">{s.label}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 space-y-3">
                <h4 className="text-sm font-semibold text-white flex items-center gap-2"><User className="w-3.5 h-3.5 text-slate-400" />Basic Info</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-slate-500">Email</span><span className="text-slate-200">{profile.email || "—"}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Phone</span><span className="text-slate-200">{profile.phone_number || "—"}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">City</span><span className="text-slate-200">{profile.city || "—"}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Skill</span><span className="text-slate-200 capitalize">{profile.skill_level || "—"}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Position</span><span className="text-slate-200">{profile.position || "—"}</span></div>
                </div>
              </div>

              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 space-y-3">
                <h4 className="text-sm font-semibold text-white flex items-center gap-2"><Star className="w-3.5 h-3.5 text-slate-400" />Reputation</h4>
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-bold text-white">{profile.reputation_score?.toFixed(1) ?? "—"}</span>
                  <button onClick={() => { setRepNewScore(profile.reputation_score ?? 50); setRepOverrideOpen(true); }} className="mb-1 px-2 py-1 rounded-lg bg-white/[0.06] text-[11px] text-slate-300 hover:bg-white/[0.1] transition-colors flex items-center gap-1">
                    <Edit3 className="w-3 h-3" /> Override
                  </button>
                </div>
                <ReputationGraph entries={reputationHistory} />
                {repOverrideOpen && (
                  <div className="mt-3 p-3 bg-white/[0.04] rounded-xl border border-white/[0.08] space-y-3">
                    <input type="number" min={0} max={100} value={repNewScore} onChange={(e) => setRepNewScore(Number(e.target.value))} className="w-full h-9 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white px-3 outline-none focus:border-white/20" placeholder="New score (0-100)" />
                    <textarea value={repReason} onChange={(e) => setRepReason(e.target.value)} placeholder="Reason for override…" className="w-full rounded-lg bg-white/[0.04] border border-white/[0.08] p-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20 resize-none h-16" />
                    <div className="flex gap-2">
                      <button onClick={() => setRepOverrideOpen(false)} className="flex-1 py-2 rounded-lg bg-white/[0.04] text-slate-300 text-xs font-semibold hover:bg-white/[0.08]">Cancel</button>
                      <button onClick={applyReputationOverride} disabled={!repReason.trim()} className="flex-1 py-2 rounded-lg bg-cyan-600 text-white text-xs font-semibold hover:bg-cyan-500 disabled:opacity-40">Save</button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {banned && (
              <div className="bg-rose-500/5 border border-rose-500/10 rounded-xl p-4">
                <h4 className="text-sm font-semibold text-rose-400 flex items-center gap-2"><ShieldX className="w-3.5 h-3.5" />Ban Status</h4>
                <p className="text-sm text-slate-300 mt-1">Reason: {profile.ban_reason || "No reason provided"}</p>
                <p className="text-sm text-slate-400">Until: {profile.banned_until ? formatDate(profile.banned_until) : "Permanent"}</p>
              </div>
            )}
          </div>
        );
      }

      case "matches": {
        return (
          <div className="space-y-3">
            {matches.length === 0 && <p className="text-sm text-slate-500 text-center py-8">No matches found</p>}
            {matches.map((m) => (
              <div key={m.id} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">{m.match?.title || `Match ${m.match?.join_code || m.match_id.slice(0, 6)}`}</p>
                  <p className="text-xs text-slate-400">{m.match?.venue?.name || "—"} · {m.match?.venue?.city || "—"}</p>
                  <div className="flex gap-2 mt-1.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${m.match?.status === "completed" ? "bg-emerald-500/10 text-emerald-400" : m.match?.status === "cancelled" ? "bg-rose-500/10 text-rose-400" : m.match?.status === "live" ? "bg-amber-500/10 text-amber-400" : "bg-blue-500/10 text-blue-400"}`}>{m.match?.status || "—"}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-500/10 text-slate-400">{m.slot_type}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-500/10 text-slate-400">{m.payment_status}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400">{formatDate(m.match?.match_date)}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{m.match?.entry_fee ? `₵${m.match.entry_fee}` : "Free"}</p>
                </div>
              </div>
            ))}
          </div>
        );
      }

      case "payments": {
        const list = walletTransactions.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 mb-2">
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 text-center">
                <p className="text-lg font-bold text-white">{walletTransactions.length}</p>
                <p className="text-[10px] text-slate-500 uppercase">Wallet Txns</p>
              </div>
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 text-center">
                <p className="text-lg font-bold text-white">₵{walletBalance ?? 0}</p>
                <p className="text-[10px] text-slate-500 uppercase">Balance</p>
              </div>
            </div>
            {list.length === 0 && <p className="text-sm text-slate-500 text-center py-8">No transactions found</p>}
            {list.map((t: any, i: number) => (
              <div key={i} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-cyan-500/10">
                    <CreditCard className="w-3.5 h-3.5 text-cyan-400" />
                  </div>
                  <div>
                    <p className="text-sm text-white">{t.type}</p>
                    <p className="text-[10px] text-slate-500">{t.reference || "—"}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-semibold ${(t.amount ?? 0) < 0 ? "text-rose-400" : "text-emerald-400"}`}>{(t.amount ?? 0) < 0 ? "" : "+"}₵{Math.abs(t.amount ?? 0)}</p>
                  <p className="text-[10px] text-slate-500">{t.status}</p>
                  <p className="text-[10px] text-slate-500">{formatDate(t.created_at).split(",")[0]}</p>
                </div>
              </div>
            ))}
          </div>
        );
      }

      case "reviews": {
        const list = reviewSubTab === "given" ? reviewsGiven : reviewsReceived;
        return (
          <div className="space-y-3">
            <div className="flex gap-2">
              <button onClick={() => setReviewSubTab("given")} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${reviewSubTab === "given" ? "bg-white/[0.08] text-white" : "text-slate-400 hover:text-slate-200"}`}>Given ({reviewsGiven.length})</button>
              <button onClick={() => setReviewSubTab("received")} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${reviewSubTab === "received" ? "bg-white/[0.08] text-white" : "text-slate-400 hover:text-slate-200"}`}>Received ({reviewsReceived.length})</button>
            </div>
            {list.length === 0 && <p className="text-sm text-slate-500 text-center py-8">No reviews found</p>}
            {list.map((r) => (
              <div key={r.id} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Star className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-sm font-bold text-white">{r.rating}/5</span>
                  </div>
                  <span className="text-[10px] text-slate-500">{formatDate(r.created_at)}</span>
                </div>
                <p className="text-sm text-slate-300">{r.comment || "No comment"}</p>
                <div className="flex gap-3 mt-2 text-[11px] text-slate-500">
                  <span>From: {reviewSubTab === "given" ? "You" : r.reviewer?.full_name || "—"}</span>
                  <span>To: {reviewSubTab === "given" ? r.reviewed?.full_name || "—" : "You"}</span>
                  <span>Match: {r.match?.join_code || "—"}</span>
                </div>
              </div>
            ))}
          </div>
        );
      }

      case "reports": {
        const list = reportSubTab === "filed" ? reportsFiled : reportsReceived;
        return (
          <div className="space-y-3">
            <div className="flex gap-2">
              <button onClick={() => setReportSubTab("filed")} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${reportSubTab === "filed" ? "bg-white/[0.08] text-white" : "text-slate-400 hover:text-slate-200"}`}>Filed ({reportsFiled.length})</button>
              <button onClick={() => setReportSubTab("received")} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${reportSubTab === "received" ? "bg-white/[0.08] text-white" : "text-slate-400 hover:text-slate-200"}`}>Received ({reportsReceived.length})</button>
            </div>
            {list.length === 0 && <p className="text-sm text-slate-500 text-center py-8">No reports found</p>}
            {list.map((r) => (
              <div key={r.id} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${r.status === "pending" ? "bg-amber-500/10 text-amber-400" : r.status === "resolved" ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-500/10 text-slate-400"}`}>{r.status}</span>
                  <span className="text-[10px] text-slate-500">{formatDate(r.created_at)}</span>
                </div>
                <p className="text-sm text-slate-300">{r.reason}</p>
                <div className="flex gap-3 mt-2 text-[11px] text-slate-500">
                  <span>Reporter: {r.reporter?.full_name || "—"}</span>
                  <span>Reported: {r.reported?.full_name || "—"}</span>
                  <span>Match: {r.match?.join_code || "—"}</span>
                </div>
              </div>
            ))}
          </div>
        );
      }

      case "audit": {
        return (
          <div className="space-y-3">
            {auditLog.length === 0 && <p className="text-sm text-slate-500 text-center py-8">No audit entries</p>}
            {auditLog.map((a) => (
              <div key={a.id} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-slate-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Activity className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium">{a.action}</p>
                  <p className="text-xs text-slate-500">Target: {a.target_type} · {a.target_id?.slice(0, 8)}</p>
                  {a.details && <p className="text-xs text-slate-500 mt-1 font-mono truncate">{JSON.stringify(a.details)}</p>}
                </div>
                <span className="text-[10px] text-slate-500 whitespace-nowrap">{formatDate(a.created_at)}</span>
              </div>
            ))}
          </div>
        );
      }

      case "notifications": {
        return (
          <div className="space-y-3">
            {notifications.length === 0 && <p className="text-sm text-slate-500 text-center py-8">No notifications</p>}
            {notifications.map((n: any) => (
              <div key={n.id} className={`bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 ${n.is_read ? "opacity-60" : ""}`}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-white">{n.title || "Notification"}</p>
                  <span className={`w-2 h-2 rounded-full ${n.is_read ? "bg-slate-600" : "bg-cyan-400"}`} />
                </div>
                <p className="text-xs text-slate-400">{n.body || "—"}</p>
                <p className="text-[10px] text-slate-500 mt-1">{formatDate(n.created_at)} · {n.type}</p>
              </div>
            ))}
          </div>
        );
      }

      case "export": {
        return (
          <div className="space-y-6 p-1">
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-6 text-center">
              <Database className="w-8 h-8 text-slate-400 mx-auto mb-3" />
              <h4 className="text-lg font-bold text-white mb-1">GDPR Data Export</h4>
              <p className="text-sm text-slate-400 mb-4 max-w-md mx-auto">Download a complete JSON file containing all data associated with this player: profile, matches, transactions, wallet history, reviews, reports, audit log, notifications, and reputation history.</p>
              <button onClick={exportGDPR} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-sm font-semibold hover:from-cyan-500 hover:to-blue-500 transition-all shadow-lg shadow-cyan-500/20 flex items-center gap-2 mx-auto">
                <Download className="w-4 h-4" /> Download JSON
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Profile fields", count: Object.keys(profile).length },
                { label: "Matches", count: matches.length },
                { label: "Transactions", count: transactions.length + walletTransactions.length },
                { label: "Reviews", count: reviewsGiven.length + reviewsReceived.length },
                { label: "Reports", count: reportsFiled.length + reportsReceived.length },
                { label: "Audit entries", count: auditLog.length },
                { label: "Notifications", count: notifications.length },
                { label: "Rep history", count: reputationHistory.length },
              ].map((item) => (
                <div key={item.label} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-white">{item.count}</p>
                  <p className="text-[10px] text-slate-500 uppercase">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        );
      }

      default:
        return null;
    }
  }, [detailLoading, details, detailTab, reviewSubTab, reportSubTab, repOverrideOpen, repNewScore, repReason]);

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
            placeholder="Search name, email, username, phone, join code, UUID…"
            className="pl-9 pr-4 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20 w-80 transition-all"
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
                <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Contact</th>
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
                    <td className="px-5 py-3.5">
                      <div className="text-xs space-y-0.5">
                        <p className="text-slate-400">{p.email || "—"}</p>
                        <p className="text-slate-500">{p.phone_number || "—"}</p>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-300 font-mono">{p.total_matches_played ?? 0}</td>
                    <td className="px-5 py-3.5 text-slate-300 font-mono">{p.reputation_score?.toFixed(1) ?? 0}</td>
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
                        <button onClick={() => openDetail(p)} className="p-2 rounded-lg hover:bg-white/[0.06] transition-colors" title="Deep Profile">
                          <Eye className="w-3.5 h-3.5 text-cyan-400" />
                        </button>
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

      {/* Deep profile modal */}
      {detailModalOpen && detailPlayer && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 md:p-6" onClick={() => setDetailModalOpen(false)}>
          <div className="bg-[#0F172A] border border-white/10 rounded-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <button onClick={() => setDetailModalOpen(false)} className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors">
                  <ChevronLeft className="w-4 h-4 text-slate-400" />
                </button>
                <div>
                  <h2 className="text-base font-bold text-white">{detailPlayer.full_name || detailPlayer.username || "Player Profile"}</h2>
                  <p className="text-xs text-slate-500">ID: {detailPlayer.id}</p>
                </div>
              </div>
              <button onClick={() => setDetailModalOpen(false)} className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 px-5 py-2 border-b border-white/[0.06] overflow-x-auto">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setDetailTab(t.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    detailTab === t.key ? "bg-white/[0.08] text-white" : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
                  }`}
                >
                  <t.icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5">
              {renderDetailContent()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
