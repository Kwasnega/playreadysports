import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import JoinMatch from "./pages/JoinMatch.tsx";
import HaveCode from "./pages/HaveCode.tsx";
import CreateMatch from "./pages/CreateMatch.tsx";
import Lobby from "./pages/Lobby.tsx";
import Schedule from "./pages/Schedule.tsx";
import Terms from "./pages/Terms.tsx";
import PlayerProfile from "./pages/PlayerProfile.tsx";
import EditProfile from "./pages/EditProfile.tsx";
import WalletPage from "./pages/Wallet.tsx";
import VenueOwnerDashboard from "./pages/VenueOwnerDashboard.tsx";
import Leaderboard from "./pages/Leaderboard.tsx";
import AdminLayout from "@/components/admin/AdminLayout";
import AdminOverview from "@/pages/admin/AdminOverview";
import AdminLiveMonitor from "@/pages/admin/AdminLiveMonitor";
import AdminPlayers from "@/pages/admin/AdminPlayers";
import AdminMatches from "@/pages/admin/AdminMatches";
import AdminVenues from "@/pages/admin/AdminVenues";
import AdminRevenue from "@/pages/admin/AdminRevenue";
import AdminCalendar from "@/pages/admin/AdminCalendar";
import AdminReports from "@/pages/admin/AdminReports";
import AdminBroadcast from "@/pages/admin/AdminBroadcast";
import AdminWithdrawals from "@/pages/admin/AdminWithdrawals";
import AdminSettings from "@/pages/admin/AdminSettings";
import AdminCreateOwner from "@/pages/admin/AdminCreateOwner";
import AdminVenueDetail from "@/pages/admin/AdminVenueDetail";
import { useTheme } from "@/components/ThemeToggle";
import { AuthProvider } from "@/hooks/useAuth";
import { AuthModal } from "@/components/AuthModal";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { SplashScreen } from "@/components/SplashScreen";
import { ConfirmProvider } from "@/components/ui/ConfirmProvider";
import { useEffect, useRef, useState, ReactNode } from "react";
import { gsap } from "gsap";

const queryClient = new QueryClient();

/** Soft fade between routes. */
const RouteFade = ({ children }: { children: ReactNode }) => {
  const loc = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce) return;
    gsap.fromTo(el, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.45, ease: "power3.out" });
  }, [loc.pathname]);
  return <div ref={ref}>{children}</div>;
};

const App = () => {
  useTheme();
  const [splashDone, setSplashDone] = useState(false);
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
        <BrowserRouter>
          <AuthProvider>
            <AuthModal />
            <ConfirmProvider>
              <RouteFade>
              <Routes>
                {/* Public homepage — main screen visible on first load */}
                <Route path="/" element={<Index />} />
                <Route path="/home" element={<Navigate to="/" replace />} />
                <Route path="/welcome" element={<Navigate to="/" replace />} />
                <Route path="/login" element={<Navigate to="/" replace />} />
                <Route path="/terms" element={<Terms />} />
                {/* Restricted actions — modal triggers on entry */}
                {/* Browseable without auth — actions inside gate via requireAuth */}
                <Route path="/join" element={<JoinMatch />} />
                <Route path="/code" element={<HaveCode />} />
                <Route path="/create" element={<CreateMatch />} />
                <Route path="/schedule" element={<Schedule />} />
                <Route path="/lobby/:code" element={<Lobby />} />
                <Route path="/player/:username" element={<PlayerProfile />} />
                <Route path="/profile/edit" element={<EditProfile />} />
                <Route path="/wallet" element={<WalletPage />} />
                <Route path="/venue/earnings" element={<VenueOwnerDashboard />} />
                <Route path="/venue/dashboard" element={<VenueOwnerDashboard />} />
                <Route path="/turf/owner" element={<Navigate to="/venue/dashboard" replace />} />
                <Route path="/leaderboard" element={<Leaderboard />} />
                {/* Admin dashboard */}
                <Route path="/admin" element={<ProtectedRoute roles={["admin", "super_admin"]}><AdminLayout /></ProtectedRoute>}>
                  <Route index element={<AdminOverview />} />
                  <Route path="live" element={<AdminLiveMonitor />} />
                  <Route path="players" element={<AdminPlayers />} />
                  <Route path="matches" element={<AdminMatches />} />
                  <Route path="venues" element={<AdminVenues />} />
                  <Route path="venues/:id" element={<AdminVenueDetail />} />
                  <Route path="revenue" element={<AdminRevenue />} />
                  <Route path="calendar" element={<AdminCalendar />} />
                  <Route path="reports" element={<AdminReports />} />
                  <Route path="broadcast" element={<AdminBroadcast />} />
                  <Route path="withdrawals" element={<AdminWithdrawals />} />
                  <Route path="settings" element={<AdminSettings />} />
                  <Route path="owners" element={<AdminCreateOwner />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
              </RouteFade>
            </ConfirmProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
