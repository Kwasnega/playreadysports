import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect, useMemo, useCallback } from "react";
import { CityPrompt } from "@/components/CityPrompt";
import {
  Home, User, LogIn, Trophy, Zap, UserPlus, CalendarDays, KeyRound, Sparkles, MapPin, Clock, Wallet, Users, Award,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NearYou } from "@/components/NearYou";
import { ProfileSheet } from "@/components/ProfileSheet";
import { useAuth } from "@/hooks/useAuth";
import { useFriends } from "@/hooks/useFriends";
import { useEnter } from "@/hooks/useReveal";
import { NotificationsBell } from "@/components/NotificationsBell";
import { FriendsSheet } from "@/components/FriendsSheet";
import { useHomeMatches, HomeMatch } from "@/hooks/useHomeMatches";
import { useHomeFeed } from "@/hooks/useHomeFeed";
import { useWallet } from "@/hooks/useWallet";
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
  const { balance } = useWallet();
  const { pendingRequests } = useFriends();
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
          <img src={logoLight} alt="" className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl object-cover dark:hidden" />
          <img src={logoDark} alt="" className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl object-cover hidden dark:block" />
          <span className="font-display font-extrabold text-[15px] sm:text-[17px] tracking-tight">PLAYREADYSPORTS</span>
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          {user && (
            <Link to="/wallet" className="ml-1 inline-flex items-center gap-1.5 bg-gold text-gold-foreground rounded-full px-2.5 py-1.5 text-xs font-semibold hover:opacity-90">
              <Wallet className="w-3.5 h-3.5" />
              <span>₵{balance.toFixed(2)}</span>
            </Link>
          )}
          {!user && (
            <button
              onClick={() => openAuth("signin")}
              className="ml-1 inline-flex items-center gap-1.5 bg-foreground text-background rounded-full px-4 py-2 text-xs font-bold transition-all active:scale-95 shadow-sm"
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
  const { user } = useAuth();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) { setAvatarUrl(null); return; }
    supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data?.avatar_url) setAvatarUrl(data.avatar_url);
        else setAvatarUrl(null);
      });
  }, [user?.id]);

  const fullName = user?.user_metadata?.full_name || "Player";
  const initial = (fullName[0] || "?").toUpperCase();

  return (
    <section className="relative px-5 pt-2 pb-5">
      <div ref={ref} className="relative max-w-[680px] mx-auto flex items-start justify-between gap-4">
        <div>
          <h1 className="display-xl text-[40px] sm:text-[44px] md:text-[52px] mt-2 leading-[0.95]">
            <span className="italic font-display">Find your match.</span>
          </h1>
          <a
            href="#near-you"
            className="inline-flex items-center gap-2 mt-4 bg-primary/8 border border-primary/15 text-primary rounded-full pl-2.5 pr-3.5 py-1.5 text-[12px] font-semibold hover:bg-primary/15 transition-colors"
          >
            <span className="w-5 h-5 rounded-lg bg-primary text-primary-foreground inline-flex items-center justify-center">
              <Zap className="w-3 h-3" strokeWidth={2.6} />
            </span>
            {liveCount > 0
              ? `${liveCount} match${liveCount === 1 ? "" : "es"} starting near you`
              : "No matches nearby right now — create one"}
          </a>
        </div>
        
        {user && (
          <div className="shrink-0 pt-3">
            <ProfileSheet
              trigger={
                <button className="flex flex-col items-center gap-2 group outline-none" aria-label="Open profile">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover border-2 border-border group-hover:border-foreground transition-colors grayscale-[0.2]" />
                  ) : (
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full border-2 border-foreground bg-background flex items-center justify-center font-display font-black text-2xl sm:text-3xl group-hover:bg-foreground group-hover:text-background transition-colors">
                      {initial}
                    </div>
                  )}
                  <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground group-hover:text-foreground transition-colors">
                    {fullName.split(' ')[0]}
                  </span>
                </button>
              }
            />
          </div>
        )}
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
      <div className="max-w-[680px] mx-auto space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={goJoin}
            className="group relative text-left rounded-2xl bg-secondary hover:bg-secondary/80 border border-border transition-all active:scale-[0.99] p-5 min-h-[130px] flex flex-col justify-between"
          >
            <div className="w-10 h-10 rounded-full bg-background border border-border flex items-center justify-center shadow-sm">
              <UserPlus className="w-5 h-5 text-foreground" />
            </div>
            <div>
              <span className="font-display font-black text-lg tracking-tight text-foreground block mb-1">Join Match</span>
              <p className="text-[11px] font-medium text-muted-foreground leading-snug">
                Browse the broadcast list near you.
              </p>
            </div>
          </button>
          <button
            onClick={goCreate}
            className="group relative text-left rounded-2xl bg-foreground text-background transition-all hover:bg-foreground/90 active:scale-[0.99] p-5 min-h-[130px] shadow-md flex flex-col justify-between"
          >
            <div className="w-10 h-10 rounded-full bg-background/10 flex items-center justify-center">
              <CalendarDays className="w-5 h-5 text-background" />
            </div>
            <div>
              <span className="font-display font-black text-lg tracking-tight block mb-1">Create Match</span>
              <p className="text-[11px] font-medium text-background/70 leading-snug">
                Pick a turf, time, and broadcast it.
              </p>
            </div>
          </button>
        </div>
        <button
          onClick={goCode}
          className="w-full inline-flex items-center justify-between gap-2 h-14 rounded-2xl bg-background border border-border hover:border-foreground/40 transition-colors px-5 active:scale-[0.99] shadow-sm group"
        >
          <span className="inline-flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
              <KeyRound className="w-4 h-4 text-foreground" />
            </span>
            <span className="text-sm font-bold text-foreground">Have an invite code?</span>
          </span>
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground group-hover:text-foreground transition-colors">Enter →</span>
        </button>
      </div>
    </section>
  );
};

