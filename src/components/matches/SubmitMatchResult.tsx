import { useState } from "react";
import { Trophy, Minus, Loader2 } from "lucide-react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  matchId: string;
  teamAName?: string;
  teamBName?: string;
  isGala?: boolean;
  onSubmitted?: () => void;
}

export function SubmitMatchResult({
  matchId,
  teamAName = "Team A",
  teamBName = "Team B",
  isGala = false,
  onSubmitted,
}: Props) {
  const confirm = useConfirm();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

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

      if (!res.ok || result?.error) {
        toast.error(result?.error ?? "Failed to submit result.");
        setSubmitting(false);
        return;
      }

      toast.success("Match result submitted successfully!");
      setSubmitted(true);
      onSubmitted?.();
    } catch (err: any) {
      toast.error(err?.message ?? "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="rounded-3xl border border-border/60 bg-card p-6 text-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
          <Trophy className="w-6 h-6 text-emerald-500" />
        </div>
        <h3 className="font-display font-bold text-lg">Result Submitted</h3>
        <p className="text-sm text-muted-foreground">
          The match has been marked as complete.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-border/60 bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Trophy className="w-4 h-4 text-primary" />
        <h3 className="font-display font-bold text-sm">Submit Match Result</h3>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <button
          onClick={() => handleSubmit("reds")}
          disabled={submitting}
          className="h-12 rounded-xl bg-primary/10 text-primary font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/20 transition-colors disabled:opacity-50"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {teamAName} Won
        </button>

        <button
          onClick={() => handleSubmit("blues")}
          disabled={submitting}
          className="h-12 rounded-xl bg-primary/10 text-primary font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/20 transition-colors disabled:opacity-50"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {teamBName} Won
        </button>
      </div>

      <button
        onClick={() => handleSubmit(null)}
        disabled={submitting}
        className="w-full h-11 rounded-xl bg-secondary text-muted-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:bg-secondary/80 transition-colors disabled:opacity-50"
      >
        {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
        <Minus className="w-4 h-4" />
        {isGala ? "No Winner" : "Draw"}
      </button>
    </div>
  );
}
