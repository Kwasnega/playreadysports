import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

export function useJoinRequests(matchId: string | undefined) {
  const acceptRequest = useCallback(
    async (participantId: string, currentParticipants: { team: string; status: string }[]) => {
      if (!matchId) return false;

      // Auto-assign team: reds if reds < blues, else blues
      const reds = currentParticipants.filter((p) => p.team === "reds" && p.status === "active").length;
      const blues = currentParticipants.filter((p) => p.team === "blues" && p.status === "active").length;
      const assignedTeam = reds <= blues ? "reds" : "blues";

      const { data: participant, error } = await supabase
        .from("match_participants")
        .update({
          status: "active" as any,
          team: assignedTeam as any,
        })
        .eq("id", participantId)
        .eq("match_id", matchId)
        .select("user_id")
        .single();

      if (error) {
        console.error("acceptRequest error:", error);
        toast.error("Failed to accept request");
        return false;
      }

      // Notify accepted player
      const { data: match } = await supabase
        .from("matches")
        .select("join_code, match_date, venue:venues(name)")
        .eq("id", matchId)
        .single();

      const venueName = Array.isArray(match?.venue) ? match.venue[0]?.name ?? "the venue" : match?.venue?.name ?? "the venue";
      const time = match?.match_date ? format(new Date(match.match_date), "h:mm a") : "";

      if (participant?.user_id) {
        await supabase.from("notifications").insert({
          user_id: participant.user_id,
          title: "You're in!",
          body: `${venueName} tonight at ${time}`,
          type: "match_join" as any,
          data: { match_id: matchId, join_code: match?.join_code },
        });
      }

      toast.success(`Accepted · assigned to ${assignedTeam}`);
      return true;
    },
    [matchId]
  );

  const rejectRequest = useCallback(
    async (participantId: string, name: string) => {
      if (!matchId) return false;
      if (!confirm(`Remove ${name} from this match?`)) return false;

      const { data: participant, error } = await supabase
        .from("match_participants")
        .update({ status: "removed" as any })
        .eq("id", participantId)
        .eq("match_id", matchId)
        .select("user_id")
        .single();

      if (error) {
        console.error("rejectRequest error:", error);
        toast.error("Failed to remove player");
        return false;
      }

      // Notify rejected player
      const { data: match } = await supabase
        .from("matches")
        .select("join_code")
        .eq("id", matchId)
        .single();

      if (participant?.user_id) {
        await supabase.from("notifications").insert({
          user_id: participant.user_id,
          title: "Request declined",
          body: `Your request to join ${match?.join_code ?? "the match"} was declined.`,
          type: "match_update" as any,
          data: { match_id: matchId, join_code: match?.join_code },
        });
      }

      toast(`${name} removed`);
      return true;
    },
    [matchId]
  );

  return { acceptRequest, rejectRequest };
}
