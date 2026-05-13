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
import AdminLayout from "@/components/admin/AdminLayout";
import AdminOverview from "@/pages/admin/AdminOverview";
import AdminLiveMonitor from "@/pages/admin/AdminLiveMonitor";
import AdminPlayers from "@/pages/admin/AdminPlayers";
import AdminMatches from "@/pages/admin/AdminMatches";
import AdminVenues from "@/pages/admin/AdminVenues";
import AdminPayments from "@/pages/admin/AdminPayments";
import AdminReports from "@/pages/admin/AdminReports";
import AdminBroadcast from "@/pages/admin/AdminBroadcast";
import { useTheme } from "@/components/ThemeToggle";
import { AuthProvider } from "@/hooks/useAuth";
import { AuthModal } from "@/components/AuthModal";
import { SplashScreen } from "@/components/SplashScreen";
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
              {/* Admin dashboard */}
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<AdminOverview />} />
                <Route path="live" element={<AdminLiveMonitor />} />
                <Route path="players" element={<AdminPlayers />} />
                <Route path="matches" element={<AdminMatches />} />
                <Route path="venues" element={<AdminVenues />} />
                <Route path="payments" element={<AdminPayments />} />
                <Route path="reports" element={<AdminReports />} />
                <Route path="broadcast" element={<AdminBroadcast />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
            </RouteFade>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
