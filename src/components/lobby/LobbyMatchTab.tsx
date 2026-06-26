import { useEffect, useState } from "react";
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
// FIX: Issue 2 - Import the new self-contained scanner that properly manages its own DOM lifecycle
import { QRScannerModal } from "./QRScannerModal";

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
  // FIX: Issue 2 - Removed: scanning, videoRef, startScan, stopScan — these were the
  // broken props that caused the camera-never-opens bug. The scanner is now fully
  // self-contained inside QRScannerModal.
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
    showCheckIn, checkInCode, setCheckInCode, checkInBusy,
    submitCheckIn,
    endMatch, cancelMatch, ending,
    onLeaveMatch, openProfile, activeParticipants, myReviews, submitReview, matchCode,
  } = props;

  // FIX: Issue 2 - Local state controls the QRScannerModal; no ref/stream plumbing needed
  const [scannerOpen, setScannerOpen] = useState(false);

  // Smart validation: Check if match can be completed
  const canCompleteMatch = () => {
    if (!match) return { allowed: false, reason: "Match data missing" };
    
    // Check if match date/time has passed
    const matchTime = new Date(match.match_date).getTime();
    const nowTime = new Date().getTime();
    if (matchTime > nowTime) {
      const diffMs = matchTime - nowTime;
      const diffMins = Math.ceil(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours > 0) {
        return { allowed: false, reason: `Match starts in ${diffHours}h ${diffMins % 60}m` };
      } else {
        return { allowed: false, reason: `Match starts in ${diffMins}m` };
      }
    }
    
    // Check if at least 50% of max players have paid
    const minPaidRequired = Math.ceil(maxCore * 0.5);
    if (corePaidCount < minPaidRequired) {
      return { allowed: false, reason: `Waiting for payments — ${corePaidCount}/${minPaidRequired} paid` };
    }
    
    // All checks passed
    return { allowed: true, reason: "Ready to complete" };
  };

  const completeCheck = canCompleteMatch();

  const [slideIdx, setSlideIdx] = useState(0);
  const imageUrls = venue?.image_urls?.filter(Boolean) ?? [];

  useEffect(() => {
    if (imageUrls.length <= 1) return;
    const id = window.setInterval(() => {
      setSlideIdx((i) => (i + 1) % imageUrls.length);
    }, 4000);
    return () => window.clearInterval(id);
  }, [imageUrls.length]);

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
          {Number(match?.entry_fee ?? 0) === 0 ? (
            <div className="flex items-center gap-3 py-1">
              <Wallet className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-[10px] uppercase tracking-widest font-black text-muted-foreground w-20 shrink-0">Entry</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest">FREE</span>
              <span className="text-[10px] font-bold text-muted-foreground">· organizer covers turf</span>
            </div>
          ) : (
            <FactRow icon={Wallet} label="Cost" value={`₵${venueCost} total`} />
          )}
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

      {/* Venue Images — slideshow when multiple uploaded */}
      {imageUrls.length > 0 && (
        <div className="rounded-2xl overflow-hidden border-2 border-border p-1 bg-card">
          <div className="relative aspect-[16/9] rounded-xl overflow-hidden">
            {imageUrls.map((url: string, idx: number) => (
              <img
                key={url}
                src={url}
                alt={venue?.name ?? "Venue"}
                className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${idx === slideIdx ? "opacity-100" : "opacity-0"}`}
              />
            ))}
            {imageUrls.length > 1 && (
              <>
                <div className="absolute bottom-3 right-3 bg-foreground/90 text-background text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-sm">
                  {slideIdx + 1} / {imageUrls.length}
                </div>
                <div className="absolute bottom-3 left-3 flex gap-1.5">
                  {imageUrls.map((_: string, idx: number) => (
                    <span key={idx} className={`w-1.5 h-1.5 rounded-full ${idx === slideIdx ? "bg-background" : "bg-background/40"}`} />
                  ))}
                </div>
              </>
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
          ) : (
            <>
              {/* FIX: Issue 2 - QR scanner button now opens the self-contained modal;
                  no videoRef plumbing required. */}
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground leading-relaxed">Tap camera to scan venue QR code</p>
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                disabled={checkInBusy}
                className="w-full flex items-center justify-center gap-2 bg-foreground text-background px-4 py-3.5 rounded-full text-[11px] font-black uppercase tracking-widest disabled:opacity-50 hover:bg-foreground/90 transition-colors"
              >
                <Camera className="w-4 h-4" />{checkInBusy ? "Checking in…" : "Scan QR Code"}
              </button>
              <div className="pt-4 border-t-2 border-border border-dashed">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Or enter 10-character code manually</p>
                <div className="flex gap-2">
                  <input value={checkInCode} onChange={(e) => setCheckInCode(e.target.value.trim().toUpperCase().slice(0, 10))} placeholder="E.G. A3K9M2X7Q1" maxLength={10} className="flex-1 rounded-xl border-2 border-border bg-background px-4 py-2.5 text-xs font-mono font-bold uppercase tracking-widest" autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
                  <button type="button" disabled={checkInBusy || !checkInCode} onClick={() => submitCheckIn(checkInCode)} className="px-5 py-2.5 rounded-xl border-2 border-foreground bg-foreground text-background text-[11px] font-black uppercase disabled:opacity-40 hover:opacity-90">Go</button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* FIX: Issue 2 - QRScannerModal is rendered at the top level (not inside the
          conditional) so its useEffect can reliably mount the video element. It is
          only displayed when scannerOpen is true. */}
      {scannerOpen && (
        <QRScannerModal
          onScan={(value) => {
            setScannerOpen(false);
            submitCheckIn(value);
          }}
          onClose={() => setScannerOpen(false)}
        />
      )}

      {!showCheckIn && userParticipant?.status === "active" && match?.status !== "cancelled" && match?.status !== "completed" && (
        <div className="rounded-2xl border-2 border-border bg-secondary p-4 flex items-start gap-3">
          <QrCode className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-black uppercase tracking-tight text-foreground">Check-in opens near kickoff</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground leading-relaxed mt-1">
              QR check-in appears from 90 minutes before kickoff until 2 hours after.
            </p>
          </div>
        </div>
      )}

      {/* Organizer actions */}
      {isOrganizer && match?.status !== 'completed' && match?.status !== 'cancelled' && (
        <div className="space-y-3">
          <div className="relative group">
            <button 
              onClick={endMatch} 
              disabled={ending || !completeCheck.allowed}
              title={completeCheck.reason}
              className={`w-full border-2 font-black uppercase tracking-widest text-[11px] rounded-full px-4 py-4 flex items-center justify-center gap-2 transition-all ${
                completeCheck.allowed 
                  ? "border-green-500 bg-green-500 text-white hover:opacity-90 active:scale-95" 
                  : "border-muted-foreground bg-muted-foreground/10 text-muted-foreground cursor-not-allowed opacity-60"
              }`}
            >
              <Flag className="w-4 h-4" /> {ending ? "Completing…" : "Complete Match"}
            </button>
            {!completeCheck.allowed && (
              <div className="absolute left-0 right-0 top-full mt-2 bg-card border-2 border-red-500/30 rounded-lg p-3 text-[10px] font-bold uppercase tracking-widest text-red-600 dark:text-red-400 z-50 whitespace-nowrap pointer-events-none">
                ⚠️ {completeCheck.reason}
              </div>
            )}
          </div>
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
                {[
                  { label: match.team_color_a ?? "Team A", value: "reds" },
                  { label: match.team_color_b ?? "Team B", value: "blues" },
                ].map((team) => (
                  <button key={team.value} disabled={ending} onClick={async () => {
                    if (!match.id) return;
                    const { error } = await supabase.from("matches").update({ winning_team: team.value } as any).eq("id", match.id);
                    if (error) toast.error("Failed to record result"); else { toast.success(`${team.label} wins!`); navigate(0); }
                  }} className="flex-1 py-3.5 rounded-full font-black text-[11px] uppercase tracking-widest border-2 border-border hover:border-foreground transition-all">{team.label}</button>
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
