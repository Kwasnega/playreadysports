import { useState, useEffect } from "react";
import { Trophy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Participant {
  user_id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

interface Props {
  matchId: string;
  participants: Participant[];
}

export function MotmVote({ matchId, participants }: Props) {
  const { user } = useAuth();
  const [voted, setVoted] = useState(false);
  const [votedFor, setVotedFor] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<{ rated_user_id: string; vote_count: number }[]>([]);

  useEffect(() => {
    if (!user || !matchId) return;
    (async () => {
      const { data } = await supabase
        .from("match_ratings")
        .select("rated_user_id")
        .eq("match_id", matchId)
        .eq("voter_id", user.id)
        .maybeSingle();
      if (data) {
        setVoted(true);
        setVotedFor(data.rated_user_id);
        loadResults();
      }
    })();
  }, [matchId, user]);

  const loadResults = async () => {
    const { data } = await (supabase as any).rpc("get_motm_votes", { p_match_id: matchId });
    if (data) setResults(data);
  };

  const vote = async (ratedUserId: string) => {
    if (!user || voted || submitting) return;
    if (ratedUserId === user.id) {
      toast.error("You cannot vote for yourself");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("match_ratings").insert({
      match_id: matchId,
      voter_id: user.id,
      rated_user_id: ratedUserId,
      category: "motm",
    } as any);
    if (error) {
      if (error.code === "23505") {
        toast("You already voted for this match");
        setVoted(true);
      } else {
        toast.error(error.message);
      }
    } else {
      setVoted(true);
      setVotedFor(ratedUserId);
      toast.success("Vote submitted!");
      loadResults();
    }
    setSubmitting(false);
  };

  const eligible = participants.filter((p) => p.user_id !== user?.id);
  if (!user || eligible.length === 0) return null;

  return (
    <div className="bg-card rounded-3xl border border-border/60 overflow-hidden">
      <div className="px-5 py-4 border-b border-border/60 flex items-center gap-2">
        <Trophy className="w-4 h-4 text-amber-500" />
        <h3 className="font-display font-bold text-sm">Man of the Match</h3>
        {voted && <span className="text-[10px] text-emerald-600 font-semibold ml-auto">Voted</span>}
      </div>
      <ul className="divide-y divide-border/60">
        {eligible.map((p) => {
          const isVoted = votedFor === p.user_id;
          const resultRow = results.find((r) => r.rated_user_id === p.user_id);
          return (
            <li key={p.user_id} className="flex items-center gap-3 px-5 py-3">
              {p.avatar_url ? (
                <img src={p.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-xs font-bold shrink-0">
                  {(p.full_name || p.username || "?").slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{p.full_name || p.username || "Player"}</p>
                {resultRow && (
                  <p className="text-[10px] text-muted-foreground">{resultRow.vote_count} vote{resultRow.vote_count !== 1 ? "s" : ""}</p>
                )}
              </div>
              {voted ? (
                isVoted && <Check className="w-4 h-4 text-emerald-500 shrink-0" />
              ) : (
                <button
                  onClick={() => vote(p.user_id)}
                  disabled={submitting}
                  className="text-xs font-semibold bg-secondary hover:bg-foreground hover:text-background rounded-full px-3 py-1.5 transition-colors disabled:opacity-50"
                >
                  Vote
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