const MobileTabs = () => {
  const loc = window.location.pathname;
  const isActive = (path: string) => loc === path;
  const { pendingRequests } = useFriends();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-background/95 backdrop-blur-md border-t border-border">
      <div className="max-w-[680px] mx-auto grid grid-cols-5 h-16">
        {[
          { to: "/", icon: Home, label: "Home" },
          { to: "/schedule", icon: Trophy, label: "Schedule" },
          // HIDDEN — Leaderboard: re-enable when feature is released
          // { to: "/leaderboard", icon: Award, label: "Ranks" },
        ].map((t) => (
          <Link
            key={t.to}
            to={t.to}
            className={`flex flex-col items-center justify-center gap-1 ${isActive(t.to) ? "text-foreground" : "text-muted-foreground"}`}
          >
            <t.icon className="w-5 h-5" strokeWidth={isActive(t.to) ? 2.4 : 2} />
            <span className="text-[9px] font-black uppercase tracking-widest">{t.label}</span>
          </Link>
        ))}
        <FriendsSheet
          trigger={
            <button className="flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground" aria-label="Open friends">
              <div className="relative">
                <Users className="w-5 h-5" />
                {pendingRequests.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] px-1 rounded-full border-2 border-background bg-foreground text-background text-[8px] font-black leading-[12px] text-center flex items-center justify-center">
                    {pendingRequests.length > 9 ? "9+" : pendingRequests.length}
                  </span>
                )}
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest">Friends</span>
            </button>
          }
        />
        <NotificationsBell variant="tab" />
        <ProfileSheet
          trigger={
            <button className="flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground" aria-label="Open profile">
              <User className="w-5 h-5" />
              <span className="text-[9px] font-black uppercase tracking-widest">Profile</span>
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
  userId?: string,
  friendIds?: Set<string>
): Parameters<typeof NearYou>[0]["items"] {
  const isJoined = (m: HomeMatch) =>
    userId ? m.participants.some((p) => p.user_id === userId && p.status === "active") : false;

  const getFriendInfo = (m: HomeMatch) => {
    if (!friendIds) return { friendCount: 0, friendAvatars: [] };
    const count = m.participants.filter(
      (p) => friendIds.has(p.user_id) && p.status === "active"
    ).length;
    return { friendCount: count, friendAvatars: [] };
  };

  return matches
    .filter((m) => m.venue)
    .map((m) => {
      const venue = m.venue!;
      const km =
        venue.lat && venue.lng
          ? getDistanceKm(userLat, userLng, venue.lat, venue.lng)
          : 0;
      const joined = isJoined(m);
      const { friendCount, friendAvatars } = getFriendInfo(m);

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
          isOrganizer: m.organizer_id === userId,
          friendCount,
          friendAvatars,
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
        isOrganizer: m.organizer_id === userId,
        friendCount,
        friendAvatars,
      };
    });
}

/* Live stats bar */
const LiveStatsBar = ({ matches, players }: { matches: number; players: number }) => (
  <section className="px-5 pt-4 pb-1">
    <div className="max-w-[680px] mx-auto">
      <div className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-border px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-foreground shadow-sm">
        <span><Trophy className="w-3 h-3" /></span>
        <span>
          {matches} Match{matches === 1 ? "" : "es"} Tonight · {players} Player{players === 1 ? "" : "s"} Online
        </span>
      </div>
    </div>
  </section>
);

