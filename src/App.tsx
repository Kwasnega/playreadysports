import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useTheme } from "@/components/ThemeToggle";
import { AuthProvider, setAuthQueryClient } from "@/hooks/useAuth";
import { AuthModal } from "@/components/AuthModal";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { SplashScreen } from "@/components/SplashScreen";
import { ConfirmProvider } from "@/components/ui/ConfirmProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useEffect, useRef, useState, ReactNode, lazy, Suspense } from "react";

const Index = lazy(() => import("./pages/Index.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const JoinMatch = lazy(() => import("./pages/JoinMatch.tsx"));
const HaveCode = lazy(() => import("./pages/HaveCode.tsx"));
const CreateMatch = lazy(() => import("./pages/CreateMatch.tsx"));
const Lobby = lazy(() => import("./pages/Lobby.tsx"));
const Schedule = lazy(() => import("./pages/Schedule.tsx"));
const Terms = lazy(() => import("./pages/Terms.tsx"));
const PlayerProfile = lazy(() => import("./pages/PlayerProfile.tsx"));
const EditProfile = lazy(() => import("./pages/EditProfile.tsx"));
const WalletPage = lazy(() => import("./pages/Wallet.tsx"));
const VenueOwnerDashboard = lazy(() => import("./pages/VenueOwnerDashboard.tsx"));
const MyMatches = lazy(() => import("./pages/MyMatches.tsx"));
const Leaderboard = lazy(() => import("./pages/Leaderboard.tsx"));
const AdminLayout = lazy(() => import("@/components/admin/AdminLayout"));
const AdminOverview = lazy(() => import("@/pages/admin/AdminOverview"));
const AdminLiveMonitor = lazy(() => import("@/pages/admin/AdminLiveMonitor"));
const AdminPlayers = lazy(() => import("@/pages/admin/AdminPlayers"));
const AdminMatches = lazy(() => import("@/pages/admin/AdminMatches"));
const AdminVenues = lazy(() => import("@/pages/admin/AdminVenues"));
const AdminRevenue = lazy(() => import("@/pages/admin/AdminRevenue"));
const AdminCalendar = lazy(() => import("@/pages/admin/AdminCalendar"));
const AdminReports = lazy(() => import("@/pages/admin/AdminReports"));
const AdminBroadcast = lazy(() => import("@/pages/admin/AdminBroadcast"));
const AdminWithdrawals = lazy(() => import("@/pages/admin/AdminWithdrawals"));
const AdminSettings = lazy(() => import("@/pages/admin/AdminSettings"));
const AdminCreateOwner = lazy(() => import("@/pages/admin/AdminCreateOwner"));
const AdminVenueDetail = lazy(() => import("@/pages/admin/AdminVenueDetail"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Share the QueryClient with useAuth so TOKEN_REFRESHED events can
// invalidate all stale queries and force a clean re-fetch.
setAuthQueryClient(queryClient);

const PageSpinner = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="w-6 h-6 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />
  </div>
);

/** CSS-based route fade — no GSAP dependency. */
const RouteFade = ({ children }: { children: ReactNode }) => {
  const loc = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce) return;
    el.style.opacity = "0";
    el.style.transform = "translateY(6px)";
    const raf = requestAnimationFrame(() => {
      el.style.transition = "opacity 0.35s ease, transform 0.35s ease";
      el.style.opacity = "1";
      el.style.transform = "translateY(0)";
    });
    return () => cancelAnimationFrame(raf);
  }, [loc.pathname]);
  return <div ref={ref}>{children}</div>;
};

const App = () => {
  useTheme();
  const [splashDone, setSplashDone] = useState(() => {
    try { return sessionStorage.getItem("prs_splash_seen") === "1"; } catch { return false; }
  });
  const handleSplashDone = () => {
    try { sessionStorage.setItem("prs_splash_seen", "1"); } catch {}
    setSplashDone(true);
  };
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        {!splashDone && <SplashScreen onDone={handleSplashDone} />}
        <BrowserRouter>
          <AuthProvider>
            <AuthModal />
            <ConfirmProvider>
              <ErrorBoundary>
              <Suspense fallback={<PageSpinner />}>
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
                <Route path="/my-matches" element={<MyMatches />} />
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
              </Suspense>
              </ErrorBoundary>
            </ConfirmProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
