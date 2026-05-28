import { useState } from "react";
import { Link, useLocation, Outlet } from "react-router-dom";
import { useAdmin } from "@/hooks/useAdmin";
import {
  LayoutDashboard, Users, Trophy, MapPin, CreditCard, Flag, Megaphone, ChevronLeft, ChevronRight, LogOut, Shield,
  Radio, ArrowDownLeft, BarChart3, CalendarDays, Settings, UserPlus, AlertTriangle,
} from "lucide-react";

const links = [
  { to: "/admin", icon: LayoutDashboard, label: "Overview" },
  { to: "/admin/live", icon: Radio, label: "Live Monitor" },
  { to: "/admin/players", icon: Users, label: "Players" },
  { to: "/admin/matches", icon: Trophy, label: "Matches" },
  { to: "/admin/venues", icon: MapPin, label: "Venues" },
  { to: "/admin/owners", icon: UserPlus, label: "Create owner" },
  { to: "/admin/settings", icon: Settings, label: "Settings" },
  { to: "/admin/revenue", icon: BarChart3, label: "Revenue" },
  { to: "/admin/withdrawals", icon: ArrowDownLeft, label: "Withdrawals" },
  { to: "/admin/disputes", icon: AlertTriangle, label: "Disputes" },
  { to: "/admin/calendar", icon: CalendarDays, label: "Calendar" },
  { to: "/admin/reports", icon: Flag, label: "Reports" },
  { to: "/admin/broadcast", icon: Megaphone, label: "Broadcast" },
];

export default function AdminLayout() {
  const { isAdmin, loading } = useAdmin();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#070B14]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin" />
          <p className="text-sm text-slate-400 font-medium">Loading admin panel…</p>
        </div>
      </div>
    );
  }
  if (!isAdmin) return null;

  return (
    <div className="min-h-screen flex bg-[#070B14]">
      {/* Sidebar */}
      <aside
        className="shrink-0 flex flex-col justify-between transition-all duration-300 border-r border-white/[0.06] relative"
        style={{ width: collapsed ? 72 : 260, background: "linear-gradient(180deg, #0B1120 0%, #0F172A 100%)" }}
      >
        <div className="relative">
          {/* Top glow */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
          
          <div className="h-[68px] flex items-center px-5 border-b border-white/[0.06]">
            <div className={`flex items-center gap-3 transition-opacity duration-200 ${collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100"}`}>
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <Shield className="w-4 h-4 text-white" />
              </div>
              <div>
                <span className="text-white font-display font-bold text-sm tracking-tight block leading-none">PlayReady</span>
                <span className="text-[10px] text-emerald-400/80 font-medium uppercase tracking-wider">Admin Panel</span>
              </div>
            </div>
            {collapsed && (
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20 mx-auto">
                <Shield className="w-4 h-4 text-white" />
              </div>
            )}
          </div>
          
          <nav className="p-3 space-y-1">
            {links.map((l) => {
              const active = location.pathname === l.to || (l.to !== "/admin" && location.pathname.startsWith(l.to));
              return (
                <Link
                  key={l.to}
                  to={l.to}
                  className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative overflow-hidden ${
                    active 
                      ? "text-white bg-white/[0.08] shadow-[0_0_20px_rgba(16,185,129,0.08)]" 
                      : "text-slate-400 hover:text-white hover:bg-white/[0.04]"
                  }`}
                  title={collapsed ? l.label : undefined}
                >
                  {active && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-gradient-to-b from-emerald-400 to-teal-500 rounded-r-full" />
                  )}
                  <l.icon className={`w-[18px] h-[18px] shrink-0 transition-colors ${active ? "text-emerald-400" : "text-slate-500 group-hover:text-slate-300"}`} />
                  {!collapsed && <span>{l.label}</span>}
                  {active && !collapsed && (
                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
        
        <div className="p-3 border-t border-white/[0.06]">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl text-slate-500 hover:text-white hover:bg-white/[0.04] transition-all text-xs font-medium"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <><ChevronLeft className="w-4 h-4" /> Collapse sidebar</>}
          </button>
          <Link 
            to="/" 
            className={`mt-2 flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium text-slate-500 hover:text-red-400 hover:bg-red-500/5 transition-all ${collapsed ? "justify-center" : ""}`}
          >
            <LogOut className="w-4 h-4" />
            {!collapsed && <span>Exit to App</span>}
          </Link>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
