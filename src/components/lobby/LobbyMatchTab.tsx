import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Check, Clock, MapPin, Wallet, Trophy, Calendar, QrCode, Camera, X,
  CloudSun, Droplets, Flag, Star, Users, ThumbsUp,
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
      {/* Countdown - Invoice Header Style */}
      <div className={`border-2 rounded-2xl p-6 text-center ${isLive ? "border-foreground bg-foreground text-background" : "border-border bg-card"}`}>
        <p className="text-[10px] uppercase tracking-widest font-black opacity-80">{isLive ? "Status" : "Kickoff In"}</p>
        <p className={`font-display font-black text-5xl mt-1 tracking-tighter leading-none ${isLive ? "animate-pulse" : ""}`}>
          {countdownMain}
        </p>
        <p className="text-[11px] font-bold uppercase tracking-widest opacity-80 mt-2 tabular-nums">{countdownSub}</p>
      </div>

      {/* Match Facts - Receipt Grid Style */}
      <div className="bg-card rounded-2xl border-2 border-border overflow-hidden">
        <div className="px-5 py-3 border-b-2 border-border border-dashed bg-secondary/50">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Match Details</span>
        </div>
        <div className="p-5 space-y-4">
          <FactRow icon={MapPin} label="Venue" value={`${venue?.name ?? "Venue"} · ${venue?.city ?? ""}`} />
          <FactRow icon={Clock} label="Kickoff" value={match ? getFormattedTime(match.match_date) : "—"} />
          <FactRow icon={Users} label="Format" value={`${matchMode === "gala" ? "Gala" : "Two-team"} · ${match?.format ?? "?"}`} />
          <FactRow icon={Wallet} label="Cost" value={`₵${venueCost} total`} />
          <FactRow icon={Trophy} label="Code" value={matchCode} mono />
        </div>
      </div>

      {/* Weather Forecast - Stark Tag Style */}
      {weather && (
        <div className="rounded-2xl p-4 flex items-center justify-between bg-card border-2 border-border">
          <div className="flex items-center gap-3">
            {weather.icon ? (
              <img src={`https://openweathermap.org/img/wn/${weather.icon}@2x.png`} alt={weather.description} className="w-10 h-10 -my-2 -ml-1 grayscale opacity-80" />
            ) : (
              <CloudSun className="w-5 h-5 text-muted-foreground" />
            )}
            <div>
              <p className="text-sm font-bold uppercase tracking-wide">{weather.temp}°C · {weather.description}</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Hum {weather.humidity}% · Wind {Math.round(weather.windSpeed)}m/s</p>
            </div>
          </div>
          {weather.rainChance > 0 && (
            <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-sm border-2 border-foreground text-foreground">
              <Droplets className="w-3 h-3" />{weather.rainChance}%
            </div>
          )}
        </div>
      )}

      {/* Venue Images */}
      {venue?.image_urls && venue.image_urls.length > 0 && (
        <div className="rounded-2xl overflow-hidden border-2 border-border p-1 bg-card">
          <div className="relative aspect-[16/9] rounded-xl overflow-hidden">
            <img src={venue.image_urls[0]} alt={venue.name} className="w-full h-full object-cover transition-all" />
            {venue.image_urls.length > 1 && (
              <div className="absolute bottom-3 right-3 bg-foreground text-background text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-sm">+{venue.image_urls.length - 1} MORE</div>
            )}
          </div>
        </div>
      )}

      {/* Status Banner - High Contrast */}
      <div className={`rounded-2xl p-5 border-2 ${allPaid ? "border-foreground bg-foreground text-background" : "border-border bg-secondary"}`}>
        <div className="flex items-start gap-3">
          {allPaid ? <Check className="w-5 h-5 shrink-0 mt-0.5" /> : <Clock className="w-5 h-5 shrink-0 mt-0.5" />}
          <div>
            <p className="font-display font-black text-lg tracking-tight leading-none mb-1">{allPaid ? "Match Confirmed" : `${corePaidCount}/${maxCore} Paid`}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 leading-relaxed">
              {allPaid ? "Venue locked. Spare players notified." : "Match confirms when all core slots are paid."}
            </p>
          </div>
        </div>
      </div>

      {/* QR Check-in */}
      {showCheckIn && userParticipant?.status === "active" && match?.status !== "cancelled" && match?.status !== "completed" && (userParticipant.payment_status === "paid" || (match.entry_fee ?? 0) <= 0) && (
        <div className="rounded-2xl border-2 border-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2 border-b-2 border-dashed border-border pb-3">
            <QrCode className="w-5 h-5 text-foreground" />
            <h2 className="font-display font-black text-lg tracking-tight uppercase">Pitch Check-in</h2>
          </div>
          {userParticipant.attendance_scanned ? (
            <div className="bg-secondary p-4 rounded-xl border border-border">
              <p className="text-sm font-bold flex items-center gap-2"><Check className="w-4 h-4" /> Checked in</p>
            </div>
          ) : scanning ? (
            <div className="space-y-4">
              <div className="relative aspect-square rounded-xl overflow-hidden border-2 border-border bg-black">
                <video className="w-full h-full object-cover grayscale" playsInline muted />
                <div className="absolute inset-0 border-4 border-dashed border-white/50 rounded-xl m-8" />
              </div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-center">Point camera at venue QR</p>
              <button type="button" onClick={stopScan} className="w-full py-3 rounded-full border-2 border-border font-black text-[11px] uppercase tracking-widest">Cancel Scan</button>
            </div>
          ) : (
            <>
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground leading-relaxed">Tap camera to scan venue QR code</p>
              <button type="button" onClick={startScan} disabled={checkInBusy} className="w-full flex items-center justify-center gap-2 bg-foreground text-background px-4 py-3.5 rounded-full text-[11px] font-black uppercase tracking-widest disabled:opacity-50 hover:bg-foreground/90 transition-colors">
                <Camera className="w-4 h-4" />{checkInBusy ? "Checking in…" : "Scan QR Code"}
              </button>
              <div className="pt-4 border-t-2 border-border border-dashed">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Or paste code manually</p>
                <div className="flex gap-2">
                  <input value={checkInCode} onChange={(e) => setCheckInCode(e.target.value.trim())} placeholder="CODE" className="flex-1 rounded-xl border-2 border-border bg-background px-4 py-2.5 text-xs font-mono font-bold uppercase" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
                  <button type="button" disabled={checkInBusy || !checkInCode} onClick={() => submitCheckIn(checkInCode)} className="px-5 py-2.5 rounded-xl border-2 border-foreground bg-foreground text-background text-[11px] font-black uppercase disabled:opacity-40 hover:opacity-90">Go</button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Organizer actions */}
      {isOrganizer && match?.status !== 'completed' && match?.status !== 'cancelled' && (
        <div className="space-y-3">
          <button onClick={endMatch} disabled={ending} className="w-full border-2 border-foreground bg-foreground text-background font-black uppercase tracking-widest text-[11px] rounded-full px-4 py-4 flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-50">
            <Flag className="w-4 h-4" /> {ending ? "Completing…" : "Complete Match"}
          </button>
          <button onClick={cancelMatch} disabled={ending} className="w-full border-2 border-border bg-card text-foreground font-black uppercase tracking-widest text-[11px] rounded-full px-4 py-4 flex items-center justify-center gap-2 hover:bg-secondary transition-all disabled:opacity-50">
            <X className="w-4 h-4" /> {ending ? "Cancelling…" : "Cancel Match"}
          </button>
        </div>
      )}

      {/* Leave match (non-organizer) */}
      {userParticipant && userParticipant.status === "active" && !isOrganizer && match?.status !== "completed" && match?.status !== "cancelled" && (
        <button onClick={onLeaveMatch} disabled={ending} className="w-full border-2 border-border bg-card text-foreground font-black uppercase tracking-widest text-[11px] rounded-full px-4 py-4 flex items-center justify-center gap-2 hover:bg-secondary transition-all disabled:opacity-50">
          <X className="w-4 h-4" /> Leave Match
        </button>
      )}

      {/* Report */}
      {userParticipant && !isOrganizer && match?.status !== "cancelled" && (
        <div className="flex items-center justify-center mt-6">
          <ReportButton matchId={match?.id} reportedUserId={match?.organizer_id} reportedName={organizer?.full_name || "organizer"} size="sm" />
        </div>
      )}

      {/* Winning team picker */}
      {match?.status === "completed" && isOrganizer && matchMode !== "gala" && (
        <div className="bg-card rounded-2xl p-5 border-2 border-border space-y-4">
          <div className="flex items-center gap-2 border-b-2 border-dashed border-border pb-3">
            <Flag className="w-5 h-5 text-foreground" />
            <h2 className="font-display font-black text-lg uppercase tracking-tight">{match.winning_team ? "Result Recorded" : "Record Result"}</h2>
          </div>
          {match.winning_team ? (
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Winner: <span className="text-foreground">{match.winning_team} Team</span></p>
          ) : (
            <>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Select winner</p>
              <div className="flex gap-2">
                {[match.team_color_a, match.team_color_b].filter(Boolean).map((color: string) => (
                  <button key={color} disabled={ending} onClick={async () => {
                    if (!match.id || !color) return;
                    const { error } = await supabase.from("matches").update({ winning_team: color } as any).eq("id", match.id);
                    if (error) toast.error("Failed to record result"); else { toast.success(`${color} team wins!`); navigate(0); }
                  }} className="flex-1 py-3.5 rounded-full font-black text-[11px] uppercase tracking-widest border-2 border-border hover:border-foreground transition-all">{color}</button>
                ))}
                <button disabled={ending} onClick={async () => {
                  if (!match.id) return;
                  const { error } = await supabase.from("matches").update({ winning_team: "draw" } as any).eq("id", match.id);
                  if (error) toast.error("Failed to record result"); else { toast.success("Draw recorded"); navigate(0); }
                }} className="flex-1 py-3.5 rounded-full font-black text-[11px] uppercase tracking-widest border-2 border-border hover:border-foreground transition-all">Draw</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Post-match reviews */}
      {match?.status === "completed" && userParticipant && (
        <div className="bg-card rounded-2xl p-5 border-2 border-border space-y-4">
          <div className="flex items-center gap-2 border-b-2 border-dashed border-border pb-3">
            <Star className="w-5 h-5 text-foreground" />
            <h2 className="font-display font-black text-lg uppercase tracking-tight">Review Teammates</h2>
          </div>
          {!reviewTarget ? (
            <ul className="space-y-2">
              {activeParticipants.filter((p) => p.user_id !== user?.id).filter((p) => !myReviews.some((r) => r.reviewed_user_id === p.user_id)).map((p) => (
                <li key={p.id}>
                  <button onClick={() => { setReviewTarget(p.user_id); setReviewRating(0); setReviewComment(""); }} className="w-full flex items-center gap-3 py-2.5 px-3 border border-border rounded-xl text-left hover:border-foreground transition-colors">
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover grayscale" />
                    ) : (
                      <div className="w-8 h-8 rounded-full border border-border bg-secondary flex items-center justify-center text-[10px] font-bold text-foreground">{(p.full_name ?? p.username ?? "?").split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}</div>
                    )}
                    <span className="text-xs font-bold uppercase tracking-wide flex-1 text-foreground">{p.full_name ?? p.username ?? "Player"}</span>
                    {p.no_show && (
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded-sm border border-foreground text-foreground uppercase tracking-widest">No-Show</span>
                    )}
                    <Star className="w-4 h-4 text-muted-foreground" />
                  </button>
                </li>
              ))}
              {activeParticipants.filter((p) => p.user_id !== user?.id).length === 0 && (
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground text-center py-3">No teammates to review.</p>
              )}
              {activeParticipants.filter((p) => p.user_id !== user?.id).every((p) => myReviews.some((r) => r.reviewed_user_id === p.user_id)) && (
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground flex items-center justify-center gap-1 py-3">All reviewed <ThumbsUp className="w-3.5 h-3.5" /></p>
              )}
            </ul>
          ) : (
            <div className="space-y-4">
              <p className="text-xs font-bold uppercase tracking-wide text-center">{activeParticipants.find((p) => p.user_id === reviewTarget)?.full_name ?? "Player"}</p>
              <div className="flex items-center gap-2 justify-center">
                {Array.from({ length: 5 }).map((_, i) => (
                  <button key={i} onClick={() => setReviewRating(i + 1)} className="p-1 transition-transform hover:scale-110">
                    <Star className={`w-8 h-8 ${i < reviewRating ? "text-foreground fill-foreground" : "text-muted-foreground"}`} />
                  </button>
                ))}
              </div>
              <textarea value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} placeholder="COMMENT (OPTIONAL)" rows={2} className="w-full bg-background border-2 border-border rounded-xl px-4 py-3 text-xs font-bold uppercase placeholder:text-muted-foreground outline-none resize-none focus:border-foreground transition-colors" />
              <div className="flex gap-2 pt-2">
                <button onClick={() => setReviewTarget(null)} className="flex-1 h-12 rounded-full border-2 border-border text-[11px] font-black uppercase tracking-widest hover:bg-secondary">Cancel</button>
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
                }} disabled={reviewRating === 0 || reviewing} className="flex-1 h-12 rounded-full bg-foreground border-2 border-foreground text-background text-[11px] font-black uppercase tracking-widest disabled:opacity-40 hover:opacity-90">{reviewing ? "Wait…" : "Submit"}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
};
