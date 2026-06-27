import { Link, useNavigate } from "react-router-dom";
import { Radio, Repeat, Users as UsersIcon, ArrowRight, Sparkles, Link2 } from "lucide-react";
import { toast } from "sonner";

const copyJoinLink = (e: React.MouseEvent, code: string, venue: string, fee: number) => {
  e.preventDefault(); e.stopPropagation();
  const url = `${window.location.origin}/lobby/${code}`;
  const msg = fee > 0
    ? `Join my football match at ${venue}! Use code: ${code} or link: ${url} (₵${fee} entry)`
    : `Join my FREE football match at ${venue}! No entry fee! Use code: ${code} or link: ${url}`;
  navigator.clipboard?.writeText(msg).then(() => toast.success("Join link copied!")).catch(() => toast.error("Copy failed"));
};

// Renders a price display: bold pill for "FREE" or "₵{amount}" for paid
const PriceTag = ({ price }: { price: number }) =>
  price === 0 ? (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[9px] font-black uppercase tracking-widest">FREE</span>
  ) : (
    <span className="font-bold text-foreground">₵{price}</span>
  );

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
  isOrganizer?: boolean;
  friendCount?: number;
  friendAvatars?: string[];
  status?: string;
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
  isOrganizer?: boolean;
  friendCount?: number;
  friendAvatars?: string[];
  status?: string;
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
    if (!q) return true;
    const code = it.kind === "live" ? "" : it.code.toLowerCase();
    return (
      it.area.toLowerCase().includes(q) ||
      it.venue.toLowerCase().includes(q) ||
      code.includes(q)
    );
  });

  if (variant === "curated") {
    const priority = (it: Item): number => {
      if (it.kind === "live") return 0;
      const nonLive = it as GalaOpening | TwoTeamOpening;
      // Live status matches always first
      if (nonLive.status === "live_now") return 0;
      const t = nonLive.time.toLowerCase();
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

  const headingLabel = variant === "curated" ? "Starting Soon" : "Matches Near You";

  const SkeletonCard = () => (
    <div className="flex h-[116px] bg-card rounded-2xl border border-border animate-pulse overflow-hidden">
      <div className="w-24 border-r border-border bg-secondary/50" />
      <div className="flex-1 p-4 space-y-3">
        <div className="h-4 bg-secondary rounded w-3/4" />
        <div className="h-3 bg-secondary rounded w-1/2" />
        <div className="flex gap-2">
          <div className="h-5 bg-secondary rounded w-16" />
          <div className="h-5 bg-secondary rounded w-20" />
        </div>
      </div>
    </div>
  );

  return (
    <section className="px-5 pt-8">
      <div className="max-w-[680px] mx-auto">
        <div className="flex items-end justify-between mb-5">
          <div>
            <h2 className="font-display font-black text-2xl tracking-tighter uppercase">
              {headingLabel}
            </h2>
            {variant === "curated" && (
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mt-1">
                A quick look at what's on
              </p>
            )}
          </div>
          <Link
            to="/join"
            className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            Browse all <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: limit ?? 3 }).map((_, i) => (
              <SkeletonCard key={`skel-${i}`} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border py-10 px-5 text-center space-y-4 bg-card/30">
            <Sparkles className="w-6 h-6 text-muted-foreground mx-auto" />
            <p className="text-sm font-bold text-muted-foreground">
              Nothing nearby right now.<br/>Be first — create a match.
            </p>
            <Link
              to="/create"
              className="inline-flex items-center justify-center gap-2 bg-foreground text-background rounded-full px-6 h-10 text-xs font-bold hover:bg-foreground/90 transition-colors shadow-sm"
            >Create Match
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(it => (
              <div key={it.id}>
                {it.kind === "gala" ? <GalaRow s={it} /> :
                 it.kind === "two-team" ? <TwoTeamRow s={it} /> :
                 <LiveRow s={it} />}
              </div>
            ))}
          </div>
        )}

        {variant === "curated" && !isLoading && filtered.length > 0 && (
          <Link
            to="/join"
            className="mt-4 w-full inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-secondary hover:bg-secondary/80 text-sm font-bold transition-colors border border-border"
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

const splitTime = (t: string): { when: string; time: string } => {
  const parts = t.split("·").map(s => s.trim());
  if (parts.length === 2) return { when: parts[0], time: parts[1] };
  return { when: "", time: t };
};

const Chip = ({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "warn" | "live" }) => {
  const cls =
    tone === "warn" ? "border-foreground text-foreground"
    : tone === "live" ? "border-foreground text-background bg-foreground"
    : "border-border text-muted-foreground bg-secondary/50";
  return (
    <span className={`inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest border-[1.5px] ${cls}`}>
      {children}
    </span>
  );
};

const TimeBlock = ({ when, time, accent }: { when: string; time: string; accent?: "warn" | "live" | null }) => (
  <div className="w-[90px] shrink-0 border-r border-border border-dashed bg-secondary/40 flex flex-col items-center justify-center p-2 group-hover:bg-secondary/60 transition-colors">
    <span className={`text-[10px] font-black uppercase tracking-widest mb-1 ${accent === 'warn' ? 'text-foreground' : 'text-muted-foreground'}`}>{when}</span>
    <span className={`text-xl font-display font-black tracking-tighter leading-none ${accent === 'live' ? 'text-foreground animate-pulse' : 'text-foreground'}`}>
      {time.split(' ')[0]}
    </span>
    {time.split(' ')[1] && (
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-0.5">
        {time.split(' ')[1]}
      </span>
    )}
  </div>
);

const RowShell = ({
  to, children,
}: { to: string; accent?: "warn" | "live" | null; children: React.ReactNode }) => {
  return (
    <Link
      to={to}
      className="group flex bg-card rounded-2xl border border-border overflow-hidden transition-all duration-200 hover:border-foreground/40 shadow-sm active:scale-[0.99] relative"
    >
      {/* Sub-stub cutouts for realism */}
      <div className="absolute left-[84px] top-[-6px] w-3 h-3 rounded-full bg-background border border-border z-10" />
      <div className="absolute left-[84px] bottom-[-6px] w-3 h-3 rounded-full bg-background border border-border z-10" />
      {children}
    </Link>
  );
};

const JoinCTA = ({ label = "Join", onClick }: { label?: string; onClick?: (e: React.MouseEvent) => void }) => (
  <button
    onClick={onClick}
    className="shrink-0 inline-flex items-center justify-center h-8 px-3 rounded-full bg-foreground text-background text-[10px] font-black uppercase tracking-widest transition-all hover:opacity-90 shadow-sm"
  >
    {label}
  </button>
);

const ManageCTA = ({ onClick }: { onClick?: (e: React.MouseEvent) => void }) => (
  <button
    onClick={onClick}
    className="shrink-0 inline-flex items-center justify-center h-8 px-3 rounded-full border-[1.5px] border-foreground text-foreground text-[10px] font-black uppercase tracking-widest transition-all hover:bg-secondary"
  >
    Manage
  </button>
);

const JoinedCTA = () => (
  <span className="shrink-0 inline-flex items-center justify-center h-8 px-3 rounded-full border-[1.5px] border-border text-muted-foreground text-[10px] font-black uppercase tracking-widest bg-secondary">
    Joined
  </span>
);

const FriendAvatarStack = ({ count, avatars }: { count?: number; avatars?: string[] }) => {
  if (!count || count === 0) return null;
  return (
    <div className="flex items-center gap-1.5 border-l border-border pl-1.5">
      <div className="flex -space-x-1.5">
        {(avatars ?? []).slice(0, 3).map((a, i) =>
          a.startsWith("http") ? (
            <img
              key={i}
              src={a}
              alt=""
              className="w-4 h-4 rounded-full object-cover border border-background"
            />
          ) : (
            <div
              key={i}
              className="w-4 h-4 rounded-full bg-secondary flex items-center justify-center text-[7px] font-bold border border-background text-foreground"
            >
              {a?.toUpperCase() || "?"}
            </div>
          )
        )}
      </div>
      <span className="text-[9px] font-black uppercase tracking-widest text-foreground">{count} Friend{count > 1 ? "s" : ""}</span>
    </div>
  );
};

/* ---- Variants ---- */

const GalaRow = ({ s }: { s: GalaOpening }) => {
  const slotsLeft = s.capTeams - s.teamsIn;
  const isFull = slotsLeft <= 0;
  const isLive = s.status === "live_now";
  const { when, time } = splitTime(s.time);
  const accent = isLive ? "live" : slotsLeft <= 1 && !isFull ? "warn" : null;
  const nav = useNavigate();
  const onJoin = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    nav(`/lobby/${s.code}`);
  };
  return (
    <RowShell to={`/lobby/${s.code}`} accent={accent}>
      {isLive ? (
        <div className="w-[90px] shrink-0 border-r border-border border-dashed bg-secondary/40 flex flex-col items-center justify-center p-2">
          <span className="text-[10px] font-black uppercase tracking-widest mb-1 text-foreground animate-pulse inline-flex items-center gap-1">
            <Radio className="w-2.5 h-2.5" /> Live
          </span>
          <span className="text-xl font-display font-black tracking-tighter leading-none text-foreground">{s.format}v{s.format}</span>
        </div>
      ) : (
        <TimeBlock when={when} time={time} accent={accent} />
      )}
      <div className="flex-1 p-3.5 flex flex-col justify-center">
        <div className="flex items-start justify-between gap-2 mb-1">
          <p className="text-sm font-bold text-foreground leading-tight truncate">{s.venue}</p>
          <div className="flex items-center gap-1">
            {isFull ? (
              <span className="shrink-0 inline-flex items-center justify-center h-8 px-3 rounded-full border-[1.5px] border-border text-muted-foreground text-[10px] font-black uppercase tracking-widest bg-secondary/60">
                Full
              </span>
            ) : s.isOrganizer ? <ManageCTA onClick={onJoin} /> : s.joined ? <JoinedCTA /> : <JoinCTA onClick={onJoin} />}
          </div>
        </div>
        <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5 truncate">
          {s.area} <span className="text-[8px]">•</span> {s.km.toFixed(1)} km <span className="text-[8px]">•</span> <PriceTag price={s.pricePerPlayer} />
        </p>
        <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
          <Chip><Repeat className="w-2.5 h-2.5" /> Gala {s.format}v{s.format}</Chip>
          {isLive ? (
            <Chip tone="live"><Radio className="w-2.5 h-2.5" /> Live</Chip>
          ) : isFull ? (
            <Chip>Full — no spots</Chip>
          ) : (
            <Chip tone={slotsLeft <= 1 ? "warn" : "default"}>
              {slotsLeft} team{slotsLeft === 1 ? "" : "s"} needed
            </Chip>
          )}
          {s.friendCount ? <FriendAvatarStack count={s.friendCount} avatars={s.friendAvatars} /> : null}
        </div>
      </div>
    </RowShell>
  );
};

const TwoTeamRow = ({ s }: { s: TwoTeamOpening }) => {
  const left = s.cap - s.filled;
  const isFull = left <= 0;
  const isLive = s.status === "live_now";
  const { when, time } = splitTime(s.time);
  const accent = isLive ? "live" : left <= 2 && !isFull ? "warn" : null;
  const nav = useNavigate();
  const onJoin = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    nav(`/lobby/${s.code}`);
  };
  return (
    <RowShell to={`/lobby/${s.code}`} accent={accent}>
      {isLive ? (
        <div className="w-[90px] shrink-0 border-r border-border border-dashed bg-secondary/40 flex flex-col items-center justify-center p-2">
          <span className="text-[10px] font-black uppercase tracking-widest mb-1 text-foreground animate-pulse inline-flex items-center gap-1">
            <Radio className="w-2.5 h-2.5" /> Live
          </span>
          <span className="text-xl font-display font-black tracking-tighter leading-none text-foreground">{s.format}</span>
        </div>
      ) : (
        <TimeBlock when={when} time={time} accent={accent} />
      )}
      <div className="flex-1 p-3.5 flex flex-col justify-center">
        <div className="flex items-start justify-between gap-2 mb-1">
          <p className="text-sm font-bold text-foreground leading-tight truncate">{s.venue}</p>
          <div className="flex items-center gap-1">
            {isFull ? (
              <span className="shrink-0 inline-flex items-center justify-center h-8 px-3 rounded-full border-[1.5px] border-border text-muted-foreground text-[10px] font-black uppercase tracking-widest bg-secondary/60">
                Full
              </span>
            ) : s.isOrganizer ? <ManageCTA onClick={onJoin} /> : s.joined ? <JoinedCTA /> : <JoinCTA onClick={onJoin} />}
          </div>
        </div>
        <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5 truncate">
          {s.area} <span className="text-[8px]">•</span> {s.km.toFixed(1)} km <span className="text-[8px]">•</span> <PriceTag price={s.pricePerPlayer} />
        </p>
        <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
          <Chip><UsersIcon className="w-2.5 h-2.5" /> {s.format}</Chip>
          {isLive ? (
            <Chip tone="live"><Radio className="w-2.5 h-2.5" /> Live</Chip>
          ) : isFull ? (
            <Chip>Full — no spots</Chip>
          ) : (
            <Chip tone={left <= 2 ? "warn" : "default"}>
              {left} spot{left === 1 ? "" : "s"} left
            </Chip>
          )}
          {s.friendCount ? <FriendAvatarStack count={s.friendCount} avatars={s.friendAvatars} /> : null}
        </div>
      </div>
    </RowShell>
  );
};

const LiveRow = ({ s }: { s: LiveScore }) => (
  <RowShell to={`#`} accent="live">
    <div className="w-[90px] shrink-0 border-r border-border border-dashed bg-secondary/40 flex flex-col items-center justify-center p-2">
      <span className="text-[10px] font-black uppercase tracking-widest mb-1 text-foreground animate-pulse inline-flex items-center gap-1">
        <Radio className="w-2.5 h-2.5" /> {s.minute}
      </span>
      <p className="text-xl font-display font-black tracking-tighter leading-none text-foreground">
        {s.homeScore}<span className="text-muted-foreground mx-0.5">–</span>{s.awayScore}
      </p>
    </div>
    <div className="flex-1 p-3.5 flex flex-col justify-center">
      <p className="text-sm font-bold text-foreground leading-tight truncate">{s.home} <span className="text-muted-foreground font-medium">vs</span> {s.away}</p>
      <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5 truncate mt-1">
        {s.venue} <span className="text-[8px]">•</span> {s.km.toFixed(1)} km
      </p>
      <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
        <Chip tone="live">Live</Chip>
        <Chip>{s.format}</Chip>
      </div>
    </div>
  </RowShell>
);