/* Smart recommendations rail */
const RecommendationsRail = ({ recommendations, loading }: { recommendations: any[]; loading: boolean }) => {
  const navigate = useNavigate();
  if (loading) return null;
  if (recommendations.length === 0) return null;

  return (
    <section className="px-5 pt-5 pb-3">
      <div className="max-w-[680px] mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1.5 h-1.5 rounded-full bg-foreground" />
          <h2 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">For You</h2>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-3 -mx-5 px-5 scrollbar-hide">
          {recommendations.map((m) => (
            <button
              key={m.id}
              onClick={() => navigate(`/lobby/${m.join_code}`)}
              className="flex-shrink-0 w-[260px] bg-card rounded-2xl border-[1.5px] border-border p-4 text-left hover:border-foreground/40 transition-all shadow-sm group"
            >
              <div className="flex items-center justify-between mb-3 border-b border-border pb-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-foreground border border-border px-1.5 py-0.5 rounded-sm">
                  {m.match_mode === "gala" ? "Gala" : "Two-team"}
                </span>
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{m.reason}</span>
              </div>
              <p className="font-display font-black text-lg tracking-tight truncate text-foreground leading-none mb-1.5">{m.venue?.name ?? "Venue"}</p>
              <p className="text-[11px] font-bold text-muted-foreground truncate flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {m.venue?.area ?? m.venue?.city ?? ""}
              </p>
              <div className="flex items-center gap-3 mt-4 text-[11px] font-bold text-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" /> {getFormattedTime(m.match_date)}
                </span>
                <span className="flex items-center gap-1">
                  <Wallet className="w-3.5 h-3.5 text-muted-foreground" />
                  {m.entry_fee > 0 ? `₵${m.entry_fee}` : "Free"}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};

const Index = () => {
  const [showCityPrompt, setShowCityPrompt] = useState(false);
  const navigate = useNavigate();
  const { isTurfOwner } = useAuth();

  // Redirect turf owners straight to their dashboard
  useEffect(() => {
    if (isTurfOwner) {
      navigate("/venue/dashboard", { replace: true });
    }
  }, [isTurfOwner, navigate]);

  const {
    user,
    matches,
    matchesLoading,
    hasMore,
    loadMore,
    isLoadingMore,
    location,
    stats,
    friends,
    recommendations,
    recsLoading,
  } = useHomeFeed();

  const userLat = location?.lat ?? 5.6037; // Accra default
  const userLng = location?.lng ?? -0.187;

  useEffect(() => {
    if (!user) return;
    const key = `prs_city_prompted_${user.id}`;
    if (sessionStorage.getItem(key)) return;
    supabase.from("profiles").select("city").eq("id", user.id).single()
      .then(({ data }) => {
        if (!data?.city) setShowCityPrompt(true);
      });
  }, [user]);

  const dismissCityPrompt = useCallback(() => {
    if (user) sessionStorage.setItem(`prs_city_prompted_${user.id}`, "1");
    setShowCityPrompt(false);
  }, [user]);

  const liveCount = matches.filter((m) => {
    const isActive = !['ended', 'cancelled', 'archived'].includes(m.intelligent_status || '');
    if (!isActive) return false;
    const venue = m.venue;
    if (!venue?.lat || !venue?.lng) return false;
    return getDistanceKm(userLat, userLng, venue.lat, venue.lng) <= 20;
  }).length;
  const friendIds = useMemo(() => new Set(friends.map((f) => f.id)), [friends]);
  const feedItems = transformMatches(matches, userLat, userLng, user?.id, friendIds);
  console.log('Feed items count:', feedItems.length, 'Matches count:', matches.length);

  return (
    <main className="min-h-screen bg-background pb-20">
      {showCityPrompt && <CityPrompt onDone={dismissCityPrompt} onSkip={dismissCityPrompt} />}
      <Nav />
      <Hero liveCount={liveCount} />
      <QuickActions />
      <LiveStatsBar matches={stats.matchesToday} players={stats.playersOnline} />
      <RecommendationsRail recommendations={recommendations} loading={recsLoading} />
      <div id="near-you">
        <NearYou variant="curated" limit={undefined} items={feedItems} isLoading={matchesLoading} />
        {hasMore && (
          <div className="max-w-[680px] mx-auto px-5 pt-3 pb-2">
            <button
              onClick={loadMore}
              disabled={isLoadingMore}
              className="w-full py-2.5 rounded-xl bg-secondary text-sm font-semibold hover:bg-secondary/80 disabled:opacity-50 transition-colors"
            >
              {isLoadingMore ? "Loading..." : "Load more matches"}
            </button>
          </div>
        )}
      </div>
      <MobileTabs />
    </main>
  );
};

export default Index;
