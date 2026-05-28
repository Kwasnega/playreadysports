import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, Wallet, Check, Share2, X, UserCheck,
  Calendar, MessageCircle, Hourglass, Flag,
} from "lucide-react";
import { LobbyChat } from "@/components/LobbyChat";
import { ShareMatchCard } from "@/components/matches/ShareMatchCard";
import { useAuth } from "@/hooks/useAuth";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useMatchLobby } from "@/hooks/useMatchLobby";
import { useJoinRequests } from "@/hooks/useJoinRequests";
import { useMatchReviews } from "@/hooks/useReviews";
import { useWeather } from "@/hooks/useWeather";
import { PaymentModal } from "@/components/payment/PaymentModal";
// Paystack import removed — match join uses wallet-only flow now
import { getFormattedTime } from "@/lib/matchHelpers";
import { useWallet } from "@/hooks/useWallet";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { LobbyMatchTab } from "@/components/lobby/LobbyMatchTab";
import { LobbyTeamsTab } from "@/components/lobby/LobbyTeamsTab";
import { useCountdown, buildPlayerList, buildSpareList } from "@/components/lobby/LobbyShared";
import { MatchVotingModal, type PublicProfile } from "@/components/matches/MatchVotingModal";
import { SubmitMatchResult } from "@/components/matches/SubmitMatchResult";

