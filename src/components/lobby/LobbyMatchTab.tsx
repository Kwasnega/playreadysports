import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Check, Clock, MapPin, Wallet, Trophy, Calendar, QrCode, Camera, X,
  CloudSun, Droplets, Flag, Star, Users,
} from "lucide-react";
import { FactRow } from "./LobbyShared";
import ReportButton from "@/components/ReportButton";
import { getFormattedTime } from "@/lib/matchHelpers";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { LobbyParticipant } from "./LobbyShared";

interface LobbyMatchTabProps {
  match: any;
  venue: any;
  organizer: any;
  weather: any;
  isOrganizer: boolean;
  userParticipant: any;
  user: any;
  countdownMain: string;
  countdownSub: string;
  isLive: boolean;
  venueCost: number;
  sharePerPlayer: number;
  allPaid: boolean;
  corePaidCount: number;
  maxCore: number;
  showCheckIn: boolean;
  checkInCode: string;
  setCheckInCode: (v: string) => void;
  checkInBusy: boolean;
  scanning: boolean;
  startScan: () => void;
  stopScan: () => void;
  submitCheckIn: (token: string) => void;
  endMatch: () => void;
  cancelMatch: () => void;
  ending: boolean;
  onLeaveMatch: () => void;
  openProfile: (id: string) => void;
  activeParticipants: LobbyParticipant[];
  myReviews: any[];
  submitReview: (target: string, rating: number, comment: string) => Promise<boolean>;
  matchCode: string;
}

