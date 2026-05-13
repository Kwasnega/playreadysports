import { Link, useNavigate } from "react-router-dom";
import { Radio, Repeat, Users as UsersIcon, ArrowRight, Sparkles } from "lucide-react";

type GalaOpening = {
  kind: "gala";
  id: string;
  code: string;
  venue: string;
  area: string;
  time: string;
  format: "5" | "7";
  teamsIn: number;
  capTeams: number;
  pricePerPlayer: number;
  km: number;
  joined?: boolean;
};

type TwoTeamOpening = {
  kind: "two-team";
  id: string;
  code: string;
  venue: string;
  area: string;
  time: string;
  format: string;
  filled: number;
  cap: number;
  pricePerPlayer: number;
  km: number;
  joined?: boolean;
};

type LiveScore = {
  kind: "live";
  id: string;
  venue: string;
  area: string;
  format: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  minute: string;
  km: number;
};

type Item = GalaOpening | TwoTeamOpening | LiveScore;

// Mix of GALA matches that still need teams and two-team (1v1) matches
// where the organiser is asking for more players. Live score for context.
const items: Item[] = [
  { kind: "gala", id: "f1", code: "TMA-091", venue: "Tema Mini Pitch", area: "Tema", time: "Sat · 4:00 PM", format: "5", teamsIn: 2, capTeams: 4, pricePerPlayer: 22, km: 5.0 },
  { kind: "two-team", id: "t1", code: "KSI-447", venue: "Bantama Astro", area: "Kumasi", time: "Tonight · 7:30 PM", format: "6v6", filled: 8, cap: 12, pricePerPlayer: 25, km: 1.4 },
  { kind: "gala", id: "f2", code: "ACC-555", venue: "Labone Astro", area: "Labone", time: "Sun · 5:00 PM", format: "5", teamsIn: 1, capTeams: 3, pricePerPlayer: 28, km: 4.8 },
  { kind: "two-team", id: "t2", code: "ACC-223", venue: "Madina Park", area: "Madina", time: "Tonight · 8:00 PM", format: "5v5", filled: 5, cap: 10, pricePerPlayer: 30, km: 3.2 },
  { kind: "gala", id: "f3", code: "ACC-204", venue: "Labone Astro", area: "Accra", time: "Sat · 6:00 PM", format: "7", teamsIn: 2, capTeams: 3, pricePerPlayer: 30, km: 4.8 },
  { kind: "two-team", id: "t3", code: "ACC-902", venue: "El Wak Stadium", area: "Cantonments", time: "Sun · 3:00 PM", format: "11v11", filled: 14, cap: 22, pricePerPlayer: 45, km: 6.1 },
  { kind: "gala", id: "f4", code: "KSI-660", venue: "Bantama Astro", area: "Kumasi", time: "Sun · 4:00 PM", format: "7", teamsIn: 3, capTeams: 4, pricePerPlayer: 26, km: 1.4 },
  { kind: "live", id: "l1", venue: "Bantama Astro", area: "Bantama", format: "5-a-side", home: "Old Boys", away: "Newgen", homeScore: 3, awayScore: 3, minute: "FT", km: 1.4 },
];