/* Tier-3 Lobby — wired to Supabase --------------------------------------- */

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
    refresh,
  } = useMatchLobby(matchCode);

  const { acceptRequest, rejectRequest } = useJoinRequests(match?.id);
  const { myReviews, submitReview } = useMatchReviews(match?.id, user?.id);
  const { weather } = useWeather(venue?.lat, venue?.lng, match?.match_date);

  const [tab, setTab] = useState<"match" | "teams" | "chat">("match");
  const [ending, setEnding] = useState(false);
  const [chatUnread] = useState(0);
  const [chatPreview] = useState("");

  const [shareOpen, setShareOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paying, setPaying] = useState(false);

  /* ---- voting modal ---- */
  const [votingOpen, setVotingOpen] = useState(false);
  const [votingClosesAt, setVotingClosesAt] = useState<Date | null>(null);

  const getVotingDismissed = useCallback(() => {
    if (!match?.id || !user?.id) return false;
    return sessionStorage.getItem(`voted:${match.id}:${user.id}`) === 'true';
  }, [match?.id, user?.id]);

  const markVotingDismissed = useCallback(() => {
    if (!match?.id || !user?.id) return;
    sessionStorage.setItem(`voted:${match.id}:${user.id}`, 'true');
  }, [match?.id, user?.id]);

  // Check and show voting modal when match becomes completed
  useEffect(() => {
    if (!match?.id || !user?.id) {
      setVotingOpen(false);
      setVotingClosesAt(null);
      return;
    }

    // Only for completed matches
    if (match.status !== 'completed') {
      setVotingOpen(false);
      setVotingClosesAt(null);
      return;
    }

    // Exclude organizer from voting
    if (isOrganizer) {
      setVotingOpen(false);
      setVotingClosesAt(null);
      return;
    }

    // Must be an active participant
    if (!userParticipant || userParticipant.status !== 'active') {
      setVotingOpen(false);
      setVotingClosesAt(null);
      return;
    }

    // Already voted or dismissed this session
    if (getVotingDismissed()) {
      setVotingOpen(false);
      return;
    }

    let cancelled = false;

    const checkVoting = async () => {
      // 1. Check voting window
      const { data: window, error: wErr } = await supabase
        .from('match_voting_windows')
        .select('voting_closes_at, is_resolved')
        .eq('match_id', match.id)
        .single();

      if (cancelled) return;
      if (wErr || !window || window.is_resolved) {
        setVotingOpen(false);
        setVotingClosesAt(null);
        return;
      }

      const now = new Date();
      const closesAt = new Date(window.voting_closes_at);
      if (closesAt <= now) {
        setVotingOpen(false);
        setVotingClosesAt(null);
        return;
      }

      // 2. Check if user already voted in both categories
      const { count, error: vErr } = await supabase
        .from('match_votes')
        .select('*', { count: 'exact', head: true })
        .eq('match_id', match.id)
        .eq('voter_id', user.id);

      if (cancelled) return;
      if (vErr) {
        setVotingOpen(false);
        return;
      }

      if ((count ?? 0) >= 2) {
        markVotingDismissed();
        setVotingOpen(false);
        return;
      }

      if (!cancelled) {
        setVotingClosesAt(closesAt);
        setVotingOpen(true);
      }
    };

    checkVoting();
    return () => { cancelled = true; };
  }, [match?.status, match?.id, user?.id, isOrganizer, userParticipant, getVotingDismissed, markVotingDismissed]);

  // Realtime: watch match status changes to trigger voting check immediately
  useEffect(() => {
    if (!match?.id) return;

    const channel = supabase
      .channel(`match-status:${match.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'matches',
          filter: `id=eq.${match.id}`,
        } as any,
        (payload: any) => {
          if (payload.new?.status === 'completed' && payload.old?.status !== 'completed') {
            // Force re-check voting eligibility when match completes
            setVotingOpen(false);
            // The effect above will re-run because match.status changes via hook refresh
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [match?.id]);

  // Resolve __auto__ to the team with fewer core players
  // Map display names to valid DB enum values ('reds', 'blues')
  const resolvedTeam = useMemo(() => {
    if (teamFromUrl && teamFromUrl !== "__auto__") {
      return teamFromUrl === "red" ? "reds" : teamFromUrl === "blue" ? "blues" : teamFromUrl;
    }
    const teamA = (match?.team_color_a ?? "Red").toLowerCase();
    const teamB = (match?.team_color_b ?? "Blue").toLowerCase();
    const enumA = teamA === "red" ? "reds" : teamA === "blue" ? "blues" : teamA;
    const enumB = teamB === "red" ? "reds" : teamB === "blue" ? "blues" : teamB;
    const countA = coreList.filter((p: any) => p.team === enumA).length;
    const countB = coreList.filter((p: any) => p.team === enumB).length;
    return countA <= countB ? enumA : enumB;
  }, [teamFromUrl, match?.team_color_a, match?.team_color_b, coreList]);

  const matchMode = match?.match_mode === "gala" ? "gala" : "two-team";
  const targetDate = match?.match_date;
  const { h, m, s, totalSec, isLive } = useCountdown(targetDate);

  const venueCost = match ? Number(match.entry_fee) * maxCore : 0;
  const sharePerPlayer = maxCore && maxCore > 0 ? Math.ceil(venueCost / maxCore) : 0;
  const allPaid = corePaidCount >= maxCore;

  const corePlayers = buildPlayerList(coreList);
  const sparePlayers = buildSpareList(spareList);

  const openProfile = useCallback((idOrUsername: string) => {
    navigate(`/player/${idOrUsername}`);
  }, [navigate]);

  /* ─── Check-in time gate (~1 hour before match) ─── */
  const matchTimeMs = match ? new Date(match.match_date).getTime() : 0;
  const nowMs = Date.now();
  const hoursUntilMatch = matchTimeMs ? (matchTimeMs - nowMs) / (1000 * 60 * 60) : Infinity;
  const showCheckIn = match?.status !== 'completed' && match?.status !== 'cancelled' && hoursUntilMatch <= 1.5 && hoursUntilMatch >= -2;

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
      const { data, error } = await supabase.functions.invoke("scan-match-qr", { body: { token } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(data?.message || "Checked in!");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || "Check-in failed");
    } finally {
      setCheckInBusy(false);
    }
  };

  const endMatch = async () => {
    if (!match) return;
    const ok = await confirm({
      description: "Mark complete and release escrow? You receive the organizer incentive in your Play wallet; the venue owner gets the rest.",
    });
    if (!ok) return;
    setEnding(true);
    try {
      const { data, error } = await supabase.functions.invoke("complete-match", { body: { matchId: match.id } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const incentive = data?.organizerIncentive ?? 0;
      toast.success(incentive > 0 ? `Match complete! ₵${incentive} incentive added to your Play wallet.` : "Match complete!");
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
      const { error } = await supabase.functions.invoke("cancel-match", { body: { matchId: match.id } });
      if (error) throw error;
      toast.success("Match cancelled");
      navigate("/");
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel match");
      setEnding(false);
    }
  };

  const { balance, payForMatch } = useWallet();

  const handleJoinPaid = () => {
    if (!match?.id) return;
    setPaymentModalOpen(true);
  };

  const handleWalletPay = async () => {
    if (!match?.id) return;
    if (balance < sharePerPlayer) {
      toast.error(`Insufficient balance. Please top up ₵${sharePerPlayer - balance} in your Wallet.`);
      navigate('/wallet');
      return;
    }
    setPaying(true);
    const team = userParticipant?.team || resolvedTeam || "unassigned";
    const res = await payForMatch(match.id, team, "core");
    if (res.success) {
      toast.success("Payment confirmed! You're in.");
      setPaymentModalOpen(false);
      setPaying(false);
      await refresh();
    } else {
      toast.error(res.error || "Payment failed");
      setPaying(false);
    }
  };

  const handleJoinFree = async () => {
    if (!match?.id) return;
    try {
      const { data, error } = await supabase.functions.invoke("join-free-match", {
        body: { matchId: match.id, team: resolvedTeam || "unassigned" },
      });
      if (error) throw error;
      if (data?.waitlisted) {
        toast.info(`Match is full — you're #${data.position} on the waitlist`);
      } else {
        toast.success("Joined!");
      }
      await refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to join");
    }
  };

  const handleLeaveMatch = async () => {
    if (!match?.id || !userParticipant) return;
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
      const { data, error } = await supabase.functions.invoke("leave-match", { body: { matchId: match.id } });
      if (error) throw error;
      toast.success(data?.message || "Left match");
      navigate("/");
    } catch (err: any) {
      toast.error(err.message || "Failed to leave match");
      setEnding(false);
    }
  };

  const handlePaystackSuccess = async () => {
    toast.success("Payment successful!");
    setPaymentModalOpen(false);
    setPaying(false);
    await refresh();
  };

  /* ---- Contextual CTA ---- */
  const cta = useMemo(() => {
    if (!match) return null;
    if (match.status === 'completed') return { label: "Match Over", icon: Flag, disabled: true, onClick: () => {}, tone: "neutral" as const };
    if (match.status === 'cancelled') return { label: "Match Cancelled", icon: X, disabled: true, onClick: () => {}, tone: "neutral" as const };
    if (isOrganizer) {
      if (allPaid) return { label: "Match confirmed", icon: Check, disabled: true, onClick: () => {}, tone: "success" as const };
      if (corePaidCount === maxCore - 1) return { label: `Cover last slot · ₵${sharePerPlayer}`, icon: Wallet, disabled: paying, onClick: handleJoinPaid, tone: "primary" as const };
      return { label: `${corePaidCount}/${maxCore} paid · waiting`, icon: Hourglass, disabled: true, onClick: () => {}, tone: "neutral" as const };
    }
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
      return { label: paying ? "Paying…" : `Pay ₵${sharePerPlayer}`, icon: Wallet, disabled: paying, tone: "primary" as const, onClick: handleJoinPaid };
    }
    if (allPaid) {
      return { label: "Match confirmed · Add to calendar", icon: Calendar, disabled: false, tone: "success" as const, onClick: () => toast.success("Added to your calendar") };
    }
    return { label: `Waiting · ${corePaidCount}/${maxCore} paid`, icon: Hourglass, disabled: true, tone: "neutral" as const, onClick: () => {} };
  }, [isOrganizer, allPaid, corePaidCount, maxCore, sharePerPlayer, match, userParticipant, paying]);

  // Countdown display
  const isMatchOver = match?.status === 'completed';
  const isMatchLive = isLive && !isMatchOver;
  const countdownMain = isMatchOver
    ? "Match Over"
    : isMatchLive
    ? "Live now"
    : totalSec < 3600
    ? `${m}m ${String(s).padStart(2, "0")}s`
    : `${h}h ${String(m).padStart(2, "0")}m`;
  const countdownSub = isMatchOver
    ? "This match has ended"
    : isMatchLive
    ? "Match in progress"
    : `${String(s).padStart(2, "0")}s`;

  const turfOwners = useMemo(() => new Set(activeParticipants.filter((p: any) => p.slot_type === "turf_owner").map((p: any) => p.user_id)), [activeParticipants]);

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
              <Wallet className="w-3.5 h-3.5" /><span>₵{Number(balance || 0).toFixed(2)}</span>
            </button>
          )}
          <button onClick={() => setShareOpen(true)} className="p-2 rounded-full hover:bg-secondary" aria-label="Share match"><Share2 className="w-4 h-4" /></button>
        </div>
        {/* Tab strip */}
        <div className="max-w-[680px] mx-auto px-5 pb-2">
          <div className={`grid gap-2 ${userParticipant ? "grid-cols-3" : "grid-cols-2"}`}>
            {([
              { id: "match" as const, label: "Match" },
              { id: "teams" as const, label: `Teams · ${corePaidCount}/${maxCore}` },
              ...(userParticipant ? [{ id: "chat" as const, label: "Chat" }] : []),
            ] as const).map(t => (
              <button key={t.id} onClick={() => setTab(t.id as any)} data-active={tab === t.id} className="pill-tab text-xs">
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
          {userParticipant && tab !== "chat" && chatUnread > 0 && chatPreview && (
            <button onClick={() => setTab("chat")} className="mt-2 w-full text-left flex items-center gap-2 rounded-2xl bg-secondary/70 px-3 py-2 text-xs text-muted-foreground hover:bg-secondary transition-colors">
              <MessageCircle className="w-3.5 h-3.5 shrink-0 text-foreground/70" />
              <span className="truncate">{chatPreview}</span>
              <span className="ml-auto text-[10px] bg-destructive text-background rounded-full px-1.5 shrink-0">{chatUnread}</span>
            </button>
          )}
        </div>
      </header>

      {/* Match over overlay */}
      {match && (match.status === "completed" || match.status === "cancelled") && (
        <div className="max-w-[680px] mx-auto px-5 pt-8 pb-4 text-center">
          <div className="rounded-3xl border border-border/60 bg-card p-8 space-y-3">
            <p className="text-4xl">{match.status === "completed" ? "🏁" : "🚫"}</p>
            <h2 className="font-display font-bold text-xl">{match.status === "completed" ? "Match Finished" : "Match Cancelled"}</h2>
            <p className="text-sm text-muted-foreground">{match.status === "completed" ? "Thanks for playing! Reviews are open below." : "This match has been cancelled. Any fees paid will be refunded."}</p>
            <Link to="/" className="inline-block mt-2 bg-foreground text-background rounded-full px-5 py-2.5 text-sm font-semibold">Back to Home</Link>
          </div>
        </div>
      )}

      <div className="max-w-[680px] mx-auto px-5 py-5 space-y-5">
        {tab === "match" && (
          <LobbyMatchTab
            match={match}
            venue={venue}
            organizer={organizer}
            weather={weather}
            isOrganizer={isOrganizer}
            userParticipant={userParticipant}
            user={user}
            countdownMain={countdownMain}
            countdownSub={countdownSub}
            isLive={isMatchLive}
            venueCost={venueCost}
            sharePerPlayer={sharePerPlayer}
            allPaid={allPaid}
            corePaidCount={corePaidCount}
            maxCore={maxCore}
            showCheckIn={showCheckIn}
            checkInCode={checkInCode}
            setCheckInCode={setCheckInCode}
            checkInBusy={checkInBusy}
            scanning={scanning}
            startScan={startScan}
            stopScan={stopScan}
            submitCheckIn={submitCheckIn}
            endMatch={endMatch}
            cancelMatch={cancelMatch}
            ending={ending}
            onLeaveMatch={handleLeaveMatch}
            openProfile={openProfile}
            activeParticipants={activeParticipants}
            myReviews={myReviews}
            submitReview={submitReview}
            matchCode={matchCode}
          />
        )}

        {/* Organizer result submission — only when match is live */}
        {tab === "match" && isOrganizer && match?.status === "live" && (
          <SubmitMatchResult
            matchId={match.id}
            teamAName={match?.team_color_a ?? "Team A"}
            teamBName={match?.team_color_b ?? "Team B"}
            isGala={match?.match_mode === "gala"}
            onSubmitted={() => toast.success("Match completed!")}
          />
        )}

        {tab === "teams" && (
          <LobbyTeamsTab
            match={match}
            matchMode={matchMode}
            coreList={coreList}
            spareList={spareList}
            coreCount={coreCount}
            maxCore={maxCore}
            corePaidCount={corePaidCount}
            isOrganizer={isOrganizer}
            joinRequests={joinRequests}
            acceptRequest={acceptRequest}
            rejectRequest={rejectRequest}
            userParticipant={userParticipant}
            paying={paying}
            handleJoinPaid={handleJoinPaid}
            handleJoinFree={handleJoinFree}
            openAuth={openAuth}
            user={user}
            openProfile={openProfile}
          />
        )}

        {tab === "chat" && match && userParticipant && (
          <LobbyChat
            matchCode={matchCode}
            matchId={match.id}
            isOrganizer={isOrganizer}
            turfOwners={turfOwners}
          />
        )}
      </div>

      {/* Sticky contextual CTA */}
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
          walletBalance={balance}
          onPayWithWallet={handleWalletPay}
          onClose={() => { setPaymentModalOpen(false); setPaying(false); }}
        />
      )}

      {/* Man of the Match voting */}
      {match && votingClosesAt && (
        <MatchVotingModal
          matchId={match.id}
          participants={activeParticipants
            .filter((p) => p.user_id !== user?.id)
            .map((p): PublicProfile => ({
              id: p.id,
              user_id: p.user_id,
              full_name: p.full_name,
              username: p.username,
              avatar_url: p.avatar_url,
            }))}
          votingClosesAt={votingClosesAt}
          open={votingOpen}
          onClose={() => {
            setVotingOpen(false);
            markVotingDismissed();
          }}
        />
      )}
    </main>
  );
};

export default Lobby;
