import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import {
  Home, User, LogIn, Trophy, Zap, UserPlus, CalendarDays, KeyRound, Sparkles, MapPin, Clock, Wallet, Users, Activity, Award,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NearYou } from "@/components/NearYou";
import { ProfileSheet } from "@/components/ProfileSheet";
import { useAuth } from "@/hooks/useAuth";
import { useEnter } from "@/hooks/useReveal";
import { NotificationsBell } from "@/components/NotificationsBell";
import { FriendsSheet } from "@/components/FriendsSheet";
import { useHomeMatches, HomeMatch } from "@/hooks/useHomeMatches";
import { useUserLocation } from "@/hooks/useUserLocation";
import { useHomeStats } from "@/hooks/useHomeStats";
import { useSmartRecommendations } from "@/hooks/useSmartRecommendations";
import { useFriendsPlaying } from "@/hooks/useFriendsPlaying";
import { useFriendActivity } from "@/hooks/useFriendActivity";
import { useFriends } from "@/hooks/useFriends";
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
          <img src={logoLight} alt="" className="w-9 h-9 rounded-xl object-cover dark:hidden" />
          <img src={logoDark} alt="" className="w-9 h-9 rounded-xl object-cover hidden dark:block" />
          <span className="font-display font-extrabold text-[17px] tracking-tight">PlayReady</span>
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <NotificationsBell />
          {user && (
            <Link to="/wallet" className="ml-1 inline-flex items-center gap-1.5 bg-secondary text-foreground rounded-full px-2.5 py-1.5 text-xs font-semibold hover:bg-secondary/80">
              <Wallet className="w-3.5 h-3.5" />
              <span>₵{balance.toFixed(2)}</span>
            </Link>
          )}
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
  const loc = window.location.pathname;
  const isActive = (path: string) => loc === path;
  const { pendingRequests } = useFriends();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-background/95 backdrop-blur-md border-t border-border">
      <div className="max-w-[680px] mx-auto grid grid-cols-5 h-16">
        {[
          { to: "/", icon: Home, label: "Home" },
          { to: "/schedule", icon: Trophy, label: "Schedule" },
          { to: "/leaderboard", icon: Award, label: "Ranks" },
        ].map((t) => (
          <Link
            key={t.to}
            to={t.to}
            className={`flex flex-col items-center justify-center gap-1 ${isActive(t.to) ? "text-foreground" : "text-muted-foreground"}`}
          >
            <t.icon className="w-5 h-5" strokeWidth={isActive(t.to) ? 2.4 : 2} />
            <span className="text-[10px] font-semibold">{t.label}</span>
          </Link>
        ))}
        <FriendsSheet
          trigger={
            <button className="relative flex flex-col items-center justify-center gap-1 text-muted-foreground" aria-label="Open friends">
              <Users className="w-5 h-5" />
              <span className="text-[10px] font-semibold">Friends</span>
              {pendingRequests.length > 0 && (
                <span className="absolute -top-1.5 right-2 min-w-[16px] h-[16px] px-1 rounded-full bg-primary text-primary-foreground text-[8px] font-bold leading-[16px] text-center">
                  {pendingRequests.length > 9 ? "9+" : pendingRequests.length}
                </span>
              )}
            </button>
          }
        />
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
        friendCount,
        friendAvatars,
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