export const LobbyMatchTab = (props: LobbyMatchTabProps) => {
  const navigate = useNavigate();
  const {
    match, venue, organizer, weather, isOrganizer, userParticipant, user,
    countdownMain, countdownSub, isLive,
    venueCost, sharePerPlayer, allPaid, corePaidCount, maxCore,
    showCheckIn, checkInCode, setCheckInCode, checkInBusy, scanning,
    startScan, stopScan, submitCheckIn,
    endMatch, cancelMatch, ending,
    onLeaveMatch, openProfile, activeParticipants, myReviews, submitReview, matchCode,
  } = props;

  const [reviewTarget, setReviewTarget] = useState<string | null>(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewing, setReviewing] = useState(false);

  const matchMode = match?.match_mode === "gala" ? "gala" : "two-team";

  return (
    <>
      {/* Countdown */}
      <div className={`rounded-3xl p-6 text-center ${isLive ? "bg-emerald-500/10" : "tile-cool"}`}>
        <p className="text-xs uppercase tracking-[0.18em] font-semibold opacity-70">{isLive ? "" : "Kickoff in"}</p>
        <p className={`font-display font-bold text-5xl mt-2 tracking-tight leading-none ${isLive ? "text-emerald-600 animate-pulse" : "animate-kickoff-pulse"}`}>
          {countdownMain}
        </p>
        <p className="text-xs opacity-70 mt-2 tabular-nums">{countdownSub}</p>
      </div>

      {/* Match facts */}
      <div className="bg-card rounded-3xl p-5 space-y-3" style={{ boxShadow: "var(--shadow-card)" }}>
        <FactRow icon={MapPin} label="Venue" value={`${venue?.name ?? "Venue"} · ${venue?.city ?? ""}`} />
        <FactRow icon={Clock} label="Kickoff" value={match ? getFormattedTime(match.match_date) : "—"} />
        <FactRow icon={Users} label="Format" value={`${matchMode === "gala" ? "Gala" : "Two-team"} · ${match?.format ?? "?"}`} />
        <FactRow icon={Wallet} label="Cost" value={`₵${venueCost} · ₵${sharePerPlayer}/player`} />
        <FactRow icon={Trophy} label="Code" value={matchCode} mono />
      </div>

      {/* Weather forecast */}
      {weather && (
        <div className={`rounded-2xl p-4 flex items-center justify-between ${
          weather.rainChance > 40
            ? "bg-blue-500/[0.07] border border-blue-500/20"
            : "bg-card border border-border/60"
        }`} style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="flex items-center gap-3">
            {weather.icon ? (
              <img src={`https://openweathermap.org/img/wn/${weather.icon}@2x.png`} alt={weather.description} className="w-10 h-10 -my-2 -ml-1" />
            ) : (
              <CloudSun className="w-5 h-5 text-muted-foreground" />
            )}
            <div>
              <p className="text-sm font-semibold">{weather.temp}°C · {weather.description}</p>
              <p className="text-[11px] text-muted-foreground">Humidity {weather.humidity}% · Wind {Math.round(weather.windSpeed)} m/s</p>
            </div>
          </div>
          {weather.rainChance > 0 && (
            <div className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full ${
              weather.rainChance > 40 ? "bg-blue-500/10 text-blue-500" : "bg-secondary text-muted-foreground"
            }`}>
              <Droplets className="w-3 h-3" />{weather.rainChance}%
            </div>
          )}
        </div>
      )}

      {/* Venue images */}
      {venue?.image_urls && venue.image_urls.length > 0 && (
        <div className="rounded-3xl overflow-hidden border border-border/60" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="relative aspect-[16/9]">
            <img src={venue.image_urls[0]} alt={venue.name} className="w-full h-full object-cover" />
            {venue.image_urls.length > 1 && (
              <div className="absolute bottom-3 right-3 bg-black/60 text-white text-[11px] font-semibold px-2.5 py-1 rounded-full">+{venue.image_urls.length - 1} more</div>
            )}
          </div>
        </div>
      )}

      {/* Status banner */}
      <div className={`rounded-3xl p-5 ${allPaid ? "tile-cool" : "tile-cream"}`}>
        <div className="flex items-start gap-3">
          {allPaid ? <Check className="w-5 h-5 shrink-0 mt-0.5" /> : <Clock className="w-5 h-5 shrink-0 mt-0.5" />}
          <div>
            <p className="font-display font-bold text-base">{allPaid ? "Match confirmed" : `${corePaidCount}/${maxCore} core players paid`}</p>
            <p className="text-xs opacity-75 mt-0.5 leading-relaxed">
              {allPaid ? "Venue locked. Spare players notified — no payment needed." : "Match confirms when all core slots are paid."}
            </p>
          </div>
        </div>
      </div>

      {/* QR check-in */}
      {showCheckIn && userParticipant?.status === "active" && match?.status !== "cancelled" && match?.status !== "completed" && (userParticipant.payment_status === "paid" || (match.entry_fee ?? 0) <= 0) && (
        <div className="rounded-3xl border border-border/60 bg-card p-5 space-y-3" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="flex items-center gap-2">
            <QrCode className="w-4 h-4 text-primary" />
            <h2 className="font-display font-bold text-base tracking-tight">Pitch check-in</h2>
          </div>
          {userParticipant.attendance_scanned ? (
            <p className="text-sm text-emerald-600 font-medium flex items-center gap-2"><Check className="w-4 h-4" /> You are checked in at the venue.</p>
          ) : scanning ? (
            <div className="space-y-3">
              <div className="relative aspect-square rounded-2xl overflow-hidden border border-border bg-black">
                <video className="w-full h-full object-cover" playsInline muted />
                <div className="absolute inset-0 border-2 border-dashed border-white/30 rounded-2xl m-8" />
              </div>
              <p className="text-xs text-muted-foreground text-center">Point camera at the venue QR code</p>
              <button type="button" onClick={stopScan} className="w-full py-2.5 rounded-full bg-secondary text-sm font-semibold">Cancel scan</button>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground leading-relaxed">Tap the camera button to scan the venue QR code and check in.</p>
              <button type="button" onClick={startScan} disabled={checkInBusy} className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold rounded-full px-4 py-3 text-sm disabled:opacity-50">
                <Camera className="w-4 h-4" />{checkInBusy ? "Checking in…" : "Scan QR code"}
              </button>
              <div className="pt-2 border-t border-border/40">
                <p className="text-[10px] text-muted-foreground mb-2">Or paste code manually</p>
                <div className="flex gap-2">
                  <input value={checkInCode} onChange={(e) => setCheckInCode(e.target.value.trim())} placeholder="Paste check-in code" className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-xs font-mono" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
                  <button type="button" disabled={checkInBusy || !checkInCode} onClick={() => submitCheckIn(checkInCode)} className="px-4 py-2 rounded-xl bg-secondary text-xs font-semibold disabled:opacity-40">Go</button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Organizer actions */}
      {isOrganizer && (
        <div className="space-y-2">
          <button onClick={endMatch} disabled={ending} className="w-full bg-success/10 text-success font-semibold rounded-full px-4 py-3.5 text-sm flex items-center justify-center gap-2 disabled:opacity-60">
            <Flag className="w-4 h-4" /> {ending ? "Completing…" : "Mark match as complete"}
          </button>
          <button onClick={cancelMatch} disabled={ending} className="w-full bg-destructive/10 text-destructive font-semibold rounded-full px-4 py-3.5 text-sm flex items-center justify-center gap-2 disabled:opacity-60">
            <X className="w-4 h-4" /> {ending ? "Cancelling…" : "Cancel match"}
          </button>
        </div>
      )}

      {/* Leave match (non-organizer) */}
      {userParticipant && userParticipant.status === "active" && !isOrganizer && match?.status !== "completed" && match?.status !== "cancelled" && (
        <button onClick={onLeaveMatch} disabled={ending} className="w-full bg-secondary text-muted-foreground font-semibold rounded-full px-4 py-3.5 text-sm flex items-center justify-center gap-2 disabled:opacity-60">
          <X className="w-4 h-4" /> Leave match
        </button>
      )}

      {/* Report */}
      {userParticipant && !isOrganizer && match?.status !== "cancelled" && (
        <div className="flex items-center justify-center">
          <ReportButton matchId={match?.id} reportedUserId={match?.organizer_id} reportedName={organizer?.full_name || "organizer"} size="sm" />
        </div>
      )}

      {/* Winning team picker */}
      {match?.status === "completed" && isOrganizer && matchMode !== "gala" && (
        <div className="bg-card rounded-3xl p-5 border border-border/60 space-y-3" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="flex items-center gap-2">
            <Flag className="w-4 h-4 text-amber-500" />
            <h2 className="font-display font-bold text-base tracking-tight">{match.winning_team ? "Result recorded" : "Record result"}</h2>
          </div>
          {match.winning_team ? (
            <p className="text-sm text-muted-foreground">Winner: <span className="font-bold text-foreground capitalize">{match.winning_team} team</span></p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">Which team won?</p>
              <div className="flex gap-2">
                {[match.team_color_a, match.team_color_b].filter(Boolean).map((color: string) => (
                  <button key={color} disabled={ending} onClick={async () => {
                    if (!match.id || !color) return;
                    const { error } = await supabase.from("matches").update({ winning_team: color } as any).eq("id", match.id);
                    if (error) toast.error("Failed to record result"); else { toast.success(`${color} team wins!`); navigate(0); }
                  }} className="flex-1 py-3 rounded-full font-semibold text-sm border border-border hover:bg-secondary/80 capitalize">{color} team</button>
                ))}
                <button disabled={ending} onClick={async () => {
                  if (!match.id) return;
                  const { error } = await supabase.from("matches").update({ winning_team: "draw" } as any).eq("id", match.id);
                  if (error) toast.error("Failed to record result"); else { toast.success("Draw recorded"); navigate(0); }
                }} className="flex-1 py-3 rounded-full font-semibold text-sm border border-border hover:bg-secondary/80">Draw</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Post-match reviews */}
      {match?.status === "completed" && userParticipant && (
        <div className="bg-card rounded-3xl p-5 border border-border/60 space-y-4" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-500" />
            <h2 className="font-display font-bold text-lg tracking-tight">Rate your teammates</h2>
          </div>
          {!reviewTarget ? (
            <ul className="space-y-2">
              {activeParticipants.filter((p) => p.user_id !== user?.id).filter((p) => !myReviews.some((r) => r.reviewed_user_id === p.user_id)).map((p) => (
                <li key={p.id}>
                  <button onClick={() => { setReviewTarget(p.user_id); setReviewRating(0); setReviewComment(""); }} className="w-full flex items-center gap-3 py-2 text-left hover:bg-secondary/50 rounded-xl px-2 transition-colors">
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold">{(p.full_name ?? p.username ?? "?").split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}</div>
                    )}
                    <span className="text-sm font-semibold flex-1">{p.full_name ?? p.username ?? "Player"}</span>
                    {p.no_show && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 shrink-0">No-show</span>
                    )}
                    <Star className="w-4 h-4 text-muted-foreground" />
                  </button>
                </li>
              ))}
              {activeParticipants.filter((p) => p.user_id !== user?.id).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-2">No teammates to review.</p>
              )}
              {activeParticipants.filter((p) => p.user_id !== user?.id).every((p) => myReviews.some((r) => r.reviewed_user_id === p.user_id)) && (
                <p className="text-sm text-muted-foreground text-center py-2">All teammates reviewed. 👍</p>
              )}
            </ul>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-semibold">{activeParticipants.find((p) => p.user_id === reviewTarget)?.full_name ?? "Player"}</p>
              <div className="flex items-center gap-1 justify-center">
                {Array.from({ length: 5 }).map((_, i) => (
                  <button key={i} onClick={() => setReviewRating(i + 1)} className="p-1">
                    <Star className={`w-7 h-7 transition-colors ${i < reviewRating ? "text-amber-500 fill-amber-500" : "text-muted-foreground"}`} />
                  </button>
                ))}
              </div>
              <textarea value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} placeholder="Optional comment..." rows={2} className="w-full bg-secondary rounded-2xl px-4 py-3 text-sm outline-none resize-none" />
              <div className="flex gap-2">
                <button onClick={() => setReviewTarget(null)} className="flex-1 h-11 rounded-full bg-secondary text-sm font-semibold">Cancel</button>
                <button onClick={async () => {
                  if (!reviewTarget || reviewRating === 0) return;
                  setReviewing(true);
                  const ok = await submitReview(reviewTarget, reviewRating, reviewComment);
                  setReviewing(false);
                  if (ok) {
                    toast.success("Review submitted");
                    setReviewTarget(null); setReviewRating(0); setReviewComment("");
                  } else {
                    toast.error("Already reviewed this player");
                  }
                }} disabled={reviewRating === 0 || reviewing} className="flex-1 h-11 rounded-full bg-foreground text-background text-sm font-semibold disabled:opacity-40">{reviewing ? "Submitting…" : "Submit"}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
};
