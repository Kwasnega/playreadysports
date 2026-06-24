import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, Search, KeyRound, Clock, MapPin, Users, Repeat,
  Check, X, ChevronRight, SlidersHorizontal, Sparkles, Star, Wallet as WalletIcon,
} from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { useWallet } from "@/hooks/useWallet";
import { useBrowseMatches, useBrowseFilters } from "@/hooks/useBrowseMatches";
import {
  getFormattedTime,
  getDistanceKm,
  getSpotsLeft,
  getActiveCoreCount,
  isVenueOpen,
} from "@/lib/matchHelpers";

/* Tier-2 Join flow rewrite — now wired to Supabase ---------------------- */

type ModeFilter = "all" | "two_team" | "gala";
type SortKey = "soonest" | "nearest" | "cheapest";

const MODE_MAP: Record<ModeFilter, string | undefined> = {
  all: undefined,
  "two_team": "two_team",
  gala: "gala",
};

const UI_MODE_LABEL: Record<string, string> = {
  all: "All",
  two_team: "Two-team",
  gala: "Gala",
};

const JoinMatch = () => {
  const nav = useNavigate();
  const { user, openAuth } = useAuth();
  const { balance } = useWallet();

  // URL-driven filter state
  const { filters, setMode, setSort, setSearch } = useBrowseFilters();

  // Local debounced search input
  const [rawQuery, setRawQuery] = useState(filters.search ?? "");

  useEffect(() => {
    const t = setTimeout(() => setSearch(rawQuery), 300);
    return () => clearTimeout(t);
  }, [rawQuery, setSearch]);

  const modeFilter: ModeFilter = filters.mode ? filters.mode : "all";
  const sort = filters.sort;

  const { matches, grouped, loading } = useBrowseMatches(filters);

  const [active, setActive] = useState<string | null>(null);
  const activeMatch = useMemo(() => matches.find((m) => m.id === active) ?? null, [matches, active]);

  return (
    <main className="min-h-screen bg-background pb-10">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b-2 border-border">
        <div className="max-w-[680px] mx-auto px-5 h-16 flex items-center gap-3">
          <button onClick={() => nav("/")} className="w-10 h-10 -ml-2 rounded-full border-2 border-transparent hover:border-border flex items-center justify-center transition-colors" aria-label="Back">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-display font-black text-xl tracking-tight uppercase flex-1">Browse Matches</h1>
          {user && (
            <button onClick={() => nav("/wallet")} className="inline-flex items-center gap-1.5 border-2 border-foreground bg-foreground text-background rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-opacity shadow-sm">
              <WalletIcon className="w-3.5 h-3.5" />
              <span>₵{balance.toFixed(0)}</span>
            </button>
          )}
          <button
            onClick={() => nav("/code")}
            className="inline-flex items-center gap-1.5 bg-background border-2 border-border text-foreground rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-widest hover:border-foreground transition-colors"
          >
            <KeyRound className="w-3 h-3" /> Have Code?
          </button>
        </div>
      </header>

      <div className="max-w-[680px] mx-auto px-5 pt-5 pb-4 space-y-4">
        {/* Hero summary */}
        <div>
          <h2 className="display-xl text-[36px] leading-[1] tracking-tight">
            Find a <span className="italic font-display">match.</span>
          </h2>
          <p className="text-sm text-muted-foreground mt-2">
            {loading ? "Loading…" : `${matches.length} open ${matches.length === 1 ? "match" : "matches"}`}
            {modeFilter !== "all" && ` · ${UI_MODE_LABEL[modeFilter]} only`}
          </p>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2.5 bg-background border-2 border-border rounded-xl px-4 py-3.5 transition-colors focus-within:border-foreground">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            value={rawQuery}
            onChange={e => setRawQuery(e.target.value)}
            placeholder="SEARCH VENUE, AREA, FORMAT…"
            className="flex-1 bg-transparent text-[11px] font-black uppercase tracking-widest outline-none placeholder:text-muted-foreground"
          />
          {rawQuery && (
            <button onClick={() => { setRawQuery(""); setSearch(""); }} className="text-foreground hover:opacity-70" aria-label="Clear">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Mode filter + sort */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none -mx-1 px-1">
            {(
              // HIDDEN — "gala" filter: re-enable when Gala feature is released
              ["all", "two_team"] as ModeFilter[]
            ).map((id) => {
              const isActive = modeFilter === id;
              return (
                <button
                  key={id}
                  onClick={() => setMode(id === "all" ? undefined : id)}
                  data-active={isActive}
                  className={`shrink-0 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl border-2 transition-all ${
                    isActive ? "bg-foreground border-foreground text-background" : "bg-card border-border text-foreground hover:border-foreground"
                  }`}
                >
                  {UI_MODE_LABEL[id]}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t-2 border-border border-dashed pt-3">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-muted-foreground uppercase tracking-widest">
              <SlidersHorizontal className="w-3 h-3" /> Sort
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {([
                { id: "soonest", label: "Soonest" },
                { id: "nearest", label: "Nearest" },
                { id: "cheapest", label: "Cheapest" },
              ] as { id: SortKey; label: string }[]).map(s => {
                const isActive = sort === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSort(s.id)}
                    className={`text-[9px] font-black uppercase tracking-widest rounded-full border-2 px-3 py-1.5 transition-colors ${
                      isActive
                        ? "bg-foreground border-foreground text-background"
                        : "bg-background border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Feed */}
        {matches.length === 0 && !loading ? (
          <div className="rounded-xl border border-dashed border-border/70 py-12 px-5 text-center">
            <Sparkles className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground mb-3">
              No matches match your filters.
            </p>
            <button
              onClick={() => { setRawQuery(""); setSearch(""); setMode(undefined); }}
              className="text-xs font-semibold text-primary hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : loading ? (
          <ul className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={`skel-${i}`}>
                <div className="bg-card rounded-xl px-4 py-4 border border-border animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="shrink-0 w-[68px] border-r border-border pr-3 space-y-2">
                      <div className="h-3 bg-secondary rounded w-10" />
                      <div className="h-7 bg-secondary rounded w-12" />
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-secondary rounded w-3/4" />
                      <div className="h-3 bg-secondary rounded w-1/2" />
                      <div className="flex gap-1.5 pt-1">
                        <div className="h-5 bg-secondary rounded w-16" />
                        <div className="h-5 bg-secondary rounded w-20" />
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : grouped ? (
          <div className="space-y-6">
            {grouped.map(g => (
              <section key={g.key}>
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="text-[10px] font-black text-foreground uppercase tracking-widest bg-secondary px-2.5 py-1 rounded-sm">
                    {g.label}
                  </h3>
                  <div className="flex-1 border-t-2 border-border border-dashed" />
                </div>
                <ul className="space-y-3">
                  {g.items.map(m => <FeedRow key={m.id} m={m} user={user} onTap={() => setActive(m.id)} />)}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <ul className="space-y-3">
            {matches.map(m => <FeedRow key={m.id} m={m} user={user} onTap={() => setActive(m.id)} />)}
          </ul>
        )}
      </div>

      <JoinSheet
        match={activeMatch}
        onClose={() => setActive(null)}
        onJoin={(team) => {
          setActive(null);
          if (!activeMatch) return;
          nav(`/lobby/${activeMatch.join_code}?team=${encodeURIComponent(team)}`);
        }}
        user={user}
        openAuth={openAuth}
      />
    </main>
  );
};

/* ---- Feed row ---- */

import type { BrowseMatch } from "@/hooks/useBrowseMatches";

const splitTime = (t: string): { when: string; time: string } => {
  const parts = t.split("·").map(s => s.trim());
  if (parts.length === 2) return { when: parts[0], time: parts[1] };
  return { when: "", time: t };
};

const FeedRow = ({ m, user, onTap }: { m: BrowseMatch; user: any; onTap: () => void }) => {
  const filled = getActiveCoreCount(m);
  const max = m.max_core_players ?? m.players_per_side ?? 10;
  const left = getSpotsLeft(m);
  const tight = left <= 2;
  const timeLabel = getFormattedTime(m.match_date);
  const { when, time } = splitTime(timeLabel);

  const venueName = m.venue?.name ?? "Venue";
  const area = m.venue?.area ?? m.venue?.city ?? "";
  const km = 0; // filled by parent with user location

  const organizerName = m.organizer?.full_name ?? m.organizer?.username ?? "Organizer";
  const organizerAvatar = m.organizer?.avatar_url ?? "";
  const organizerRating = m.organizer?.reputation_score ?? 5.0;
  const isConfirmed = m.core_paid_count >= max;
  const isOrganizer = user?.id && m.organizer_id === user.id;
  const isJoined = user?.id && m.participants?.some((p: any) => p.user_id === user.id && p.status === "active");

  return (
    <li>
      <button
        onClick={onTap}
        className="w-full group flex text-left bg-card rounded-2xl border-2 border-border overflow-hidden transition-all duration-200 hover:border-foreground/40 active:scale-[0.99] relative"
      >
        {/* Sub-stub cutouts for realism */}
        <div className="absolute left-[84px] top-[-7px] w-3.5 h-3.5 rounded-full bg-background border-2 border-border z-10" />
        <div className="absolute left-[84px] bottom-[-7px] w-3.5 h-3.5 rounded-full bg-background border-2 border-border z-10" />
        
        {/* Time stub */}
        <div className="w-[90px] shrink-0 border-r-2 border-border border-dashed bg-secondary/40 flex flex-col items-center justify-center p-2 group-hover:bg-secondary/60 transition-colors">
          <span className={`text-[10px] font-black uppercase tracking-widest mb-1 ${tight ? 'text-foreground' : 'text-muted-foreground'}`}>{when}</span>
          <span className="text-xl font-display font-black tracking-tighter leading-none text-foreground">
            {time.split(' ')[0]}
          </span>
          {time.split(' ')[1] && (
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-0.5">
              {time.split(' ')[1]}
            </span>
          )}
        </div>

        {/* Main Details */}
        <div className="flex-1 p-3.5 flex flex-col justify-center min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <p className="text-sm font-bold text-foreground leading-tight truncate">{venueName}</p>
            {m.venue && (() => {
              const { isOpen, label } = isVenueOpen(m.venue);
              return (
                <span className={`shrink-0 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-sm border ${isOpen ? "border-foreground text-foreground" : "border-muted-foreground text-muted-foreground"}`}>
                  {label}
                </span>
              );
            })()}
          </div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5 truncate">
            {area} <span className="text-[8px]">•</span>
            {Number(m.entry_fee) === 0 ? (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[9px] font-black uppercase tracking-widest">FREE</span>
            ) : (
              <span className="text-foreground">₵{Number(m.entry_fee)}</span>
            )}
          </p>
          
          <div className="flex items-center gap-1.5 mt-2">
            {organizerAvatar ? (
              <img src={organizerAvatar} alt={organizerName} className="w-5 h-5 rounded-full object-cover grayscale border border-border" />
            ) : (
              <div className="w-5 h-5 rounded-full bg-background border border-border flex items-center justify-center text-[8px] font-bold text-foreground">
                {organizerName.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-[10px] font-bold uppercase tracking-widest text-foreground truncate max-w-[80px]">{organizerName}</span>
            {isOrganizer && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm border border-foreground text-foreground text-[8px] font-black uppercase tracking-widest">
                You
              </span>
            )}
            <span className="text-muted-foreground text-[10px]">•</span>
            <Star className="w-3 h-3 text-foreground" />
            <span className="text-[10px] font-black text-foreground">{organizerRating.toFixed(1)}</span>
          </div>

          <div className="flex items-center gap-1.5 mt-3 flex-wrap">
            <span className="inline-flex items-center gap-1 rounded-sm border-2 border-border bg-secondary/50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground">
              {m.match_mode === "gala" ? <Repeat className="w-2.5 h-2.5" /> : <Users className="w-2.5 h-2.5" />}
              {m.match_mode === "gala" ? `Gala ${m.format}` : m.format}
            </span>
            {isJoined ? (
              <span className="inline-flex items-center gap-1 rounded-sm border-2 border-foreground bg-foreground text-background px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest">
                <Check className="w-2.5 h-2.5" /> Joined
              </span>
            ) : isConfirmed ? (
              <span className="inline-flex items-center gap-1 rounded-sm border-2 border-foreground bg-foreground text-background px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest">
                <Check className="w-2.5 h-2.5" /> Confirmed
              </span>
            ) : (
              <span className={`inline-flex items-center gap-1 rounded-sm border-[1.5px] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest ${tight ? "border-foreground text-foreground" : "border-border text-muted-foreground bg-secondary/50"}`}>
                {left} spot{left === 1 ? "" : "s"} left
              </span>
            )}
          </div>
        </div>
      </button>
    </li>
  );
};

/* ---- Quick-join sheet ---- */

const JoinSheet = ({
  match, onClose, onJoin, user, openAuth,
}: {
  match: BrowseMatch | null;
  onClose: () => void;
  onJoin: (team: string) => void;
  user: any;
  openAuth: (mode?: "signin" | "signup") => void;
}) => {
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showSubstituteConfirm, setShowSubstituteConfirm] = useState(false);

  // Reset team selection whenever a different match opens
  useEffect(() => { setPicked(null); }, [match?.id]);

  const open = !!match;
  const isJoined = user?.id && match?.participants?.some((p: any) => p.user_id === user.id && p.status === "active");
  const isFull = match?.match_type !== "private" && match?.match_mode !== "gala" && getActiveCoreCount(match) >= (match?.max_core_players ?? match?.players_per_side ?? 10);

  const handlePick = (teamName: string) => {
    if (!user) {
      openAuth("signin");
      return;
    }
    setPicked(teamName);
  };

  const handleJoin = () => {
    if (!picked) return;
    if (!user) {
      openAuth("signin");
      return;
    }
    if (isFull) {
      setShowSubstituteConfirm(true);
    } else {
      onJoin(picked);
    }
  };

  const confirmSubstituteJoin = () => {
    setShowSubstituteConfirm(false);
    onJoin("__substitute__");
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl p-0 max-h-[85vh] overflow-y-auto">
        {match && (
          <>
            <SheetHeader className="px-5 pt-5 text-left">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold font-mono">
                  {match.join_code}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider">
                  {match.match_mode === "gala" ? "Gala" : "Two-team"} · {match.format}
                </span>
              </div>
              <SheetTitle className="font-display font-bold text-2xl tracking-tight mt-3">
                {match.venue?.name ?? "Venue"}
              </SheetTitle>
              {match.venue && (() => {
                const { isOpen, label } = isVenueOpen(match.venue);
                return (
                  <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 ${isOpen ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"}`}>
                    {label}
                  </span>
                );
              })()}
              <div className="grid grid-cols-2 gap-y-2 text-xs text-muted-foreground mt-1">
                <div className="inline-flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {getFormattedTime(match.match_date)}</div>
                <div className="inline-flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {match.venue?.area ?? match.venue?.city ?? ""}</div>
                <div className="inline-flex items-center gap-1.5"><Users className="w-3.5 h-3.5" />
                  {Number(match.entry_fee) === 0 ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[9px] font-black uppercase tracking-widest">FREE</span>
                  ) : (
                    <span>₵{Number(match.entry_fee)}/player</span>
                  )}
                </div>
              </div>
            </SheetHeader>

            <section className="px-5 pt-5 pb-4">
              {/* Check if match is full - offer substitute option */}
              {match.match_type !== "private" && match.match_mode !== "gala" && getActiveCoreCount(match) >= (match.max_core_players ?? match.players_per_side ?? 10) ? (
                <div className="text-center py-4 bg-amber-500/10 border-2 border-amber-500/20 rounded-xl">
                  <p className="text-sm font-bold text-amber-600 dark:text-amber-400 mb-1">Match is full</p>
                  <p className="text-xs text-muted-foreground mb-3">
                    You can join as a substitute and take a spot if someone leaves
                  </p>
                  <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">
                    <Users className="w-3.5 h-3.5" />
                    Substitute available
                  </div>
                </div>
              ) : match.match_type !== "private" && match.match_mode !== "gala" ? (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground mb-1">Team will be auto-assigned for balance</p>
                  <p className="text-xs text-muted-foreground">
                    {getActiveCoreCount(match)}/{match.max_core_players ?? match.players_per_side ?? 10} spots filled
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground mb-2">Pick your team</p>
                  <ul className="divide-y divide-border">
                    {match.match_mode !== "gala" && (
                      <>
                        <li>
                          <button
                            onClick={() => handlePick("reds")}
                            className="w-full flex items-center justify-between py-4 text-left"
                          >
                            <div>
                              <p className="text-base font-semibold">Reds</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {getActiveCoreCount(match)}/{match.max_core_players ?? match.players_per_side ?? 10}
                              </p>
                            </div>
                            {picked === "reds" ? <Check className="w-5 h-5" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                          </button>
                        </li>
                        <li>
                          <button
                            onClick={() => handlePick("blues")}
                            className="w-full flex items-center justify-between py-4 text-left"
                          >
                            <div>
                              <p className="text-base font-semibold">Blues</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {getActiveCoreCount(match)}/{match.max_core_players ?? match.players_per_side ?? 10}
                              </p>
                            </div>
                            {picked === "blues" ? <Check className="w-5 h-5" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                          </button>
                        </li>
                      </>
                    )}
                    {match.match_mode === "gala" && (
                      <li>
                        <button
                          onClick={() => handlePick("__bring__")}
                          className="w-full flex items-center justify-between py-4 text-left"
                        >
                          <div>
                            <p className="text-base font-semibold">Bring my own team</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Captain a new squad in this gala</p>
                          </div>
                          {picked === "__bring__" ? <Check className="w-5 h-5" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                        </button>
                      </li>
                    )}
                  </ul>
                </>
              )}
            </section>

            <div className="sticky bottom-0 bg-background/95 backdrop-blur-md border-t border-border px-5 py-3">
              {user?.id && match.organizer_id === user.id ? (
                <button
                  onClick={() => { onJoin("__auto__"); }}
                  className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-lg bg-primary text-primary-foreground text-sm font-semibold active:scale-[0.99]"
                >
                  Manage match
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : isJoined ? (
                <button
                  onClick={() => { onJoin("__auto__"); }}
                  className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-lg bg-secondary border-2 border-border text-foreground text-sm font-semibold active:scale-[0.99]"
                >
                  View match
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (!user) { openAuth(); return; }
                    setBusy(true);
                    if (match.match_mode === "gala" || match.match_type === "private") {
                      if (!picked) { setBusy(false); return; }
                      if (isFull) {
                        setShowSubstituteConfirm(true);
                        setBusy(false);
                      } else {
                        onJoin(picked === "__bring__" ? "__bring__" : picked);
                      }
                    } else {
                      if (isFull) {
                        setShowSubstituteConfirm(true);
                        setBusy(false);
                      } else {
                        onJoin("__auto__");
                      }
                    }
                    setBusy(false);
                  }}
                  disabled={busy || (match.match_mode === "gala" || match.match_type === "private" ? !picked : false)}
                  className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 active:scale-[0.99]"
                >
                  {match.match_type !== "private" && match.match_mode !== "gala"
                    ? isFull ? "Join as substitute" : "Join match"
                    : picked ? `Join as ${picked === "__bring__" ? "captain" : picked}` : "Pick a team to join"}
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}

              {/* Substitute confirmation modal */}
              {showSubstituteConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowSubstituteConfirm(false)}>
                  <div className="bg-background border-2 border-border rounded-xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                        <Users className="w-5 h-5 text-amber-500" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-foreground">Join as substitute?</h3>
                        <p className="text-xs text-muted-foreground">You'll be charged only if you get a spot</p>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      This match is currently full. Join as a substitute and you'll be notified if a spot opens up.{Number(match.entry_fee) > 0 ? ` You'll only be charged ₵${Number(match.entry_fee)} if you get added to the match.` : " This match is free — no charge to join."}
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setShowSubstituteConfirm(false)}
                        className="flex-1 py-2.5 rounded-xl bg-secondary text-foreground text-sm font-semibold hover:bg-secondary/80 transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={confirmSubstituteJoin}
                        className="flex-1 py-2.5 rounded-xl bg-foreground text-background text-sm font-semibold hover:bg-foreground/90 transition-all"
                      >
                        Join as substitute
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default JoinMatch;