export const NearYou = ({
  areaQuery = "",
  maxKm = Infinity,
  limit,
  variant = "full",
  items: externalItems,
  isLoading,
}: {
  areaQuery?: string;
  maxKm?: number;
  limit?: number;
  variant?: "full" | "curated";
  items?: Item[];
  isLoading?: boolean;
}) => {
  const sourceItems = externalItems ?? items;
  const q = areaQuery.trim().toLowerCase();

  let filtered = sourceItems.filter(it => {
    if (it.km > maxKm) return false;
    if (it.kind === "gala" && it.teamsIn >= it.capTeams) return false;
    if (it.kind === "two-team" && it.filled >= it.cap) return false;
    if (!q) return true;
    const code = it.kind === "live" ? "" : it.code.toLowerCase();
    return (
      it.area.toLowerCase().includes(q) ||
      it.venue.toLowerCase().includes(q) ||
      code.includes(q)
    );
  });

  // Curated sort: live first, then "Tonight", then weekend, tiebreak by distance.
  if (variant === "curated") {
    const priority = (it: Item): number => {
      if (it.kind === "live") return 0;
      const t = (it as GalaOpening | TwoTeamOpening).time.toLowerCase();
      if (t.startsWith("tonight") || t.startsWith("in ")) return 1;
      if (t.startsWith("tomorrow")) return 2;
      if (t.startsWith("sat")) return 3;
      if (t.startsWith("sun")) return 4;
      return 5;
    };
    filtered = [...filtered].sort((a, b) => {
      const p = priority(a) - priority(b);
      return p !== 0 ? p : a.km - b.km;
    });
  }
  if (typeof limit === "number") filtered = filtered.slice(0, limit);

  const headingLabel = variant === "curated" ? "Starting soon" : "Near you";

  // Skeleton card that matches the real card shape
  const SkeletonCard = () => (
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
  );

  return (
    <section className="px-5 pt-8">
      <div className="max-w-[680px] mx-auto">
        <div className="flex items-end justify-between mb-4">
          <div>
            <h2 className="font-display font-bold text-[26px] tracking-tight leading-none">
              {headingLabel}
            </h2>
            {variant === "curated" && (
              <p className="text-xs text-muted-foreground mt-1.5">
                A quick look at what&apos;s on. Browse all to filter.
              </p>
            )}
          </div>
          <Link
            to="/join"
            className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground shrink-0"
          >
            Browse all <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {isLoading ? (
          <ul className="space-y-3">
            {Array.from({ length: limit ?? 3 }).map((_, i) => (
              <li key={`skel-${i}`}><SkeletonCard /></li>
            ))}
          </ul>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/70 py-10 px-5 text-center">
            <Sparkles className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Nothing nearby right now. Be first — create a match.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map(it => (
              <li key={it.id}>
                {it.kind === "gala" ? <GalaRow s={it} /> :
                 it.kind === "two-team" ? <TwoTeamRow s={it} /> :
                 <LiveRow s={it} />}
              </li>
            ))}
          </ul>
        )}

        {variant === "curated" && !isLoading && filtered.length > 0 && (
          <Link
            to="/join"
            className="mt-4 w-full inline-flex items-center justify-center gap-2 h-12 rounded-2xl bg-secondary hover:bg-secondary/80 text-sm font-semibold transition-colors active:scale-[0.99]"
          >
            Browse all matches
            <ArrowRight className="w-4 h-4" />
          </Link>
        )}
      </div>
    </section>
  );
};

/* ---- Row primitives ---- */

// Splits "Sat · 4:00 PM" / "Tonight · 7:30 PM" into [when, time] for stacked display.
const splitTime = (t: string): { when: string; time: string } => {
  const parts = t.split("·").map(s => s.trim());
  if (parts.length === 2) return { when: parts[0], time: parts[1] };
  return { when: "", time: t };
};

