import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, Users, Clock, Wallet, Check, Share2, Flag, X, UserCheck,
  Calendar, MapPin, MessageCircle, Trophy, Hourglass, Zap, Crown, Star,
  CloudSun, Droplets, UserPlus, QrCode, Camera,
} from "lucide-react";
import { LobbyChat } from "@/components/LobbyChat";
import { ShareMatchCard } from "@/components/matches/ShareMatchCard";
import { useAuth } from "@/hooks/useAuth";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useMatchLobby } from "@/hooks/useMatchLobby";
import { useJoinRequests } from "@/hooks/useJoinRequests";
import { useMatchReviews } from "@/hooks/useReviews";
import { useWeather } from "@/hooks/useWeather";
import { useFriends } from "@/hooks/useFriends";
import { PaymentModal } from "@/components/payment/PaymentModal";
import ReportButton from "@/components/ReportButton";
import { initPaystackPayment, generatePaymentReference } from "@/lib/paystack";
import { getFormattedTime } from "@/lib/matchHelpers";
import { useWallet } from "@/hooks/useWallet";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/* Tier-3 Lobby — wired to Supabase --------------------------------------- */

type SlotState = "paid" | "reserved" | "spare" | "open" | "unpaid";
type Player = { name: string; avatar: string; state: SlotState; userId?: string; username?: string };

/* ---- Countdown ---- */
const useCountdown = (targetStr: string | undefined) => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const target = targetStr ? new Date(targetStr) : new Date();
  const diffMs = target.getTime() - now.getTime();
  const diff = Math.max(0, diffMs);
  const isLive = diffMs < 0;
  const totalSec = Math.floor(diff / 1000);
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  return { h, m, s, totalSec, isLive, done: diff === 0 };
};

/* Helper: map participants to Player rows with open slots */
function buildPlayerList(raw: LobbyParticipant[]): Player[] {
  return raw.map((p) => {
    let s: SlotState = "open";
    if (p.payment_status === "paid") s = "paid";
    else if (p.status === "confirmed") s = "reserved";
    else if (p.status === "pending_payment") s = "unpaid";
    return {
      name: p.full_name || p.username || "Player",
      avatar: p.avatar_url || "",
      state: s,
      userId: p.user_id,
      username: p.username || undefined,
    };
  });
}

function buildSpareList(raw: LobbyParticipant[]): Player[] {
  return raw.map((p) => ({
    name: p.full_name || p.username || "Player",
    avatar: p.avatar_url || "",
    state: (p.payment_status === "paid" ? "spare" : "open") as SlotState,
    userId: p.user_id,
    username: p.username || undefined,
  }));
}

