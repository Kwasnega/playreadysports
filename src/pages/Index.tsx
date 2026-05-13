import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import {
  Home, User, LogIn, Bell, Trophy, Zap, UserPlus, CalendarDays, KeyRound,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NearYou } from "@/components/NearYou";
import { ProfileSheet } from "@/components/ProfileSheet";
import { useAuth } from "@/hooks/useAuth";
import { useEnter } from "@/hooks/useReveal";
import { NotificationsBell } from "@/components/NotificationsBell";
import { useNotifications } from "@/hooks/useNotifications";
import { useHomeMatches, HomeMatch } from "@/hooks/useHomeMatches";
import { useUserLocation } from "@/hooks/useUserLocation";
import { useHomeStats } from "@/hooks/useHomeStats";
import { supabase } from "@/integrations/supabase/client";
import {
  getFormattedTime,
  getActiveCoreCount,
  getGalaTeamsIn,
  getGalaMaxTeams,
  getDistanceKm,
  extractFormatNumber,
} from "@/lib/matchHelpers";
import logoLight from "@/assets/playready-logo-light.jpg";
import logoDark from "@/assets/playready-logo-dark.jpg";

const Nav = () => {
  const { user, openAuth } = useAuth();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) { setAvatarUrl(null); return; }
    supabase
      .from("profiles")
      .select("avatar_url, full_name")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data?.avatar_url) setAvatarUrl(data.avatar_url);
        else setAvatarUrl(null);
      });
  }, [user?.id]);

  const fullName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Guest";
  const initial = (fullName[0] || "?").toUpperCase();

  return (
    <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-md">
      <div className="max-w-[680px] mx-auto px-5 h-16 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2.5">
          <img src={logoLight} alt="" className="w-9 h-9 rounded-xl object-cover dark:hidden" />
          <img src={logoDark} alt="" className="w-9 h-9 rounded-xl object-cover hidden dark:block" />
          <span className="font-display font-extrabold text-[17px] tracking-tight">PlayReady</span>
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <NotificationsBell />
          {user ? (
            <ProfileSheet
              trigger={
                <button className="p-1 rounded-full hover:bg-secondary" aria-label="Open profile">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-xs font-bold">
                      {initial}
                    </div>
                  )}
                </button>
              }
            />
          ) : (
            <button
              onClick={() => openAuth("signin")}
              className="ml-1 inline-flex items-center gap-1.5 bg-foreground text-background rounded-full px-3.5 py-1.5 text-xs font-semibold"
            >
              <LogIn className="w-3.5 h-3.5" /> Sign in
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

/* Hero — clean and confident. The italic serif is the brand signature; nothing
   else competes for attention. A single live ticker chip below the headline
   replaces the prose paragraph and the vanity stats strip. */
const Hero = ({ liveCount }: { liveCount: number }) => {
  const ref = useEnter<HTMLDivElement>({ y: 24 });
  return (
    <section className="relative px-5 pt-2 pb-5">
      <div ref={ref} className="relative max-w-[680px] mx-auto">
        <h1 className="display-xl text-[44px] sm:text-[52px] mt-2 leading-[0.95]">
          Find your<br/>
          <span className="italic font-display">match.</span>
        </h1>
        <a
          href="#near-you"
          className="inline-flex items-center gap-2 mt-4 bg-primary/10 text-primary rounded-full pl-2.5 pr-3.5 py-1.5 text-[12px] font-semibold hover:bg-primary/15 transition-colors"
        >
          <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground inline-flex items-center justify-center">
            <Zap className="w-3 h-3" strokeWidth={2.6} />
          </span>
          {liveCount > 0
            ? `${liveCount} match${liveCount === 1 ? "" : "es"} starting near you`
            : "No matches nearby right now — create one"}
        </a>
      </div>
    </section>
  );
};

/* Primary action tiles — Join + Create. "Have a code?" is embedded as a
   secondary affordance inside the Join tile so it stays discoverable without
   stealing top-level real estate. */
const QuickActions = () => {
  const nav = useNavigate();
  const { user } = useAuth();
  const goCreate = () => nav("/create");
  const goJoin = () => nav("/join");
  const goCode = () => nav("/code");
  return (
    <section className="px-5 pt-4">
      <div className="max-w-[680px] mx-auto space-y-2.5">
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={goJoin}
            className="group relative text-left rounded-2xl bg-secondary hover:bg-secondary/80 transition-all active:scale-[0.99] p-5 min-h-[124px] overflow-hidden"
          >
            <div className="flex items-center gap-3">
              <span className="w-11 h-11 rounded-xl bg-foreground text-background inline-flex items-center justify-center">
                <UserPlus className="w-5 h-5" strokeWidth={2.4} />
              </span>
              <span className="font-display font-bold text-base">Join match</span>
            </div>
            <p className="text-xs text-muted-foreground mt-3 leading-snug">
              Browse the broadcast list near you.
            </p>
          </button>
          <button
            onClick={goCreate}
            className="group relative text-left rounded-2xl bg-foreground text-background hover:bg-foreground/90 transition-all active:scale-[0.99] p-5 min-h-[124px] overflow-hidden"
          >
            <div className="flex items-center gap-3">
              <span className="w-11 h-11 rounded-xl bg-background/15 inline-flex items-center justify-center">
                <CalendarDays className="w-5 h-5" strokeWidth={2.4} />
              </span>
              <span className="font-display font-bold text-base">Create match</span>
            </div>
            <p className="text-xs text-background/70 mt-3 leading-snug">
              Pick a turf, time, and broadcast it.
            </p>
          </button>
        </div>
        <button
          onClick={goCode}
          className="w-full inline-flex items-center justify-between gap-2 h-12 rounded-2xl bg-primary/10 hover:bg-primary/15 transition-colors px-4 active:scale-[0.99]"
        >
          <span className="inline-flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-lg bg-primary text-primary-foreground inline-flex items-center justify-center">
              <KeyRound className="w-3.5 h-3.5" strokeWidth={2.6} />
            </span>
            <span className="text-sm font-semibold text-foreground">Have a code?</span>
          </span>
          <span className="text-[11px] font-semibold text-primary">Enter →</span>
        </button>
      </div>
    </section>
  );
};

const MobileTabs = () => {
  const { unreadCount } = useNotifications();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-background/95 backdrop-blur-md border-t border-border">
      <div className="max-w-[680px] mx-auto grid grid-cols-4 h-16">
        {[
          { to: "/", icon: Home, label: "Home", active: true },
          { to: "/schedule", icon: Trophy, label: "Matches" },
        ].map(t => (
          <Link key={t.to} to={t.to} className={`flex flex-col items-center justify-center gap-1 ${t.active ? "text-foreground" : "text-muted-foreground"}`}>
            <t.icon className="w-5 h-5" strokeWidth={t.active ? 2.4 : 2} />
            <span className="text-[10px] font-semibold">{t.label}</span>
          </Link>
        ))}
        <button
          onClick={() => document.querySelector<HTMLButtonElement>('[aria-label="Notifications"]')?.click()}
          className="relative flex flex-col items-center justify-center gap-1 text-muted-foreground"
          aria-label="Open notifications"
        >
          <span className="relative">
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold leading-[16px] text-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </span>
          <span className="text-[10px] font-semibold">Alerts</span>
        </button>
        <ProfileSheet
          trigger={
            <button className="flex flex-col items-center justify-center gap-1 text-muted-foreground" aria-label="Open profile">
              <User className="w-5 h-5" />
              <span className="text-[10px] font-semibold">Profile</span>
            </button>
          }
        />
      </div>
    </nav>
  );
};

