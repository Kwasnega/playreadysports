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
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border/60">
        <div className="max-w-[680px] mx-auto px-5 h-14 flex items-center gap-3">
          <button onClick={() => nav("/")} className="p-2 -ml-2 rounded-full hover:bg-secondary" aria-label="Back">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-display font-bold text-xl tracking-tight flex-1">Browse matches</h1>
          {user && (
            <button onClick={() => nav("/wallet")} className="inline-flex items-center gap-1.5 bg-secondary text-foreground rounded-full px-2.5 py-1.5 text-xs font-semibold hover:bg-secondary/80">
              <WalletIcon className="w-3.5 h-3.5" />
              <span>₵{balance.toFixed(2)}</span>
            </button>
          )}
          <button
            onClick={() => nav("/code")}
            className="inline-flex items-center gap-1.5 bg-primary/10 text-primary rounded-full px-3 py-1.5 text-xs font-semibold"
          >
            <KeyRound className="w-3.5 h-3.5" /> Have a code?
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
        <div className="flex items-center gap-2.5 bg-secondary rounded-full px-4 py-3">
          <Search className="w-4 h-4 text-foreground/70 shrink-0" />
          <input
            value={rawQuery}
            onChange={e => setRawQuery(e.target.value)}
            placeholder="Search venue, area, format…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {rawQuery && (
            <button onClick={() => { setRawQuery(""); setSearch(""); }} className="text-muted-foreground hover:text-foreground" aria-label="Clear">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Mode filter + sort */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none -mx-1 px-1">
            {(
              ["all", "two_team", "gala"] as ModeFilter[]
            ).map((id) => {
              const isActive = modeFilter === id;
              return (
                <button
                  key={id}
                  onClick={() => setMode(id === "all" ? undefined : id)}
                  data-active={isActive}
                  className="pill-tab shrink-0 text-xs px-3.5 py-1.5"
                >
                  {UI_MODE_LABEL[id]}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              <SlidersHorizontal className="w-3 h-3" /> Sort
            </span>
            <div className="flex items-center gap-1.5">
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
                    className={`text-[11px] font-semibold rounded-full px-2.5 py-1 transition-colors ${
                      isActive
                        ? "bg-foreground text-background"
                        : "bg-secondary text-muted-foreground hover:text-foreground"
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
          <div className="rounded-2xl border border-dashed border-border/70 py-12 px-5 text-center">
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
                <div className="bg-card rounded-2xl px-4 py-4 border border-border/60 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="shrink-0 w-[68px] border-r border-border/60 pr-3 space-y-2">
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
                <div className="flex items-center gap-3 mb-2.5">
                  <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.12em]">
                    {g.label}
                  </h3>
                  <span className="text-[11px] font-semibold text-muted-foreground/60">
                    {g.items.length}
                  </span>
                  <div className="flex-1 h-px bg-border/60" />
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
  const lat = m.venue?.lat;
  const lng = m.venue?.lng;
  // Use distance from filters via URL — compute client-side for display
  const km = 0; // filled by parent with user location

  const organizerName = m.organizer?.full_name ?? m.organizer?.username ?? "Organizer";
  const organizerAvatar = m.organizer?.avatar_url ?? "";
  const organizerRating = m.organizer?.reputation_score ?? 5.0;
  const isConfirmed = m.core_paid_count >= max;
  const isOrganizer = user?.id && m.organizer_id === user.id;

  return (
    <li>
      <button
        onClick={onTap}
        className="w-full text-left bg-card rounded-2xl px-4 py-4 border border-border/60 transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-lg active:scale-[0.99]"
      >
        <div className="flex items-center gap-3">
          <div className="shrink-0 w-[68px] text-left border-r border-border/60 pr-3">
            {when && <p className="text-xs font-semibold text-muted-foreground tracking-tight">{when}</p>}
            <p className={`font-display font-extrabold text-[26px] leading-[1.05] tabular-nums tracking-tight mt-0.5 ${tight ? "text-warn" : "text-foreground"}`}>
              {time}
            </p>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-base font-semibold truncate leading-tight">{venueName}</p>
              {m.venue && (() => {
                const { isOpen, label } = isVenueOpen(m.venue);
                return (
                  <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isOpen ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"}`}>
                    {label}
                  </span>
                );
              })()}
            </div>
            <p className="text-sm text-muted-foreground truncate mt-0.5">
              {area} · {m.format} · ₵{Number(m.entry_fee)}
            </p>
            <div className="flex items-center gap-1.5 mt-1.5">
              {organizerAvatar && (
                <img src={organizerAvatar} alt={organizerName} className="w-5 h-5 rounded-full object-cover ring-1 ring-border/60" />
              )}
              <span className="text-xs font-medium text-foreground/80">{organizerName}</span>
              {isOrganizer && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-bold">
                  You
                </span>
              )}
              <span className="text-muted-foreground text-xs">·</span>
              <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
              <span className="text-xs font-semibold text-foreground/80">{organizerRating.toFixed(1)}</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="inline-flex items-center gap-1 rounded-md bg-secondary text-foreground/75 px-1.5 py-0.5 text-xs font-semibold">
                {m.match_mode === "gala" ? <Repeat className="w-3 h-3" /> : <Users className="w-3 h-3" />}
                {m.match_mode === "gala" ? `Gala ${m.format}` : m.format}
              </span>
              {isConfirmed ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 text-emerald-600 px-1.5 py-0.5 text-xs font-semibold">
                  <Check className="w-3 h-3" /> Confirmed
                </span>
              ) : (
                <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold ${tight ? "bg-warn/15 text-warn" : "bg-secondary text-foreground/75"}`}>
                  {left} spot{left === 1 ? "" : "s"} left
                </span>
              )}
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
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

  // Reset team selection whenever a different match opens
  useEffect(() => { setPicked(null); }, [match?.id]);

  const open = !!match;

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
    onJoin(picked);
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
                <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground text-background px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider">
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
                <div className="inline-flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> ₵{Number(match.entry_fee)}/player</div>
              </div>
            </SheetHeader>

            <section className="px-5 pt-5 pb-4">
              {/* Public matches: auto-assign team server-side */}
              {match.match_type !== "private" && match.match_mode !== "gala" ? (
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
                  onClick={() => { navigate(`/lobby/${match.join_code}`); }}
                  className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-full bg-primary text-primary-foreground text-sm font-semibold active:scale-[0.99]"
                >
                  Manage match
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (!user) { openAuth(); return; }
                    if (match.match_mode === "gala" || match.match_type === "private") {
                      if (!picked) return;
                      onJoin(picked === "__bring__" ? "__bring__" : picked);
                    } else {
                      onJoin(resolvedTeam);
                    }
                  }}
                  disabled={busy || (!!picked && false) || (match.match_mode === "gala" || match.match_type === "private" ? !picked : false)}
                  className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-full bg-foreground text-background text-sm font-semibold disabled:opacity-40 active:scale-[0.99]"
                >
                  {match.match_type !== "private" && match.match_mode !== "gala"
                    ? "Join match"
                    : picked ? `Join as ${picked === "__bring__" ? "captain" : picked}` : "Pick a team to join"}
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default JoinMatch;