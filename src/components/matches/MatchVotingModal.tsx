import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Crown, Medal, Star, Clock, CheckCircle, Lock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type PublicProfile = {
  id: string;
  user_id: string;
  full_name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
};

type Props = {
  matchId: string;
  participants: PublicProfile[];
  votingClosesAt: Date;
  open?: boolean;
  onClose?: () => void;
};

type VoteState = {
  nomineeId: string | null;
  rating: number;
};

/* ------------------------------------------------------------------ */
/*  StarRating helper                                                  */
/* ------------------------------------------------------------------ */

function StarRating({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= (hover || value);
        return (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            className={cn(
              "p-0.5 transition-colors",
              disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:scale-110"
            )}
          >
            <Star
              className={cn(
                "w-5 h-5",
                filled ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  NomineeRow helper                                                  */
/* ------------------------------------------------------------------ */

function NomineeRow({
  p,
  selected,
  disabled,
  onSelect,
}: {
  p: PublicProfile;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all",
        selected
          ? "border-primary bg-primary/5"
          : "border-border/60 bg-card hover:bg-secondary/50",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      {p.avatar_url ? (
        <img src={p.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
      ) : (
        <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-[11px] font-bold shrink-0">
          {(p.full_name || p.username || "?").slice(0, 2).toUpperCase()}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{p.full_name || p.username || "Player"}</p>
      </div>
      {selected && <CheckCircle className="w-4 h-4 text-primary shrink-0" />}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  MatchVotingModal                                                   */
/* ------------------------------------------------------------------ */

export function MatchVotingModal({
  matchId,
  participants,
  votingClosesAt,
  open: controlledOpen,
  onClose,
}: Props) {
  const { user } = useAuth();
  const [internalOpen, setInternalOpen] = useState(true);
  const isOpen = controlledOpen ?? internalOpen;

  /* ---- countdown ---- */
  const [timeLeftMs, setTimeLeftMs] = useState(0);
  useEffect(() => {
    const calc = () => {
      const diff = new Date(votingClosesAt).getTime() - Date.now();
      setTimeLeftMs(Math.max(0, diff));
    };
    calc();
    const id = setInterval(calc, 30000);
    return () => clearInterval(id);
  }, [votingClosesAt]);

  const isExpired = timeLeftMs <= 0;
  const fmtTimeLeft = useMemo(() => {
    if (timeLeftMs <= 0) return "Voting closed";
    const h = Math.floor(timeLeftMs / (1000 * 60 * 60));
    const m = Math.ceil((timeLeftMs % (1000 * 60 * 60)) / (1000 * 60));
    if (h > 0) return `${h}h ${m}m remaining`;
    return `${m}m remaining`;
  }, [timeLeftMs]);

  /* ---- already voted? ---- */
  const [checkingVoted, setCheckingVoted] = useState(true);
  const [alreadyVoted, setAlreadyVoted] = useState(false);
  useEffect(() => {
    if (!user?.id || !matchId) {
      setCheckingVoted(false);
      return;
    }
    const check = async () => {
      const { data } = await supabase
        .from("match_votes")
        .select("id")
        .eq("match_id", matchId)
        .eq("voter_id", user.id)
        .maybeSingle();
      if (data) setAlreadyVoted(true);
      setCheckingVoted(false);
    };
    check();
  }, [matchId, user?.id]);

  /* ---- vote state ---- */
  const [king, setKing] = useState<VoteState>({ nomineeId: null, rating: 0 });
  const [second, setSecond] = useState<VoteState>({ nomineeId: null, rating: 0 });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  /* ---- nominees (exclude self) ---- */
  const nominees = useMemo(
    () => participants.filter((p) => p.user_id !== user?.id),
    [participants, user?.id]
  );

  /* ---- selection helpers ---- */
  const pickKing = (id: string) => {
    if (second.nomineeId === id) setSecond({ nomineeId: null, rating: 0 });
    setKing((prev) => ({ ...prev, nomineeId: id, rating: prev.nomineeId === id ? prev.rating : 0 }));
  };

  const pickSecond = (id: string) => {
    if (king.nomineeId === id) setKing({ nomineeId: null, rating: 0 });
    setSecond((prev) => ({ ...prev, nomineeId: id, rating: prev.nomineeId === id ? prev.rating : 0 }));
  };

  const canSubmit = king.nomineeId && king.rating > 0 && second.nomineeId && second.rating > 0;

  /* ---- submit ---- */
  const handleSubmit = async () => {
    if (!canSubmit || !matchId) return;
    setSubmitting(true);

    try {
      const { error: err1 } = await supabase.functions.invoke("submit-match-vote", {
        body: {
          matchId,
          nomineeId: king.nomineeId,
          rating: king.rating,
          category: "king_of_match",
        },
      });
      if (err1) throw new Error(`King vote failed: ${err1.message}`);

      const { error: err2 } = await supabase.functions.invoke("submit-match-vote", {
        body: {
          matchId,
          nomineeId: second.nomineeId,
          rating: second.rating,
          category: "second_king_of_match",
        },
      });
      if (err2) throw new Error(`2nd King vote failed: ${err2.message}`);

      setSubmitted(true);
      toast.success("Votes submitted!");
    } catch (e: any) {
      toast.error(e.message || "Failed to submit votes");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setInternalOpen(false);
    onClose?.();
  };

  /* ---- derived UI helpers ---- */
  const SectionCard = ({
    icon: Icon,
    label,
    accent,
    vote,
    onPick,
    onRate,
    excludeId,
  }: {
    icon: typeof Crown;
    label: string;
    accent: string;
    vote: VoteState;
    onPick: (id: string) => void;
    onRate: (n: number) => void;
    excludeId: string | null;
  }) => (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center", accent)}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <div>
          <h3 className="font-display font-bold text-sm tracking-tight">{label}</h3>
          {vote.nomineeId && (
            <p className="text-[11px] text-muted-foreground">
              {participants.find((p) => p.user_id === vote.nomineeId)?.full_name || "Selected"}
            </p>
          )}
        </div>
      </div>

      {/* Nominee list */}
      <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
        {nominees.map((p) => {
          const isSelected = vote.nomineeId === p.user_id;
          const isExcluded = excludeId === p.user_id;
          return (
            <NomineeRow
              key={p.user_id}
              p={p}
              selected={isSelected}
              disabled={isExcluded}
              onSelect={() => onPick(p.user_id)}
            />
          );
        })}
      </div>

      {/* Rating (shown after selection) */}
      {vote.nomineeId && (
        <div className="flex items-center justify-between bg-secondary/40 rounded-xl px-3 py-2.5">
          <span className="text-xs font-medium text-muted-foreground">Rate</span>
          <StarRating value={vote.rating} onChange={onRate} disabled={submitting || submitted} />
        </div>
      )}
    </div>
  );

  /* ---- loading check ---- */
  if (checkingVoted) {
    return (
      <Dialog open={isOpen} onOpenChange={(o) => !o && handleClose()}>
        <DialogContent className="max-w-md rounded-3xl p-6">
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  /* ---- closed state ---- */
  if (isExpired) {
    return (
      <Dialog open={isOpen} onOpenChange={(o) => !o && handleClose()}>
        <DialogContent className="max-w-md rounded-3xl p-0 overflow-hidden">
          <div className="p-8 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6 text-muted-foreground" />
            </div>
            <div>
              <h2 className="font-display font-bold text-lg tracking-tight">Voting closed</h2>
              <p className="text-sm text-muted-foreground mt-1">The voting window for this match has ended.</p>
            </div>
            <button
              onClick={handleClose}
              className="w-full h-11 rounded-full bg-foreground text-background text-sm font-bold"
            >
              Close
            </button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  /* ---- already voted state ---- */
  if (alreadyVoted) {
    return (
      <Dialog open={isOpen} onOpenChange={(o) => !o && handleClose()}>
        <DialogContent className="max-w-md rounded-3xl p-0 overflow-hidden">
          <div className="p-8 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
              <CheckCircle className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
              <h2 className="font-display font-bold text-lg tracking-tight">Already voted</h2>
              <p className="text-sm text-muted-foreground mt-1">
                You have already submitted your votes for this match.
              </p>
            </div>
            <button
              onClick={handleClose}
              className="w-full h-11 rounded-full bg-foreground text-background text-sm font-bold"
            >
              Close
            </button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  /* ---- submitted / confirmation state ---- */
  if (submitted) {
    return (
      <Dialog open={isOpen} onOpenChange={(o) => !o && handleClose()}>
        <DialogContent className="max-w-md rounded-3xl p-0 overflow-hidden">
          <div className="p-8 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
              <CheckCircle className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
              <h2 className="font-display font-bold text-lg tracking-tight">Votes submitted</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Thanks for voting! Results are secret and will be revealed after the window closes.
              </p>
            </div>
            <button
              onClick={handleClose}
              className="w-full h-11 rounded-full bg-foreground text-background text-sm font-bold"
            >
              Close
            </button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  /* ---- voting form ---- */
  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg rounded-3xl p-0 overflow-hidden max-h-[90vh] overflow-y-auto">
        <DialogHeader className="px-6 pt-6 pb-2">
          <div className="flex items-center justify-between">
            <DialogTitle className="font-display font-bold text-xl tracking-tight">
              Match Voting
            </DialogTitle>
            <div className="flex items-center gap-1.5 text-xs font-medium text-amber-500 bg-amber-500/10 rounded-full px-2.5 py-1">
              <Clock className="w-3.5 h-3.5" />
              {fmtTimeLeft}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Cast your votes before the window closes. Votes are secret.
          </p>
        </DialogHeader>

        <div className="px-6 pb-6 space-y-6">
          {/* King of the Match */}
          <SectionCard
            icon={Crown}
            label="King of the Match"
            accent="bg-amber-500"
            vote={king}
            onPick={pickKing}
            onRate={(n) => setKing((prev) => ({ ...prev, rating: n }))}
            excludeId={second.nomineeId}
          />

          {/* Divider */}
          <div className="h-px bg-border/60" />

          {/* 2nd King of the Match */}
          <SectionCard
            icon={Medal}
            label="2nd King of the Match"
            accent="bg-primary"
            vote={second}
            onPick={pickSecond}
            onRate={(n) => setSecond((prev) => ({ ...prev, rating: n }))}
            excludeId={king.nomineeId}
          />

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className={cn(
              "w-full h-12 rounded-full text-sm font-bold inline-flex items-center justify-center gap-2 transition-all",
              canSubmit
                ? "bg-foreground text-background hover:opacity-90 active:scale-[0.99]"
                : "bg-secondary text-muted-foreground cursor-not-allowed"
            )}
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ? "Submitting…" : "Submit Votes"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
