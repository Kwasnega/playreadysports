import { useState } from "react";
import { Trophy, Minus, Loader2, AlertTriangle, CheckCircle2, X } from "lucide-react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { broadcastNotification } from "@/lib/notificationHelpers";

interface Props {
  matchId: string;
  teamAName?: string;
  teamBName?: string;
  isGala?: boolean;
  isParticipant?: boolean;         // true → show dispute button after result
  matchStatus?: string;            // 'completed' → show dispute option
  resultSubmittedAt?: string | null; // ISO string — used to check 72-hr window
  onSubmitted?: () => void;
  matchDate?: string;              // ISO string for match time
  coreCheckedInCount?: number;     // How many players checked in
  maxCoreCount?: number;           // Total core player slots
  allPaid?: boolean;               // Whether all payment is done
  matchCode?: string;              // For notifications
  matchTitle?: string;             // For notifications
}

const DISPUTE_WINDOW_HOURS = 72;

export function SubmitMatchResult({
  matchId,
  teamAName = "Team A",
  teamBName = "Team B",
  isGala = false,
  isParticipant = false,
  matchStatus,
  resultSubmittedAt,
  onSubmitted,
  matchDate,
  coreCheckedInCount = 0,
  maxCoreCount = 10,
  allPaid = false,
  matchCode = "",
  matchTitle = "Match",
}: Props) {
  const confirm = useConfirm();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Dispute state
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [raisingDispute, setRaisingDispute] = useState(false);
  const [disputeRaised, setDisputeRaised] = useState(false);

  // ── Validation checks ──
  const hasTimePassedKickoff = matchDate ? new Date() > new Date(matchDate) : false;
  const minCheckInRequired = Math.ceil(maxCoreCount * 0.5); // 50% requirement
  const hasMinCheckIn = coreCheckedInCount >= minCheckInRequired;
  const canSubmitResult = hasTimePassedKickoff && hasMinCheckIn && allPaid;

  const getValidationMessage = () => {
    const reasons: string[] = [];
    if (!hasTimePassedKickoff) reasons.push("Match time has not passed yet");
    if (!hasMinCheckIn) reasons.push(`Need ≥${minCheckInRequired} players checked in (currently ${coreCheckedInCount})`);
    if (!allPaid) reasons.push("Not all payment has been processed");
    return reasons;
  };

  const handleSubmit = async (winningTeam: "reds" | "blues" | null) => {
    const ok = await confirm({
      title: "Submit Match Result",
      description: "Are you sure? This cannot be undone.",
    });
    if (!ok) return;

    setSubmitting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) {
        toast.error("You must be signed in.");
        setSubmitting(false);
        return;
      }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/complete-match`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            matchId,
            winningTeam,
          }),
        }
      );

      const result = await res.json().catch(() => ({ error: "Network error" }));

      console.log('Submit match result response:', result);
      console.log('Response status:', res.status);

      if (!res.ok || result?.error) {
        console.error('Submit result error:', result);
        toast.error(result?.error ?? "Failed to submit result.");
        setSubmitting(false);
        return;
      }

      toast.success("Match result submitted successfully!");
      setSubmitted(true);

      // Send status change notifications to all participants
      try {
        const { data: participants } = await supabase
          .from("match_participants")
          .select("user_id")
          .eq("match_id", matchId)
          .eq("status", "active");

        const userIds = participants?.map((p: any) => p.user_id) ?? [];
        if (userIds.length > 0) {
          await broadcastNotification(
            userIds,
            "Match Completed",
            `${matchTitle} (${matchCode}) has been completed. ${
              winningTeam ? `${winningTeam.charAt(0).toUpperCase() + winningTeam.slice(1)} team won!` : "It was a draw!"
            }`,
            "match_completed",
            { link: `/lobby/${matchCode}` }
          );
        }
      } catch (notifErr) {
        console.error("Error sending notifications:", notifErr);
        // Don't fail the whole operation if notifications error out
      }

      onSubmitted?.();
    } catch (err: any) {
      toast.error(err?.message ?? "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRaiseDispute = async () => {
    if (!disputeReason.trim()) {
      toast.error("Please describe the reason for your dispute.");
      return;
    }

    setRaisingDispute(true);
    try {
      const { data, error } = await (supabase as any).rpc("raise_match_dispute", {
        p_match_id: matchId,
        p_reason: disputeReason.trim(),
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("Dispute raised. An admin will review it shortly.");
      setDisputeRaised(true);
      setShowDisputeForm(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to raise dispute.");
    } finally {
      setRaisingDispute(false);
    }
  };

  // Check if dispute window is still open
  const disputeWindowOpen = (() => {
    if (!resultSubmittedAt) return false;
    const submittedMs = new Date(resultSubmittedAt).getTime();
    const windowMs = DISPUTE_WINDOW_HOURS * 60 * 60 * 1000;
    return Date.now() < submittedMs + windowMs;
  })();

  const hoursRemaining = (() => {
    if (!resultSubmittedAt) return 0;
    const submittedMs = new Date(resultSubmittedAt).getTime();
    const windowMs = DISPUTE_WINDOW_HOURS * 60 * 60 * 1000;
    return Math.max(0, Math.ceil((submittedMs + windowMs - Date.now()) / (1000 * 60 * 60)));
  })();

  // ── Show dispute UI if match is already completed ──
  if (matchStatus === "completed" && isParticipant) {
    if (disputeRaised) {
      return (
        <div className="rounded-xl border border-border bg-card p-6 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6 text-amber-400" />
          </div>
          <h3 className="font-display font-bold text-lg">Dispute Raised</h3>
          <p className="text-sm text-muted-foreground">
            An admin will review your dispute and contact you.
          </p>
        </div>
      );
    }

    if (!disputeWindowOpen) {
      return (
        <div className="rounded-xl border border-border bg-card p-5 text-center space-y-2">
          <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
          <p className="text-sm text-muted-foreground">Match result finalised. Dispute window closed.</p>
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <h3 className="font-display font-bold text-sm">Challenge Result</h3>
          <span className="ml-auto text-xs text-slate-500">{hoursRemaining}h remaining</span>
        </div>

        <p className="text-xs text-muted-foreground">
          If you believe the submitted result is incorrect, you have{" "}
          <span className="text-amber-400 font-semibold">{DISPUTE_WINDOW_HOURS} hours</span>{" "}
          from when the result was submitted to raise a dispute.
        </p>

        {showDisputeForm ? (
          <div className="space-y-3">
            <textarea
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              placeholder="Describe what was wrong with the result (e.g. wrong winning team selected, scores were incorrect)…"
              rows={3}
              className="w-full bg-white/[0.04] text-white placeholder-slate-600 rounded-xl px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-amber-500/40 resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={handleRaiseDispute}
                disabled={raisingDispute || !disputeReason.trim()}
                className="flex-1 h-10 rounded-xl bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                {raisingDispute && <Loader2 className="w-4 h-4 animate-spin" />}
                Submit Dispute
              </button>
              <button
                onClick={() => { setShowDisputeForm(false); setDisputeReason(""); }}
                className="h-10 px-4 rounded-xl bg-secondary text-muted-foreground hover:bg-secondary/80 font-semibold text-sm flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowDisputeForm(true)}
            className="w-full h-11 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-400 hover:bg-amber-500/10 font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
          >
            <AlertTriangle className="w-4 h-4" />
            Raise a Dispute
          </button>
        )}
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
          <Trophy className="w-6 h-6 text-emerald-500" />
        </div>
        <h3 className="font-display font-bold text-lg">Result Submitted</h3>
        <p className="text-sm text-muted-foreground">
          The match has been marked as complete. Participants have a{" "}
          {DISPUTE_WINDOW_HOURS}-hour window to raise a dispute.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Trophy className="w-4 h-4 text-primary" />
        <h3 className="font-display font-bold text-sm">Submit Match Result</h3>
      </div>

      {/* Validation Error Box (if criteria not met) */}
      {!canSubmitResult && (
        <div className="rounded-xl bg-red-500/10 border-2 border-red-500/30 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="font-bold text-red-600 dark:text-red-400 text-sm uppercase tracking-widest">Cannot Submit Result</p>
          </div>
          <div className="text-sm text-red-600/90 dark:text-red-400/90 space-y-1">
            {getValidationMessage().map((msg, idx) => (
              <p key={idx} className="flex items-start gap-2">
                <span className="text-red-500 mt-1">•</span>
                <span>{msg}</span>
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <button
          onClick={() => handleSubmit("reds")}
          disabled={submitting || !canSubmitResult}
          className="h-12 rounded-xl bg-primary/8 border border-primary/15 text-primary font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {teamAName} Won
        </button>

        <button
          onClick={() => handleSubmit("blues")}
          disabled={submitting || !canSubmitResult}
          className="h-12 rounded-xl bg-primary/8 border border-primary/15 text-primary font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {teamBName} Won
        </button>
      </div>

      <button
        onClick={() => handleSubmit(null)}
        disabled={submitting || !canSubmitResult}
        className="w-full h-11 rounded-xl bg-secondary text-muted-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:bg-secondary/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
        <Minus className="w-4 h-4" />
        {isGala ? "No Winner" : "Draw"}
      </button>
    </div>
  );
}