/* Transform Supabase match rows into the Item shape NearYou expects */
function transformMatches(
  matches: HomeMatch[],
  userLat: number,
  userLng: number,
  userId?: string
): Parameters<typeof NearYou>[0]["items"] {
  const isJoined = (m: HomeMatch) =>
    userId ? m.participants.some((p) => p.user_id === userId && p.status === "active") : false;

  return matches
    .filter((m) => m.venue)
    .map((m) => {
      const venue = m.venue!;
      const km =
        venue.lat && venue.lng
          ? getDistanceKm(userLat, userLng, venue.lat, venue.lng)
          : 0;
      const joined = isJoined(m);

      if (m.match_mode === "gala") {
        return {
          kind: "gala" as const,
          id: m.id,
          code: m.join_code,
          venue: venue.name,
          area: venue.area ?? venue.city ?? "",
          time: getFormattedTime(m.match_date),
          format: extractFormatNumber(m.format) as "5" | "7",
          teamsIn: getGalaTeamsIn(m),
          capTeams: getGalaMaxTeams(m),
          pricePerPlayer: Number(m.entry_fee),
          km,
          joined,
        };
      }

      return {
        kind: "two-team" as const,
        id: m.id,
        code: m.join_code,
        venue: venue.name,
        area: venue.area ?? venue.city ?? "",
        time: getFormattedTime(m.match_date),
        format: m.format,
        filled: getActiveCoreCount(m),
        cap: m.max_core_players ?? m.players_per_side ?? 10,
        pricePerPlayer: Number(m.entry_fee),
        km,
        joined,
      };
    });
}

/* Live stats bar */
const LiveStatsBar = ({ matches, players }: { matches: number; players: number }) => (
  <section className="px-5 pt-3 pb-1">
    <div className="max-w-[680px] mx-auto">
      <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3.5 py-1.5 text-xs font-semibold text-primary">
        <span>⚽</span>
        <span>
          {matches} match{matches === 1 ? "" : "es"} tonight · {players} player{players === 1 ? "" : "s"} online
        </span>
      </div>
    </div>
  </section>
);

const Index = () => {
  const { matches, loading: matchesLoading } = useHomeMatches();
  const { location } = useUserLocation();
  const { stats } = useHomeStats();
  const { user } = useAuth();

  const userLat = location?.lat ?? 5.6037; // Accra default
  const userLng = location?.lng ?? -0.187;

  const liveCount = matches.filter((m) => m.status === "live").length;
  const feedItems = transformMatches(matches, userLat, userLng, user?.id);

  return (
    <main className="min-h-screen bg-background pb-20">
      <Nav />
      <Hero liveCount={liveCount} />
      <QuickActions />
      <LiveStatsBar matches={stats.matchesToday} players={stats.playersOnline} />
      <div id="near-you">
        <NearYou variant="curated" limit={3} items={feedItems} isLoading={matchesLoading} />
      </div>
      <MobileTabs />
    </main>
  );
};

export default Index;