/* Smart recommendations rail */
const RecommendationsRail = () => {
  const { recommendations, loading } = useSmartRecommendations();
  const navigate = useNavigate();
  if (loading) return null;
  if (recommendations.length === 0) return null;

  return (
    <section className="px-5 pt-4 pb-2">
      <div className="max-w-[680px] mx-auto">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-amber-500" />
          <h2 className="text-sm font-bold text-foreground">Recommended for you</h2>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-5 px-5 scrollbar-hide">
          {recommendations.map((m) => (
            <button
              key={m.id}
              onClick={() => navigate(`/lobby/${m.join_code}`)}
              className="flex-shrink-0 w-[260px] bg-card rounded-2xl border border-border/60 p-4 text-left hover:border-primary/40 transition-all"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                  {m.match_mode === "gala" ? "Gala" : "Two-team"}
                </span>
                <span className="text-[10px] text-muted-foreground">{m.reason}</span>
              </div>
              <p className="font-display font-bold text-sm truncate">{m.venue?.name ?? "Venue"}</p>
              <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3" /> {m.venue?.area ?? m.venue?.city ?? ""}
              </p>
              <div className="flex items-center gap-3 mt-2.5 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {getFormattedTime(m.match_date)}
                </span>
                <span className="flex items-center gap-1">
                  <Wallet className="w-3 h-3" />
                  {m.entry_fee > 0 ? `₵${m.entry_fee}` : "Free"}
                </span>
                <span className="flex items-center gap-1">
                  <UserPlus className="w-3 h-3" /> {m.core_paid_count}/{m.max_core_players}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};

/* Friend activity feed */
const FriendActivityFeed = () => {
  const { activities, loading } = useFriendActivity();
  const navigate = useNavigate();
  if (loading) return null;
  if (activities.length === 0) return null;

  return (
    <section className="px-5 pt-4 pb-2">
      <div className="max-w-[680px] mx-auto">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold text-foreground">Friend activity</h2>
        </div>
        <div className="space-y-2">
          {activities.slice(0, 5).map((a) => (
            <button
              key={a.id}
              onClick={() => a.join_code && navigate(`/lobby/${a.join_code}`)}
              className="w-full flex items-center gap-3 text-left p-3 rounded-2xl bg-card border border-border/60 hover:border-primary/40 transition-all"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              {a.friend_avatar ? (
                <img src={a.friend_avatar} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                  {(a.friend_name[0] || "?").toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold truncate">
                  <span className="text-foreground">{a.friend_name}</span>{" "}
                  <span className="text-muted-foreground font-normal">
                    {a.type === "joined" && "joined a match"}
                    {a.type === "created" && "hosted a match"}
                    {a.type === "looking" && "is looking for players"}
                  </span>
                </p>
                {a.venue_name && (
                  <p className="text-[11px] text-muted-foreground truncate">{a.venue_name}</p>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground flex-shrink-0">
                {new Date(a.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};

/* Friends playing rail */
const FriendsPlayingRail = () => {
  const { matches, loading } = useFriendsPlaying();
  const navigate = useNavigate();
  if (loading) return null;
  if (matches.length === 0) return null;

  return (
    <section className="px-5 pt-4 pb-2">
      <div className="max-w-[680px] mx-auto">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold text-foreground">Friends playing</h2>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-5 px-5 scrollbar-hide">
          {matches.map((m) => (
            <button
              key={m.id}
              onClick={() => navigate(`/lobby/${m.join_code}`)}
              className="flex-shrink-0 w-[260px] bg-card rounded-2xl border border-border/60 p-4 text-left hover:border-primary/40 transition-all"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              <div className="flex items-center gap-2 mb-2">
                {m.friend_avatar ? (
                  <img src={m.friend_avatar} alt="" className="w-5 h-5 rounded-full object-cover" />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[8px] font-bold">
                    {(m.friend_name[0] || "?").toUpperCase()}
                  </div>
                )}
                <span className="text-[11px] font-semibold text-muted-foreground">{m.friend_name} joined</span>
              </div>
              <p className="font-display font-bold text-sm truncate">{m.venue?.name ?? "Venue"}</p>
              <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3" /> {m.venue?.area ?? m.venue?.city ?? ""}
              </p>
              <div className="flex items-center gap-3 mt-2.5 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {getFormattedTime(m.match_date)}
                </span>
                <span className="flex items-center gap-1">
                  <Wallet className="w-3 h-3" />
                  {m.entry_fee > 0 ? `₵${m.entry_fee}` : "Free"}
                </span>
                <span className="flex items-center gap-1">
                  <UserPlus className="w-3 h-3" /> {m.core_paid_count}/{m.max_core_players}
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
  const { matches, loading: matchesLoading } = useHomeMatches();
  const { location } = useUserLocation();
  const { stats } = useHomeStats();
  const { user } = useAuth();
  const { friends } = useFriends();

  const userLat = location?.lat ?? 5.6037; // Accra default
  const userLng = location?.lng ?? -0.187;

  const liveCount = matches.filter((m) => {
    if (m.status !== "live") return false;
    const venue = m.venue;
    if (!venue?.lat || !venue?.lng) return false;
    return getDistanceKm(userLat, userLng, venue.lat, venue.lng) <= 20;
  }).length;
  const friendIds = useMemo(() => new Set(friends.map((f) => f.id)), [friends]);
  const feedItems = transformMatches(matches, userLat, userLng, user?.id, friendIds);

  return (
    <main className="min-h-screen bg-background pb-20">
      <Nav />
      <Hero liveCount={liveCount} />
      <QuickActions />
      <LiveStatsBar matches={stats.matchesToday} players={stats.playersOnline} />
      <RecommendationsRail />
      <FriendsPlayingRail />
      <div id="near-you">
        <NearYou variant="curated" limit={3} items={feedItems} isLoading={matchesLoading} />
      </div>
      <MobileTabs />
    </main>
  );
};

export default Index;
