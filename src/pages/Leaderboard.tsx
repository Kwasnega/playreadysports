import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Award, Trophy, Medal, User, TrendingUp, ArrowLeft, ChevronDown, ChevronUp,
  MapPin, Share2, X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLeaderboard, type Timeframe } from "@/hooks/useLeaderboard";

function initials(name: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const TIMEFRAMES: { key: Timeframe; label: string }[] = [
  { key: "all", label: "All Time" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
];

export default function Leaderboard() {
  const { user } = useAuth();
  const [timeframe, setTimeframe] = useState<Timeframe>("all");
  const [city, setCity] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const { players, cities, topVenue, loading, userRank, userEntry } =
    useLeaderboard(timeframe, city || null);

  const top3 = players.slice(0, 3);
  const rest = players.slice(3);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const shareText = userEntry && userRank
    ? `I'm ranked #${userRank} on PlayReady with ${userEntry.reputation_score.toFixed(1)} reputation points! Come play with me.`
    : "Check out the PlayReady leaderboard — find the best football players near you!";

  const handleShare = () => {
    const url = window.location.href;
    const text = `${shareText} ${url}`;
    if (navigator.share) {
      navigator.share({ title: "PlayReady Leaderboard", text, url });
    } else {
      navigator.clipboard.writeText(text);
    }
    setShareOpen(false);
  };

  return (
    <main className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="max-w-[680px] mx-auto px-5 h-14 flex items-center gap-3">
          <Link to="/" className="p-2 -ml-2 rounded-full hover:bg-secondary">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <Trophy className="w-5 h-5 text-amber-500" />
          <h1 className="font-display font-bold text-xl tracking-tight flex-1">Leaderboard</h1>
          <button
            onClick={() => setShareOpen(true)}
            className="p-2 rounded-full hover:bg-secondary"
            aria-label="Share"
          >
            <Share2 className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="max-w-[680px] mx-auto px-5 py-6 space-y-5">
        {/* Timeframe Tabs */}
        <div className="flex gap-2">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.key}
              onClick={() => setTimeframe(tf.key)}
              className={`flex-1 rounded-xl py-2 text-xs font-bold transition-colors ${
                timeframe === tf.key
                  ? "bg-foreground text-background"
                  : "bg-secondary text-muted-foreground hover:bg-secondary/80"
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>

        {/* City Filter */}
        {cities.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
            <button
              onClick={() => setCity("")}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                city === "" ? "bg-foreground text-background" : "bg-secondary text-muted-foreground"
              }`}
            >
              All Cities
            </button>
            {cities.map((c) => (
              <button
                key={c}
                onClick={() => setCity(c)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                  city === c ? "bg-foreground text-background" : "bg-secondary text-muted-foreground"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {/* Your Rank Card */}
        {user && userEntry && (
          <div className="bg-card rounded-2xl p-4 border border-border/60 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">
                {userEntry.full_name || userEntry.username || "You"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {userEntry.total_matches_played ?? 0} matches · {userEntry.total_wins ?? 0} wins
              </p>
            </div>
            <div className="text-right">
              <p className="font-display font-bold text-lg">#{userRank ?? "—"}</p>
              <p className="text-[10px] text-muted-foreground font-semibold">
                {userEntry.reputation_score.toFixed(1)} pts
              </p>
            </div>
          </div>
        )}

        {/* Top Venue */}
        {topVenue && (
          <div className="bg-card rounded-2xl p-4 border border-border/60 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5 text-emerald-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-emerald-600">Top Venue</p>
              <p className="text-sm font-semibold truncate">{topVenue.venueName}</p>
              <p className="text-[11px] text-muted-foreground">
                {topVenue.playerCount} ranked player{topVenue.playerCount !== 1 ? "s" : ""} play here
              </p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-32 bg-secondary rounded-2xl" />
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 bg-secondary rounded-2xl" />
            ))}
          </div>
        ) : players.length === 0 ? (
          <div className="text-center py-16">
            <Award className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-semibold">No rankings yet</p>
            <p className="text-[11px] text-muted-foreground mt-1 max-w-[28ch] mx-auto leading-relaxed">
              Play matches, show up on time, and get good reviews to climb the leaderboard.
            </p>
          </div>
        ) : (
          <>
            {/* Top 3 Podium */}
            {top3.length > 0 && (
              <div className="flex items-end justify-center gap-3 pt-2 pb-4">
                {top3[1] && (
                  <PodiumCard
                    player={top3[1]}
                    rank={2}
                    height="h-28"
                    medalColor="bg-slate-300 text-slate-700"
                  />
                )}
                {top3[0] && (
                  <PodiumCard
                    player={top3[0]}
                    rank={1}
                    height="h-36"
                    medalColor="bg-amber-400 text-amber-900"
                    isWinner
                  />
                )}
                {top3[2] && (
                  <PodiumCard
                    player={top3[2]}
                    rank={3}
                    height="h-24"
                    medalColor="bg-orange-300 text-orange-800"
                  />
                )}
              </div>
            )}

            {/* Full Ranked List */}
            <div className="bg-card rounded-2xl border border-border/60 overflow-hidden">
              <div className="px-5 py-3 border-b border-border/60 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rankings</p>
                <p className="text-[10px] text-muted-foreground">{players.length} players</p>
              </div>
              <div className="divide-y divide-border/60">
                {rest.map((p, i) => (
                  <ListRow
                    key={p.id}
                    player={p}
                    rank={i + 4}
                    isMe={p.id === user?.id}
                    expanded={expandedId === p.id}
                    onToggle={() => toggleExpand(p.id)}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Share Modal */}
      {shareOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={() => setShareOpen(false)}>
          <div className="bg-card rounded-3xl p-6 w-full max-w-sm space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-lg">Share</h2>
              <button onClick={() => setShareOpen(false)} className="p-1 rounded-full hover:bg-secondary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-gradient-to-br from-primary/20 to-primary/5 rounded-2xl p-5 text-center border border-primary/20">
              {userEntry?.avatar_url ? (
                <img src={userEntry.avatar_url} alt="" className="w-16 h-16 rounded-full object-cover mx-auto border-2 border-primary/30" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center text-xl font-bold mx-auto">
                  {initials(userEntry?.full_name || userEntry?.username)}
                </div>
              )}
              <p className="font-display font-bold text-2xl mt-3">#{userRank ?? "—"}</p>
              <p className="text-sm text-muted-foreground">
                {userEntry?.full_name || userEntry?.username || "You"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {userEntry?.reputation_score.toFixed(1)} reputation points
              </p>
            </div>
            <button
              onClick={handleShare}
              className="w-full bg-foreground text-background rounded-full py-3 text-sm font-semibold"
            >
              Share on WhatsApp
            </button>
            <button
              onClick={() => setShareOpen(false)}
              className="w-full bg-secondary text-foreground rounded-full py-3 text-sm font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function PodiumCard({
  player,
  rank,
  height,
  medalColor,
  isWinner,
}: {
  player: {
    id: string;
    username: string | null;
    full_name: string | null;
    avatar_url: string | null;
    reputation_score: number;
  };
  rank: number;
  height: string;
  medalColor: string;
  isWinner?: boolean;
}) {
  return (
    <Link
      to={`/player/${player.username || player.id}`}
      className={`flex flex-col items-center gap-2 ${height} justify-end flex-1 max-w-[120px]`}
    >
      <div className="relative">
        {player.avatar_url ? (
          <img
            src={player.avatar_url}
            alt=""
            className={`w-12 h-12 rounded-full object-cover border-2 ${isWinner ? "border-amber-400 w-14 h-14" : "border-border"}`}
          />
        ) : (
          <div
            className={`w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-sm font-bold ${isWinner ? "w-14 h-14" : ""}`}
          >
            {initials(player.full_name || player.username)}
          </div>
        )}
        <span
          className={`absolute -bottom-1 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full ${medalColor} flex items-center justify-center text-[10px] font-bold border-2 border-background`}
        >
          {rank}
        </span>
      </div>
      <p className={`text-xs font-semibold text-center truncate w-full px-1 ${isWinner ? "text-sm" : ""}`}>
        {player.full_name || player.username || "Player"}
      </p>
      <p className="text-[10px] text-muted-foreground font-semibold">{player.reputation_score.toFixed(1)}</p>
    </Link>
  );
}

function ListRow({
  player,
  rank,
  isMe,
  expanded,
  onToggle,
}: {
  player: {
    id: string;
    username: string | null;
    full_name: string | null;
    avatar_url: string | null;
    reputation_score: number;
    total_matches_played: number;
    total_wins: number;
    city: string | null;
  };
  rank: number;
  isMe?: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const winRate = player.total_matches_played > 0
    ? Math.round((player.total_wins / player.total_matches_played) * 100)
    : 0;

  return (
    <div className={`${isMe ? "bg-primary/5" : ""}`}>
      <button
        onClick={onToggle}
        className={`w-full flex items-center gap-3 px-5 py-3 transition-colors hover:bg-secondary/50 text-left`}
      >
        <span className="w-6 text-center text-sm font-bold text-muted-foreground shrink-0">{rank}</span>
        {player.avatar_url ? (
          <img src={player.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover border border-border/60 shrink-0" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-xs font-bold shrink-0">
            {initials(player.full_name || player.username)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{player.full_name || player.username || "Player"}</p>
          {player.city && <p className="text-[10px] text-muted-foreground">{player.city}</p>}
        </div>
        <span className="text-sm font-bold">{player.reputation_score.toFixed(1)}</span>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>
      {expanded && (
        <div className="px-5 pb-4 grid grid-cols-3 gap-3">
          <StatPill label="Matches" value={String(player.total_matches_played ?? 0)} />
          <StatPill label="Wins" value={String(player.total_wins ?? 0)} />
          <StatPill label="Win Rate" value={`${winRate}%`} />
          <div className="col-span-3 mt-1">
            <Link
              to={`/player/${player.username || player.id}`}
              className="block w-full text-center bg-secondary rounded-xl py-2 text-xs font-semibold hover:bg-secondary/80"
            >
              View Profile
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-secondary rounded-xl p-2.5 text-center">
      <p className="text-sm font-bold">{value}</p>
      <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">{label}</p>
    </div>
  );
}