/* ---- Page ---- */
const Lobby = () => {
  const confirm = useConfirm();
  const { code } = useParams();
  const [params] = useSearchParams();
  const matchCode = code ?? "ACC-100";
  const teamFromUrl = params.get("team");
  const navigate = useNavigate();
  const { user, openAuth } = useAuth();
  const [checkInCode, setCheckInCode] = useState("");
  const [checkInBusy, setCheckInBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
    }
  }, []);

  const {
    match,
    venue,
    organizer,
    activeParticipants,
    coreList,
    spareList,
    joinRequests,
    coreCount,
    corePaidCount,
    maxCore,
    isOrganizer,
    userParticipant,
    loading,
  } = useMatchLobby(matchCode);

  const { acceptRequest, rejectRequest } = useJoinRequests(match?.id);
  const { myReviews, submitReview } = useMatchReviews(match?.id, user?.id);
  const { weather } = useWeather(venue?.lat, venue?.lng, match?.match_date);

  const [tab, setTab] = useState<"match" | "teams" | "chat">("match");
  const [ending, setEnding] = useState(false);
  const [chatUnread] = useState(0); // TODO: wire from useLobbyChat unread count
  const [chatPreview] = useState("");

  // Review state
  const [reviewTarget, setReviewTarget] = useState<string | null>(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paying, setPaying] = useState(false);

  const matchMode = match?.match_mode === "gala" ? "gala" : "two-team";
  const targetDate = match?.match_date;
  const { h, m, s, totalSec, isLive, done } = useCountdown(targetDate);

  const venueCost = match ? Number(match.entry_fee) * maxCore : 0;
  const sharePerPlayer = match && maxCore > 0 ? Math.ceil(venueCost / maxCore) : 0;
  const allPaid = corePaidCount >= maxCore;

  const corePlayers = buildPlayerList(coreList, maxCore);
  const sparePlayers = buildSpareList(spareList);

  const openProfile = useCallback((idOrUsername: string) => {
    navigate(`/player/${idOrUsername}`);
  }, [navigate]);

  const copyCode = () => {
    navigator.clipboard.writeText(matchCode);
    toast.success(`Code ${matchCode} copied`);
  };

  const endMatch = async () => {
    if (!match) return;
    const ok = await confirm({
      description:
        "Mark complete and release escrow? You receive the organizer incentive in your Play wallet; the venue owner gets the rest.",
    });
    if (!ok) return;
    setEnding(true);
    try {
      const { data, error } = await supabase.functions.invoke("complete-match", {
        body: { matchId: match.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const incentive = data?.organizerIncentive ?? 0;
      toast.success(
        incentive > 0
          ? `Match complete! ₵${incentive} incentive added to your Play wallet.`
          : "Match complete!",
      );
      navigate("/");
    } catch (err: any) {
      toast.error(err.message || "Failed to end match");
      setEnding(false);
    }
  };

  const cancelMatch = async () => {
    if (!match) return;
    const ok = await confirm({
      description: "Cancel this match? All paid players will be refunded to their Play wallets.",
      variant: "destructive",
      confirmText: "Cancel Match",
    });
    if (!ok) return;
    setEnding(true);
    try {
      const { error } = await supabase.functions.invoke("cancel-match", {
        body: { matchId: match.id },
      });
      if (error) throw error;
      toast.success("Match cancelled");
      navigate("/");
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel match");
      setEnding(false);
    }
  };

  const { balance, payForMatch } = useWallet();

  const handleJoinPaid = async () => {
    if (!match?.id) return;
    if (balance < sharePerPlayer) {
      toast.error(`Insufficient balance. Please top up ₵${sharePerPlayer - balance} in your Wallet.`);
      navigate('/wallet');
      return;
    }
    
    setPaying(true);
    const team = userParticipant?.team || teamFromUrl || "unassigned";
    const res = await payForMatch(match.id, team, "core");
    
    if (res.success) {
      toast.success("Payment confirmed! You're in.");
      window.location.reload();
    } else {
      toast.error(res.error || "Payment failed");
      setPaying(false);
    }
  };

  const handleJoinFree = async () => {
    if (!match?.id) return;
    try {
      const { data, error } = await supabase.functions.invoke("join-free-match", {
        body: { matchId: match.id, team: teamFromUrl ?? "unassigned" },
      });
      if (error) throw error;
      if (data?.waitlisted) {
        toast.info(`Match is full — you're #${data.position} on the waitlist`);
      } else {
        toast.success("Joined!");
      }
      window.location.reload();
    } catch (err: any) {
      toast.error(err.message || "Failed to join");
    }
  };

  /* ---- Contextual CTA ---- */
  const cta = useMemo(() => {
    if (!match) return null;
    if (isOrganizer) {
      if (allPaid) return { label: "Match confirmed", icon: Check, disabled: true, onClick: () => {}, tone: "success" as const };
      if (corePaidCount === maxCore - 1) return { label: `Cover last slot · ₵${sharePerPlayer}`, icon: Wallet, disabled: paying, onClick: handleJoinPaid, tone: "primary" as const };
      return { label: `${corePaidCount}/${maxCore} paid · waiting`, icon: Hourglass, disabled: true, onClick: () => {}, tone: "neutral" as const };
    }
    // Joiner journey
    if (!userParticipant) {
      const isPaid = (match.entry_fee ?? 0) > 0;
      return {
        label: isPaid ? `Join · ₵${sharePerPlayer}` : "Join match",
        icon: UserCheck,
        disabled: paying,
        tone: "primary" as const,
        onClick: isPaid ? handleJoinPaid : handleJoinFree,
      };
    }
    if (userParticipant.status === "waitlist") {
      const pos = (userParticipant as any).waitlist_position ?? "?";
      return { label: `Waitlist #${pos}`, icon: Hourglass, disabled: true, tone: "neutral" as const, onClick: () => {} };
    }
    if (userParticipant.status === "pending") {
      return { label: "Request pending", icon: Hourglass, disabled: true, tone: "neutral" as const, onClick: () => {} };
    }
    if (userParticipant.status === "left") {
      return { label: "You left this match", icon: X, disabled: true, tone: "neutral" as const, onClick: () => {} };
    }
    if (userParticipant.payment_status === "unpaid") {
      return { label: paying ? "Paying…" : `Pay ₵${sharePerPlayer}`, icon: Wallet, disabled: paying, tone: "primary" as const,
        onClick: handleJoinPaid };
    }
    if (allPaid) {
      return { label: "Match confirmed · Add to calendar", icon: Calendar, disabled: false, tone: "success" as const,
        onClick: () => toast.success("Added to your calendar") };
    }
    return { label: `Waiting · ${corePaidCount}/${maxCore} paid`, icon: Hourglass, disabled: true, tone: "neutral" as const, onClick: () => {} };
  }, [isOrganizer, allPaid, corePaidCount, maxCore, sharePerPlayer, match, userParticipant, teamFromUrl, paying]);

  // Countdown display
  const countdownMain = isLive
    ? "Live now"
    : totalSec < 3600
      ? `${m}m ${String(s).padStart(2, "0")}s`
      : `${h}h ${String(m).padStart(2, "0")}m`;
  const countdownSub = isLive ? "Match in progress" : `${String(s).padStart(2, "0")}s`;

  /* ─── Check-in time gate (~1 hour before match) ─── */
  const matchTimeMs = match ? new Date(match.match_date).getTime() : 0;
  const nowMs = Date.now();
  const hoursUntilMatch = matchTimeMs ? (matchTimeMs - nowMs) / (1000 * 60 * 60) : Infinity;
  const showCheckIn = hoursUntilMatch <= 1.5 && hoursUntilMatch >= -2; // show 1.5h before until 2h after

  /* ─── QR Scanner helpers ─── */
  const startScan = async () => {
    if (!videoRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setScanning(true);

      const detect = async () => {
        if (!videoRef.current || !scanning) return;
        const hasDetector = "BarcodeDetector" in window;
        if (hasDetector) {
          try {
            const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
            const results = await detector.detect(videoRef.current);
            if (results.length > 0) {
              const raw = results[0].rawValue;
              stopScan();
              await submitCheckIn(raw);
              return;
            }
          } catch {}
        }
      };
      scanIntervalRef.current = setInterval(detect, 600);
    } catch {
      toast.error("Camera access denied or unavailable.");
    }
  };

  const stopScan = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setScanning(false);
  };

  const submitCheckIn = async (token: string) => {
    if (!token || !match?.id) return;
    setCheckInBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("scan-match-qr", {
        body: { token },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(data?.message || "Checked in!");
      window.location.reload();
    } catch (e: any) {
      toast.error(e?.message || "Check-in failed");
    } finally {
      setCheckInBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-background pb-28">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-md">
        <div className="max-w-[680px] mx-auto px-5 h-14 flex items-center gap-3">
          <Link to="/" className="p-2 -ml-2 rounded-full hover:bg-secondary"><ArrowLeft className="w-5 h-5" /></Link>
          <div className="flex-1 min-w-0">
            <h1 className="font-display font-bold text-lg tracking-tight truncate">{venue?.name ?? "Venue"}</h1>
            <p className="text-[11px] text-muted-foreground font-mono truncate">{matchCode} · {match?.format ?? "?"} · {match ? getFormattedTime(match.match_date) : ""}</p>
          </div>
          {user && (
            <button onClick={() => navigate("/wallet")} className="inline-flex items-center gap-1.5 bg-secondary text-foreground rounded-full px-2.5 py-1.5 text-xs font-semibold hover:bg-secondary/80">
              <Wallet className="w-3.5 h-3.5" />
              <span>₵{balance.toFixed(2)}</span>
            </button>
          )}
          <button onClick={() => setShareOpen(true)} className="p-2 rounded-full hover:bg-secondary" aria-label="Share match"><Share2 className="w-4 h-4" /></button>
        </div>
        {/* Tab strip */}
        <div className="max-w-[680px] mx-auto px-5 pb-2">
          <div className="grid grid-cols-3 gap-2">
            {([
              { id: "match" as const, label: "Match" },
              { id: "teams" as const, label: `Teams · ${corePaidCount}/${maxCore}` },
              { id: "chat" as const,  label: "Chat" },
            ] as const).map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                data-active={tab === t.id}
                className="pill-tab text-xs"
              >
                {t.label}
                {t.id === "teams" && joinRequests.length > 0 && isOrganizer && (
                  <span className="text-[10px] bg-primary text-primary-foreground rounded-full px-1.5 ml-1">{joinRequests.length}</span>
                )}
                {t.id === "chat" && chatUnread > 0 && (
                  <span className="text-[10px] bg-destructive text-background rounded-full px-1.5 ml-1">{chatUnread}</span>
                )}
              </button>
            ))}
          </div>
          {/* Chat preview pulls players in when Chat tab is not active */}
          {tab !== "chat" && chatUnread > 0 && chatPreview && (
            <button
              onClick={() => setTab("chat")}
              className="mt-2 w-full text-left flex items-center gap-2 rounded-2xl bg-secondary/70 px-3 py-2 text-xs text-muted-foreground hover:bg-secondary transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5 shrink-0 text-foreground/70" />
              <span className="truncate">{chatPreview}</span>
              <span className="ml-auto text-[10px] bg-destructive text-background rounded-full px-1.5 shrink-0">{chatUnread}</span>
            </button>
          )}
        </div>
      </header>

      <div className="max-w-[680px] mx-auto px-5 py-5 space-y-5">
        {/* ============ MATCH TAB ============ */}
        {tab === "match" && (
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
              <FactRow icon={Trophy}  label="Code" value={matchCode} mono />
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
                    <img
                      src={`https://openweathermap.org/img/wn/${weather.icon}@2x.png`}
                      alt={weather.description}
                      className="w-10 h-10 -my-2 -ml-1"
                    />
                  ) : (
                    <CloudSun className="w-5 h-5 text-muted-foreground" />
                  )}
                  <div>
                    <p className="text-sm font-semibold">
                      {weather.temp}°C · {weather.description}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Humidity {weather.humidity}% · Wind {Math.round(weather.windSpeed)} m/s
                    </p>
                  </div>
                </div>
                {weather.rainChance > 0 && (
                  <div className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full ${
                    weather.rainChance > 40
                      ? "bg-blue-500/10 text-blue-500"
                      : "bg-secondary text-muted-foreground"
                  }`}>
                    <Droplets className="w-3 h-3" />
                    {weather.rainChance}%
                  </div>
                )}
              </div>
            )}

            {/* Venue images */}
            {venue?.image_urls && venue.image_urls.length > 0 && (
              <div className="rounded-3xl overflow-hidden border border-border/60" style={{ boxShadow: "var(--shadow-card)" }}>
                <div className="relative aspect-[16/9]">
                  <img
                    src={venue.image_urls[0]}
                    alt={venue.name}
                    className="w-full h-full object-cover"
                  />
                  {venue.image_urls.length > 1 && (
                    <div className="absolute bottom-3 right-3 bg-black/60 text-white text-[11px] font-semibold px-2.5 py-1 rounded-full">
                      +{venue.image_urls.length - 1} more
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Status banner */}
            <div className={`rounded-3xl p-5 ${allPaid ? "tile-cool" : "tile-cream"}`}>
              <div className="flex items-start gap-3">
                {allPaid ? <Check className="w-5 h-5 shrink-0 mt-0.5" /> : <Clock className="w-5 h-5 shrink-0 mt-0.5" />}
                <div>
                  <p className="font-display font-bold text-base">
                    {allPaid ? "Match confirmed" : `${corePaidCount}/${maxCore} core players paid`}
                  </p>
                  <p className="text-xs opacity-75 mt-0.5 leading-relaxed">
                    {allPaid
                      ? "Venue locked. Spare players notified — no payment needed."
                      : "Match confirms when all core slots are paid."}
                  </p>
                </div>
              </div>
            </div>

            {/* Venue QR check-in (paid / active players) — time-gated ~1hr before */}
            {showCheckIn &&
              userParticipant?.status === "active" &&
              match?.status !== "cancelled" &&
              match?.status !== "completed" &&
              (userParticipant.payment_status === "paid" || (match.entry_fee ?? 0) <= 0) && (
              <div className="rounded-3xl border border-border/60 bg-card p-5 space-y-3" style={{ boxShadow: "var(--shadow-card)" }}>
                <div className="flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-primary" />
                  <h2 className="font-display font-bold text-base tracking-tight">Pitch check-in</h2>
                </div>
                {userParticipant.attendance_scanned ? (
                  <p className="text-sm text-emerald-600 font-medium flex items-center gap-2">
                    <Check className="w-4 h-4" /> You are checked in at the venue.
                  </p>
                ) : scanning ? (
                  <div className="space-y-3">
                    <div className="relative aspect-square rounded-2xl overflow-hidden border border-border bg-black">
                      <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
                      <div className="absolute inset-0 border-2 border-dashed border-white/30 rounded-2xl m-8" />
                    </div>
                    <p className="text-xs text-muted-foreground text-center">Point camera at the venue QR code</p>
                    <button
                      type="button"
                      onClick={stopScan}
                      className="w-full py-2.5 rounded-full bg-secondary text-sm font-semibold"
                    >
                      Cancel scan
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Tap the camera button to scan the venue QR code and check in.
                    </p>
                    <button
                      type="button"
                      onClick={startScan}
                      disabled={checkInBusy}
                      className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold rounded-full px-4 py-3 text-sm disabled:opacity-50"
                    >
                      <Camera className="w-4 h-4" />
                      {checkInBusy ? "Checking in…" : "Scan QR code"}
                    </button>
                    {/* Fallback manual input */}
                    <div className="pt-2 border-t border-border/40">
                      <p className="text-[10px] text-muted-foreground mb-2">Or paste code manually</p>
                      <div className="flex gap-2">
                        <input
                          value={checkInCode}
                          onChange={(e) => setCheckInCode(e.target.value.trim())}
                          placeholder="Paste check-in code"
                          className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-xs font-mono"
                          autoCapitalize="off"
                          autoCorrect="off"
                          spellCheck={false}
                        />
                        <button
                          type="button"
                          disabled={checkInBusy || !checkInCode}
                          onClick={() => submitCheckIn(checkInCode)}
                          className="px-4 py-2 rounded-xl bg-secondary text-xs font-semibold disabled:opacity-40"
                        >
                          Go
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {isOrganizer && (
              <div className="space-y-2">
                <button
                  onClick={endMatch}
                  disabled={ending}
                  className="w-full bg-success/10 text-success font-semibold rounded-full px-4 py-3.5 text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <Flag className="w-4 h-4" /> {ending ? "Completing…" : "Mark match as complete"}
                </button>
                <button
                  onClick={cancelMatch}
                  disabled={ending}
                  className="w-full bg-destructive/10 text-destructive font-semibold rounded-full px-4 py-3.5 text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <X className="w-4 h-4" /> {ending ? "Cancelling…" : "Cancel match"}
                </button>
              </div>
            )}

            {/* Leave match (non-organizer) */}
            {userParticipant && userParticipant.status === "active" && !isOrganizer && match?.status !== "completed" && match?.status !== "cancelled" && (
              <button
                onClick={async () => {
                  if (!match?.id) return;
                  const matchTime = new Date(match.match_date).getTime();
                  const hoursUntil = (matchTime - Date.now()) / (1000 * 60 * 60);
                  const canRefund = hoursUntil > 2 && userParticipant.payment_status === "paid";
                  const msg = canRefund
                    ? `You'll be refunded ₵${sharePerPlayer}. Leave this match?`
                    : hoursUntil <= 2 && userParticipant.payment_status === "paid"
                    ? "Your entry fee is non-refundable. Leave anyway?"
                    : "Leave this match?";
                  const ok = await confirm({ description: msg });
                  if (!ok) return;
                  setEnding(true);
                  try {
                    const { data, error } = await supabase.functions.invoke("leave-match", {
                      body: { matchId: match.id },
                    });
                    if (error) throw error;
                    toast.success(data?.message || "Left match");
                    navigate("/");
                  } catch (err: any) {
                    toast.error(err.message || "Failed to leave match");
                    setEnding(false);
                  }
                }}
                disabled={ending}
                className="w-full bg-secondary text-muted-foreground font-semibold rounded-full px-4 py-3.5 text-sm flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <X className="w-4 h-4" /> Leave match
              </button>
            )}

            {/* Report match / organizer */}
            {userParticipant && !isOrganizer && match?.status !== "cancelled" && (
              <div className="flex items-center justify-center">
                <ReportButton
                  matchId={match?.id}
                  reportedUserId={match?.organizer_id}
                  reportedName={organizer?.full_name || "organizer"}
                  size="sm"
                />
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
                    {activeParticipants
                      .filter((p) => p.user_id !== user?.id)
                      .filter((p) => !myReviews.some((r) => r.reviewed_user_id === p.user_id))
                      .map((p) => (
                        <li key={p.id}>
                          <button
                            onClick={() => { setReviewTarget(p.user_id); setReviewRating(0); setReviewComment(""); }}
                            className="w-full flex items-center gap-3 py-2 text-left hover:bg-secondary/50 rounded-xl px-2 transition-colors"
                          >
                            {p.avatar_url ? (
                              <img src={p.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold">
                                {(p.full_name ?? p.username ?? "?").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            <span className="text-sm font-semibold flex-1">{p.full_name ?? p.username ?? "Player"}</span>
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
                    <p className="text-sm font-semibold">
                      {activeParticipants.find((p) => p.user_id === reviewTarget)?.full_name ?? "Player"}
                    </p>
                    <div className="flex items-center gap-1 justify-center">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setReviewRating(i + 1)}
                          className="p-1"
                        >
                          <Star className={`w-7 h-7 transition-colors ${i < reviewRating ? "text-amber-500 fill-amber-500" : "text-muted-foreground"}`} />
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      placeholder="Optional comment..."
                      rows={2}
                      className="w-full bg-secondary rounded-2xl px-4 py-3 text-sm outline-none resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => setReviewTarget(null)}
                        className="flex-1 h-11 rounded-full bg-secondary text-sm font-semibold"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={async () => {
                          if (!reviewTarget || reviewRating === 0) return;
                          setReviewing(true);
                          const ok = await submitReview(reviewTarget, reviewRating, reviewComment);
                          setReviewing(false);
                          if (ok) {
                            toast.success("Review submitted");
                            setReviewTarget(null);
                            setReviewRating(0);
                            setReviewComment("");
                          } else {
                            toast.error("Already reviewed this player");
                          }
                        }}
                        disabled={reviewRating === 0 || reviewing}
                        className="flex-1 h-11 rounded-full bg-foreground text-background text-sm font-semibold disabled:opacity-40"
                      >
                        {reviewing ? "Submitting…" : "Submit"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ============ TEAMS TAB ============ */}
        {tab === "teams" && (
          <>
            {matchMode === "gala" ? (
              /* ---- GALA VIEW — keep demo for queue/scores, use real match data for header ---- */
              <>
                <section className="bg-card rounded-3xl p-5 border border-border/60" style={{ boxShadow: "var(--shadow-card)" }}>
                  <div className="flex items-center gap-2 mb-4">
                    <Trophy className="w-4 h-4 text-amber-500" />
                    <h2 className="font-display font-bold text-lg tracking-tight">On the pitch</h2>
                    <span className="text-[11px] font-mono text-muted-foreground ml-auto">Winner stays</span>
                  </div>
                  <p className="text-sm text-muted-foreground text-center py-4">Gala scores live here (Tier 3)</p>
                </section>
                <div className="rounded-2xl bg-secondary/50 px-4 py-3 text-xs text-muted-foreground text-center">
                  🔄 <strong className="text-foreground">Winner stays on.</strong> Loser rotates to the back of the queue. Next team steps up.
                </div>
              </>
            ) : (
              /* ---- TWO-TEAM VIEW ---- */
              <>
                {/* Organizer requests inline */}
                {isOrganizer && joinRequests.length > 0 && (
                  <section>
                    <div className="flex items-center gap-2 mb-3">
                      <Zap className="w-4 h-4 text-primary" />
                      <h2 className="font-display font-bold text-base tracking-tight">{joinRequests.length} join request{joinRequests.length === 1 ? "" : "s"}</h2>
                    </div>
                    <div className="space-y-2">
                      {joinRequests.map((r) => (
                        <div key={r.id} className="bg-card rounded-2xl p-3 flex items-center gap-3" style={{ boxShadow: "var(--shadow-card)" }}>
                          {r.avatar_url ? (
                            <img src={r.avatar_url} alt={r.full_name ?? ""} className="w-10 h-10 rounded-full object-cover" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                              <Users className="w-4 h-4 text-muted-foreground" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <button
                              onClick={(e) => { e.stopPropagation(); navigate(`/player/${r.username ?? r.full_name}`); }}
                              className="text-sm font-semibold truncate hover:text-primary"
                            >
                              {r.full_name ?? r.username ?? "Player"}
                            </button>
                            <p className="text-xs text-muted-foreground">{r.team || "No team"}</p>
                          </div>
                          <button
                            onClick={() => rejectRequest(r.id, r.full_name ?? r.username ?? "Player")}
                            className="w-9 h-9 rounded-full bg-secondary text-destructive flex items-center justify-center"
                            aria-label="Decline"
                          >
                            <X className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => acceptRequest(r.id, coreList)}
                            className="w-9 h-9 rounded-full bg-foreground text-background flex items-center justify-center"
                            aria-label="Accept"
                          >
                            <UserCheck className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                <section>
                  <div className="flex items-end justify-between mb-3">
                    <h2 className="font-display font-bold text-xl tracking-tight">Core · {coreCount}</h2>
                    <span className="text-xs text-muted-foreground">{corePaidCount} paid</span>
                  </div>
                  <ul className="divide-y divide-border">
                    {corePlayers.map((p, i) => (
                      <SlotRow
                        key={i}
                        player={p}
                        share={sharePerPlayer}
                        onClick={() => {
                          const target = p.username || p.userId;
                          if (target) openProfile(target);
                        }}
                      />
                    ))}
                  </ul>

                  {/* Cover last slot CTA in Teams tab */}
                  {corePaidCount === maxCore - 1 && (!userParticipant || userParticipant.status !== "active") && match?.status === "upcoming" && (
                    <button
                      onClick={() => {
                        if (!user) { openAuth("signin"); return; }
                        if ((match?.entry_fee ?? 0) > 0) handleJoinPaid();
                        else handleJoinFree();
                      }}
                      disabled={paying}
                      className="w-full mt-3 bg-emerald-500 text-white font-semibold rounded-full px-4 py-3.5 text-sm flex items-center justify-center gap-2 disabled:opacity-60 shadow-[0_0_20px_rgba(16,185,129,0.4)] animate-cta-pulse"
                    >
                      <Wallet className="w-4 h-4" /> Cover last slot · ₵{sharePerPlayer}
                    </button>
                  )}
                </section>

                <section>
                  <h2 className="font-display font-bold text-xl tracking-tight mb-3">Spare · {sparePlayers.length}</h2>
                  <div className="flex flex-wrap gap-2">
                    {sparePlayers.map((p, i) => (
                      <SlotRow
                        key={i}
                        player={p}
                        share={0}
                        onClick={() => {
                          const target = p.username || p.userId;
                          if (target) openProfile(target);
                        }}
                      />
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
                    Spare players pay nothing. They're a buffer in case a core player drops.
                  </p>
                </section>
              </>
            )}
          </>
        )}

        {/* ============ CHAT TAB ============ */}
        {tab === "chat" && match && (
          <LobbyChat matchCode={matchCode} matchId={match.id} isOrganizer={isOrganizer} />
        )}
      </div>

      {/* ============ Sticky contextual CTA ============ */}
      {cta && (
        <div className="fixed bottom-0 inset-x-0 z-30 bg-background/95 backdrop-blur-md border-t border-border">
          <div className="max-w-[680px] mx-auto px-5 py-3">
            <button
              onClick={cta.onClick}
              disabled={cta.disabled}
              className={`w-full inline-flex items-center justify-center gap-2 h-14 rounded-full text-sm font-bold disabled:opacity-50 active:scale-[0.99] transition-all ${
                cta.tone === "primary"
                  ? cta.label.startsWith("Cover")
                    ? "bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.4)] animate-cta-pulse"
                    : "bg-foreground text-background"
                  : cta.tone === "success"
                  ? "bg-success text-background"
                  : "bg-secondary text-foreground"
              }`}
            >
              <cta.icon className="w-5 h-5" />
              {cta.label}
            </button>
          </div>
        </div>
      )}

      {/* Share match card modal */}
      {match && (
        <ShareMatchCard
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          data={{
            joinCode: match.join_code,
            venueName: venue?.name ?? "Venue",
            venueCity: venue?.city ?? "",
            matchDate: getFormattedTime(match.match_date),
            format: match.format,
            mode: match.match_mode,
            entryFee: Number(match.entry_fee),
            spotsLeft: maxCore - coreCount,
          }}
        />
      )}

      {/* Payment modal */}
      {match && (
        <PaymentModal
          open={paymentModalOpen}
          matchName={match.join_code}
          matchCode={matchCode}
          entryFee={sharePerPlayer}
          onPay={async () => {
            if (!user?.email || !match?.id) return;
            setPaying(true);
            const ref = generatePaymentReference(matchCode, user.id);
            try {
              await initPaystackPayment({
                email: user.email,
                amount: sharePerPlayer,
                reference: ref,
                matchId: match.id,
                userId: user.id,
                joinCode: match.join_code,
                team: userParticipant?.team || teamFromUrl || "unassigned",
                entryFee: sharePerPlayer,
                onSuccess: handlePaystackSuccess,
                onClose: () => setPaying(false),
              });
            } catch (err: any) {
              setPaying(false);
              toast.error(err?.message || "Payment failed to start. Please try again.");
            }
          }}
          onClose={() => {
            setPaymentModalOpen(false);
            setPaying(false);
          }}
        />
      )}
    </main>
  );
};

/* ---- Sub-components ---- */

const FactRow = ({ icon: Icon, label, value, mono }: { icon: any; label: string; value: string; mono?: boolean }) => (
  <div className="flex items-center gap-3">
    <span className="w-8 h-8 rounded-full bg-secondary inline-flex items-center justify-center shrink-0">
      <Icon className="w-4 h-4 text-foreground/70" />
    </span>
    <div className="flex-1 min-w-0">
      <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</p>
      <p className={`text-sm font-semibold truncate ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  </div>
);

const SlotRow = ({ player, share, onClick }: { player: Player; share: number; onClick?: () => void }) => {
  const badge = {
    paid:     { label: "Paid",     cls: "bg-success/15 text-success" },
    reserved: { label: "Reserved", cls: "bg-primary/15 text-foreground" },
    spare:    { label: "Spare",    cls: "bg-primary/10 text-foreground border border-primary/20" },
    open:     { label: "Open",     cls: "bg-secondary text-muted-foreground" },
    unpaid:   { label: "Unpaid",   cls: "bg-warning/20 text-foreground" },
  }[player.state];
  const El = onClick ? "button" : "div";
  const btnProps = onClick ? { onClick, type: "button" as const } : {};
  return (
    <El
      className={`flex items-center gap-3 py-3 ${onClick ? "cursor-pointer hover:bg-secondary/80 transition-colors" : ""}`}
      {...btnProps}
    >
      {player.avatar ? (
        <img src={player.avatar} alt={player.name} className="w-9 h-9 rounded-full object-cover" />
      ) : (
        <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center">
          <Users className="w-4 h-4 text-muted-foreground" />
        </div>
      )}
      <div className="flex-1 min-w-0"><p className="text-sm font-semibold truncate">{player.name}</p></div>
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
      {share > 0 && player.state !== "spare" && player.state !== "open" && (
        <span className="text-[11px] font-mono font-semibold text-muted-foreground tabular-nums w-10 text-right">₵{share}</span>
      )}
    </El>
  );
};

export default Lobby;