const Chip = ({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "warn" | "live" }) => {
  const cls =
    tone === "warn" ? "bg-warn/15 text-warn"
    : tone === "live" ? "bg-live/15 text-live"
    : "bg-secondary text-foreground/75";
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold ${cls}`}>
      {children}
    </span>
  );
};

const TimeBlock = ({ when, time, accent }: { when: string; time: string; accent?: "warn" | "live" | null }) => (
  <div className="shrink-0 w-[68px] text-left border-r border-border/60 pr-3">
    {when && <p className="text-xs font-semibold text-muted-foreground tracking-tight">{when}</p>}
    <p className={`font-display font-extrabold text-[26px] leading-[1.05] tabular-nums tracking-tight mt-0.5 ${
      accent === "live" ? "text-live" : accent === "warn" ? "text-warn" : "text-foreground"
    }`}>
      {time}
    </p>
  </div>
);

const RowShell = ({
  to, children,
}: { to: string; accent?: "warn" | "live" | null; children: React.ReactNode }) => {
  return (
    <Link
      to={to}
      className="relative block bg-card rounded-2xl px-4 py-4 border border-border/60 transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-lg active:scale-[0.99]"
    >
      {children}
    </Link>
  );
};

const JoinCTA = ({ label = "Join", onClick }: { label?: string; onClick?: (e: React.MouseEvent) => void }) => (
  <button
    onClick={onClick}
    className="shrink-0 inline-flex items-center gap-1 bg-foreground text-background rounded-full pl-4 pr-3 h-10 text-sm font-bold transition-all hover:bg-foreground/90 active:scale-95"
  >
    {label}
    <ArrowRight className="w-4 h-4" strokeWidth={2.4} />
  </button>
);

const JoinedCTA = () => (
  <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full pl-3 pr-3 h-10 text-sm font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
    Joined
  </span>
);

/* ---- Variants ---- */

const GalaRow = ({ s }: { s: GalaOpening }) => {
  const slotsLeft = s.capTeams - s.teamsIn;
  const { when, time } = splitTime(s.time);
  const accent = slotsLeft <= 1 ? "warn" : null;
  const nav = useNavigate();
  const onJoin = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    nav(`/lobby/${s.code}`);
  };
  return (
    <RowShell to={`/lobby/${s.code}`} accent={accent}>
      <div className="flex items-center gap-3">
        <TimeBlock when={when} time={time} accent={accent} />
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold truncate leading-tight">{s.venue}</p>
          <p className="text-sm text-muted-foreground truncate mt-0.5">
            {s.area} · {s.km.toFixed(1)} km · ₵{s.pricePerPlayer}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <Chip><Repeat className="w-3 h-3" /> Gala {s.format}v{s.format}</Chip>
            <Chip tone={slotsLeft <= 1 ? "warn" : "default"}>
              {slotsLeft} team{slotsLeft === 1 ? "" : "s"} needed
            </Chip>
          </div>
        </div>
        {s.joined ? <JoinedCTA /> : <JoinCTA onClick={onJoin} />}
      </div>
    </RowShell>
  );
};

const TwoTeamRow = ({ s }: { s: TwoTeamOpening }) => {
  const left = s.cap - s.filled;
  const { when, time } = splitTime(s.time);
  const accent = left <= 2 ? "warn" : null;
  const nav = useNavigate();
  const onJoin = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    nav(`/lobby/${s.code}`);
  };
  return (
    <RowShell to={`/lobby/${s.code}`} accent={accent}>
      <div className="flex items-center gap-3">
        <TimeBlock when={when} time={time} accent={accent} />
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold truncate leading-tight">{s.venue}</p>
          <p className="text-sm text-muted-foreground truncate mt-0.5">
            {s.area} · {s.km.toFixed(1)} km · ₵{s.pricePerPlayer}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <Chip><UsersIcon className="w-3 h-3" /> {s.format}</Chip>
            <Chip tone={left <= 2 ? "warn" : "default"}>
              {left} spot{left === 1 ? "" : "s"} left
            </Chip>
          </div>
        </div>
        {s.joined ? <JoinedCTA /> : <JoinCTA onClick={onJoin} />}
      </div>
    </RowShell>
  );
};

const LiveRow = ({ s }: { s: LiveScore }) => (
  <RowShell to={`#`} accent="live">
    <div className="flex items-center gap-3">
      <div className="shrink-0 w-[68px] border-r border-border/60 pr-3 text-left">
        <p className="text-xs font-semibold text-live tracking-tight inline-flex items-center gap-1">
          <Radio className="w-3 h-3 animate-pulse" /> {s.minute}
        </p>
        <p className="font-display font-extrabold text-[26px] leading-[1.05] tabular-nums tracking-tight mt-0.5 text-live">
          {s.homeScore}<span className="text-muted-foreground mx-0.5">–</span>{s.awayScore}
        </p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold truncate leading-tight">{s.home} <span className="text-muted-foreground">vs</span> {s.away}</p>
        <p className="text-sm text-muted-foreground truncate mt-0.5">
          {s.venue} · {s.km.toFixed(1)} km
        </p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          <Chip tone="live"><Radio className="w-3 h-3" /> Live</Chip>
          <Chip>{s.format}</Chip>
        </div>
      </div>
    </div>
  </RowShell>
);
