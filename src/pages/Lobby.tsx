import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, Wallet, Check, Share2, X, UserCheck,
  Calendar, MessageCircle, Hourglass, Flag, Ban, Lock, Unlock,
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
import MatchLineup from "@/components/matches/MatchLineup";

/* Tier-3 Lobby — wired to Supabase --------------------------------------- */

const normalizeTeamSide = (team?: string | null): "reds" | "blues" | "unassigned" => {
  const value = String(team ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["reds", "red", "team_a", "a"].includes(value)) return "reds";
  if (["blues", "blue", "team_b", "b"].includes(value)) return "blues";
  return "unassigned";
};

const Lobby = () => {
  const confirm = useConfirm();
  const { code } = useParams();
  const [params] = useSearchParams();
  const matchCode = code ?? "";
  const navigate = useNavigate();
  if (!matchCode) {
    return (
      <main className="min-h-screen bg-background flex flex-col items-center justify-center px-5">
        <h1 className="font-display font-bold text-xl mb-2">Invalid match code</h1>
        <p className="text-sm text-muted-foreground mb-4">No match code was provided.</p>
        <button onClick={() => navigate("/")} className="bg-primary text-primary-foreground px-6 py-2.5 text-sm font-bold">
          Go home
        </button>
      </main>
    );
  }
  const teamFromUrl = params.get("team");
  const { user, openAuth } = useAuth();
  const [checkInCode, setCheckInCode] = useState("");
  const [checkInBusy, setCheckInBusy] = useState(false);
  // FIX: Issue 2 - Removed: scanning state, videoRef, scanIntervalRef, scanningRef
  // and the broken startScan/stopScan functions. Camera scanning is now handled by
  // QRScannerModal which owns its own refs and lifecycle entirely.


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

  const [tab, setTab] = useState<"match" | "teams" | "chat" | "lineup">("match");
  const [lineupTeam, setLineupTeam] = useState<"reds" | "blues">("reds");
  const [ending, setEnding] = useState(false);
  const [chatUnread] = useState(0);
  const [chatPreview] = useState("");
  const [lineupEditingEnabled, setLineupEditingEnabled] = useState(true);

  // Auto-lock lineup 30 minutes before match start
  useEffect(() => {
    if (!match?.match_date) return;
    if (match.status === "completed" || match.status === "cancelled") return;
    
    const checkAutoLock = () => {
      const now = Date.now();
      const matchTime = new Date(match.match_date).getTime();
      const minutesUntilMatch = (matchTime - now) / (1000 * 60);
      
      // Auto-lock if less than 30 minutes before match
      if (minutesUntilMatch > 0 && minutesUntilMatch < 30 && lineupEditingEnabled) {
        setLineupEditingEnabled(false);
        toast.info("Lineup auto-locked 30 minutes before kickoff");
      }
    };

    checkAutoLock();
    const interval = setInterval(checkAutoLock, 60000); // Check every minute
    
    return () => clearInterval(interval);
  }, [match?.match_date, match?.status, lineupEditingEnabled]);

  // Fetch lineup editing state from match
  useEffect(() => {
    if (!match?.id) return;
    
    const fetchLineupState = async () => {
      const { data } = await supabase
        .from("matches")
        .select("lineup_editing_enabled")
        .eq("id", match.id)
        .single();
      
      if (data?.lineup_editing_enabled !== undefined) {
        setLineupEditingEnabled(data.lineup_editing_enabled);
      }
    };

    fetchLineupState();

    // Subscribe to changes
    const channel = supabase
      .channel(`lineup-editing:${match.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "matches",
          filter: `id=eq.${match.id}`,
        },
        (payload) => {
          if (payload.new?.lineup_editing_enabled !== undefined) {
            setLineupEditingEnabled(payload.new.lineup_editing_enabled);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [match?.id]);

  const toggleLineupEditing = async () => {
    if (!match?.id || !isOrganizer) return;
    
    const newState = !lineupEditingEnabled;
    const { error } = await supabase
      .from("matches")
      .update({ lineup_editing_enabled: newState })
      .eq("id", match.id);
    
    if (error) {
      toast.error("Failed to update lineup settings");
    } else {
      setLineupEditingEnabled(newState);
      toast.success(newState ? "Lineup opened for editing" : "Lineup locked");
    }
  };

  // Check if user can edit lineup
  const canEditLineup = isOrganizer || (lineupEditingEnabled && userParticipant?.status === "active");
  const userTeamSide = normalizeTeamSide(userParticipant?.team);
  const canEditCurrentTeam = canEditLineup && (isOrganizer || userTeamSide === lineupTeam);

  const [shareOpen, setShareOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const joinIntentHandledRef = useRef(false);

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
    const countA = coreList.filter((p: any) => normalizeTeamSide(p.team) === "reds").length;
    const countB = coreList.filter((p: any) => normalizeTeamSide(p.team) === "blues").length;
    return countA <= countB ? "reds" : "blues";
  }, [coreList]);

  const matchMode = match?.match_mode === "gala" ? "gala" : "two-team";
  const targetDate = match?.match_date;
  const { h, m, s, totalSec, isLive, kickoffPassed } = useCountdown(targetDate, match?.status);

  const venueCost = match ? Number(match.entry_fee) * maxCore : 0;
  const sharePerPlayer = maxCore && maxCore > 0 ? Math.ceil(venueCost / maxCore) : 0;
  const allPaid = corePaidCount >= maxCore;
  const showLineupTab = !!userParticipant && userParticipant.status !== "left" && match?.status === "full" && allPaid;

  useEffect(() => {
    if (tab === "lineup" && !showLineupTab) setTab("match");
  }, [showLineupTab, tab]);

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

  /* ─── QR Scanner helpers (delegated to QRScannerModal) ─── */
  // FIX: Issue 2 - startScan/stopScan removed; QRScannerModal manages its own camera
  // stream internally so these functions are no longer needed in Lobby.tsx.

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

  const handleJoinPaid = useCallback(() => {
    if (!match?.id) return;
    setPaymentModalOpen(true);
  }, [match?.id]);

  // FIX: Issue 1 - Guard auth before any Supabase call; previously an unauthenticated
  // user reaching the lobby via direct URL could trigger an RLS-blocked edge-function
  // call and receive a raw error in the UI.
  const handleJoinSubstitute = useCallback(async () => {
    if (!user) {
      toast.error("Please log in to join a match");
      openAuth();
      return;
    }
    if (!match?.id) return;
    try {
      const { data, error } = await supabase.functions.invoke("join-match", {
        body: { matchId: match.id, team: "unassigned", slotType: "spare" },
      });
      if (error) throw error;
      if (data?.waitlisted) {
        toast.info(`Match is full — you're substitute #${data.position}`);
      } else {
        toast.success("Joined as substitute");
      }
      await refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to join as substitute");
    }
  }, [match?.id, openAuth, refresh, user]);

  const handleWalletPay = async () => {
    if (!match?.id) return;
    if (balance < sharePerPlayer) {
      toast.error(`Insufficient balance. Please top up ₵${sharePerPlayer - balance} in your Wallet.`);
      navigate('/wallet');
      return;
    }
    setPaying(true);
    const team = normalizeTeamSide(userParticipant?.team || resolvedTeam);
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

  // FIX: Issue 1 - Guard auth before any Supabase call; same reason as handleJoinSubstitute.
  const handleJoinFree = useCallback(async () => {
    if (!user) {
      toast.error("Please log in to join a match");
      openAuth();
      return;
    }
    if (!match?.id) return;
    try {
      const { data, error } = await supabase.functions.invoke("join-free-match", {
        body: { matchId: match.id, team: normalizeTeamSide(resolvedTeam) },
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
  }, [match?.id, openAuth, refresh, resolvedTeam, user]);

  useEffect(() => {
    if (joinIntentHandledRef.current || loading || !match?.id || userParticipant) return;
    if (!teamFromUrl) return;

    if (!user) {
      openAuth();
      return;
    }

    joinIntentHandledRef.current = true;
    const wantsSubstitute = teamFromUrl.includes("substitute") || teamFromUrl === "__substitute__";
    if (wantsSubstitute || match.status === "full") {
      void handleJoinSubstitute();
      return;
    }

    if (Number(match.entry_fee ?? 0) > 0) {
      setPaymentModalOpen(true);
    } else {
      void handleJoinFree();
    }
  }, [allPaid, handleJoinFree, handleJoinSubstitute, loading, match?.entry_fee, match?.id, match?.status, openAuth, teamFromUrl, user, userParticipant]);

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
    const isFreeMatch = Number(match.entry_fee ?? 0) === 0;
    if (match.status === 'completed') return { label: "Match Over", icon: Flag, disabled: true, onClick: () => {}, tone: "neutral" as const };
    if (match.status === 'cancelled') return { label: "Match Cancelled", icon: X, disabled: true, onClick: () => {}, tone: "neutral" as const };
    if (isOrganizer) {
      if (allPaid) return { label: "Match confirmed", icon: Check, disabled: true, onClick: () => {}, tone: "success" as const };
      if (!isFreeMatch && corePaidCount === maxCore - 1) return { label: `Cover last slot · ₵${sharePerPlayer}`, icon: Wallet, disabled: paying, onClick: handleJoinPaid, tone: "primary" as const };
      return { label: `${corePaidCount}/${maxCore} paid · waiting`, icon: Hourglass, disabled: true, onClick: () => {}, tone: "neutral" as const };
    }
    if (!userParticipant) {
      const isPaid = (match.entry_fee ?? 0) > 0;
      if (match.status === "full") {
        return {
          label: "Join as substitute",
          icon: UserCheck,
          disabled: paying,
          tone: "primary" as const,
          onClick: handleJoinSubstitute,
        };
      }
      return {
        label: isPaid ? `Join · ₵${sharePerPlayer}` : "Join match · FREE",
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
  }, [isOrganizer, allPaid, corePaidCount, maxCore, sharePerPlayer, match, userParticipant, paying, handleJoinFree, handleJoinPaid, handleJoinSubstitute]);

  // Countdown display
  const isMatchOver = match?.status === 'completed';
  const isMatchLive = match?.status === 'live';
  const isWaitingKickoff = kickoffPassed && match?.status === 'full';
  const countdownMain = isMatchOver
    ? "Match Over"
    : isMatchLive
    ? "Live now"
    : isWaitingKickoff
    ? "Starting…"
    : totalSec < 3600
    ? `${m}m ${String(s).padStart(2, "0")}s`
    : `${h}h ${String(m).padStart(2, "0")}m`;
  const countdownSub = isMatchOver
    ? "This match has ended"
    : isMatchLive
    ? "Match in progress"
    : isWaitingKickoff
    ? "Lobby full — waiting for kickoff"
    : `${String(s).padStart(2, "0")}s`;

  const turfOwners = useMemo(() => new Set(activeParticipants.filter((p: any) => p.slot_type === "turf_owner").map((p: any) => p.user_id)), [activeParticipants]);

  return (
    <main className="min-h-screen bg-background pb-28">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b-2 border-border">
        <div className="max-w-[680px] mx-auto px-5 h-16 flex items-center gap-3">
          <Link to="/" className="w-10 h-10 -ml-2 rounded-full border-2 border-transparent hover:border-border flex items-center justify-center transition-colors"><ArrowLeft className="w-5 h-5" /></Link>
          <div className="flex-1 min-w-0">
            <h1 className="font-display font-black text-xl tracking-tight uppercase truncate">{venue?.name ?? "Venue"}</h1>
            <p className="text-[10px] text-muted-foreground font-black tracking-widest uppercase truncate">{matchCode} · {match?.format ?? "?"} · {match ? getFormattedTime(match.match_date).split(' ')[0] : ""}</p>
          </div>
          {user && (
            <button onClick={() => navigate("/wallet")} className="inline-flex items-center gap-1.5 border-2 border-foreground bg-foreground text-background rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-opacity shadow-sm">
              <Wallet className="w-3.5 h-3.5" /><span>₵{Number(balance || 0).toFixed(0)}</span>
            </button>
          )}
          <button onClick={() => setShareOpen(true)} className="w-10 h-10 rounded-full border-2 border-border flex items-center justify-center hover:bg-secondary transition-colors" aria-label="Share match"><Share2 className="w-4 h-4 text-foreground" /></button>
        </div>
        {/* Tab strip */}
        <div className="max-w-[680px] mx-auto px-5 pb-3">
            <div className={`grid gap-2 ${userParticipant && userParticipant.status !== "left" ? (showLineupTab ? "grid-cols-4" : "grid-cols-3") : "grid-cols-2"}`}>
            {([
              { id: "match" as const, label: "MATCH" },
              { id: "teams" as const, label: `TEAMS · ${corePaidCount}/${maxCore}` },
              ...(showLineupTab ? [{ id: "lineup" as const, label: "LINEUP" }] : []),
              ...(userParticipant && userParticipant.status !== "left" ? [{ id: "chat" as const, label: "CHAT" }] : []),
            ] as const).map(t => (
              <button key={t.id} onClick={() => setTab(t.id as any)} className={`inline-flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl border-2 px-2 sm:px-4 py-2.5 text-[9px] sm:text-[10px] font-black tracking-widest transition-colors ${tab === t.id ? "bg-foreground text-background border-foreground shadow-sm" : "bg-card text-foreground border-border hover:bg-secondary"}`}>
                {t.label}
                {t.id === "lineup" && !lineupEditingEnabled && (
                  <Lock className="w-3 h-3" />
                )}
                {t.id === "teams" && joinRequests.length > 0 && isOrganizer && (
                  <span className="text-[9px] bg-background text-foreground border border-foreground rounded-sm px-1.5 ml-0.5">{joinRequests.length}</span>
                )}
                {t.id === "chat" && chatUnread > 0 && (
                  <span className="text-[9px] bg-foreground text-background border border-background rounded-sm px-1.5 ml-0.5">{chatUnread}</span>
                )}
              </button>
            ))}
          </div>
          {userParticipant && tab !== "chat" && chatUnread > 0 && chatPreview && (
            <button onClick={() => setTab("chat")} className="mt-3 w-full text-left flex items-center gap-3 rounded-xl border-2 border-border bg-card px-4 py-3 text-[11px] font-bold text-foreground hover:border-foreground transition-colors shadow-sm">
              <MessageCircle className="w-4 h-4 shrink-0 text-muted-foreground" />
              <span className="truncate flex-1">{chatPreview}</span>
              <span className="text-[9px] font-black bg-foreground text-background rounded-sm px-1.5 shrink-0 uppercase tracking-widest">{chatUnread} NEW</span>
            </button>
          )}
        </div>
      </header>

      {/* Match over overlay */}
      {match && (match.status === "completed" || match.status === "cancelled") && (
        <div className="max-w-[680px] mx-auto px-5 pt-8 pb-4 text-center">
          <div className="rounded-xl border border-border bg-card p-8 space-y-3">
            <div className="flex justify-center mb-2">{match.status === "completed" ? <Flag className="w-10 h-10" /> : <Ban className="w-10 h-10 text-destructive" />}</div>
            <h2 className="font-display font-bold text-xl">{match.status === "completed" ? "Match Finished" : "Match Cancelled"}</h2>
            <p className="text-sm text-muted-foreground">{match.status === "completed" ? "Thanks for playing! Reviews are open below." : "This match has been cancelled. Any fees paid will be refunded."}</p>
            <Link to="/" className="inline-block mt-2 bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold">Back to Home</Link>
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
            // FIX: Issue 2 - scanning, videoRef, startScan, stopScan removed;
            // QRScannerModal now owns all scanner state internally.
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
            matchDate={match?.match_date}
            maxCoreCount={match?.max_core_players ?? 10}
            coreCheckedInCount={coreList.filter(p => p.status === "checked_in").length}
            allPaid={match ? (corePaidCount >= (match.max_core_players ?? 10)) : false}
            matchCode={matchCode}
            matchTitle={match?.title ?? "Your Match"}
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

        {tab === "lineup" && match && (
          <div className="space-y-4">
            {/* Lineup Editing Control Banner */}
            {isOrganizer ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={toggleLineupEditing}
                  className={`h-11 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 ${
                    lineupEditingEnabled
                      ? "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30"
                      : "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30"
                  }`}
                >
                  {lineupEditingEnabled ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                  {lineupEditingEnabled ? "Open" : "Locked"}
                </button>
                <div className="h-11 rounded-xl border-2 border-border bg-card flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  {lineupEditingEnabled ? "Players can edit" : "Only you can edit"}
                </div>
              </div>
            ) : (
              <div className={`rounded-xl border-2 p-4 flex items-start gap-3 ${
                lineupEditingEnabled
                  ? "bg-green-500/10 border-green-500/30"
                  : "bg-orange-500/10 border-orange-500/30"
              }`}>
                {lineupEditingEnabled ? (
                  <Unlock className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <Lock className="w-5 h-5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <p className={`text-sm font-bold ${lineupEditingEnabled ? "text-green-600 dark:text-green-400" : "text-orange-600 dark:text-orange-400"} uppercase tracking-widest mb-1`}>
                    {lineupEditingEnabled ? "Lineup is Open" : "Lineup is Locked"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {lineupEditingEnabled
                      ? "You can edit your team's lineup positions"
                      : "Only the organizer can edit the lineup"}
                  </p>
                </div>
              </div>
            )}

            {/* Team Selection */}
            {isOrganizer && (
              <div className="grid grid-cols-2 gap-2">
                {([
                  { id: "reds" as const, label: match.team_color_a ?? "Team A" },
                  { id: "blues" as const, label: match.team_color_b ?? "Team B" },
                ]).map((team) => (
                  <button
                    key={team.id}
                    onClick={() => setLineupTeam(team.id)}
                    className={`h-11 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest ${
                      lineupTeam === team.id
                        ? "bg-foreground text-background border-foreground"
                        : "bg-card text-foreground border-border"
                    }`}
                  >
                    {team.label}
                  </button>
                ))}
              </div>
            )}
            {(() => {
              const selectedTeam = isOrganizer ? lineupTeam : normalizeTeamSide(userParticipant?.team);
              return (
                <MatchLineup
                  matchId={match.id}
                  teamSide={selectedTeam === "reds" ? "team_a" : "team_b"}
                  teamName={selectedTeam === "reds" ? (match.team_color_a ?? "Team A") : (match.team_color_b ?? "Team B")}
                  maxPlayers={Math.ceil((match.max_core_players ?? 10) / 2)}
                  canEdit={canEditCurrentTeam}
                  matchDate={match.match_date}
                  matchStatus={match.status}
                  players={coreList
                    .filter((p) => normalizeTeamSide(p.team) === selectedTeam)
                    .map((p) => ({
                      user_id: p.user_id,
                      full_name: p.full_name,
                      avatar_url: p.avatar_url,
                    }))}
                />
              );
            })()}
          </div>
        )}

        {tab === "chat" && match && userParticipant && match.status !== 'completed' && match.status !== 'cancelled' && (
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
        <div className="fixed bottom-0 inset-x-0 z-30 bg-background/95 backdrop-blur-md border-t-2 border-border">
          <div className="max-w-[680px] mx-auto px-5 py-4">
            <button
              onClick={cta.onClick}
              disabled={cta.disabled}
              className={`w-full inline-flex items-center justify-center gap-2 h-14 rounded-full text-[11px] font-black uppercase tracking-widest disabled:opacity-50 active:scale-[0.98] transition-all border-2 ${
                cta.tone === "primary"
                  ? "bg-foreground border-foreground text-background shadow-md"
                  : cta.tone === "success"
                  ? "bg-foreground border-foreground text-background shadow-sm"
                  : "bg-secondary border-border text-muted-foreground"
              }`}
            >
              <cta.icon className="w-4 h-4" />
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
            status: match.status,
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
