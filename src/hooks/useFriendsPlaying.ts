import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Venue } from "@/hooks/useVenues";

export type FriendMatch = {
  id: string;
  join_code: string;
  match_mode: string;
  format: string;
  match_date: string;
  entry_fee: number;
  core_paid_count: number;
  max_core_players: number;
  venue: Venue | null;
  friend_name: string;
  friend_avatar: string | null;
};

export function useFriendsPlaying() {
  const { user } = useAuth();
  const [matches, setMatches] = useState<FriendMatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }

    const load = async () => {
      setLoading(true);

      // 1. Get friend IDs
      // @ts-ignore — friendships table not in generated types yet
      const { data: friendships } = await supabase
        .from("friendships")
        .select("requester_id, recipient_id")
        .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .eq("status", "accepted");

      const friendIds = new Set<string>();
      (friendships ?? []).forEach((f: any) => {
        const fid = f.requester_id === user.id ? f.recipient_id : f.requester_id;
        friendIds.add(fid);
      });

      if (friendIds.size === 0) { setMatches([]); setLoading(false); return; }

      // 2. Get upcoming matches where friends are participating
      const ids = Array.from(friendIds);
      const now = new Date().toISOString();

      const { data: participants } = await supabase
        .from("match_participants")
        .select("user_id, match_id, user:profiles(full_name, avatar_url)")
        .in("user_id", ids)
        .eq("status", "active");

      const matchIds = [...new Set((participants ?? []).map((p: any) => p.match_id))];
      if (matchIds.length === 0) { setMatches([]); setLoading(false); return; }

      const { data: matchesData } = await supabase
        .from("matches")
        .select("*, venue:venues(*)")
        .in("id", matchIds)
        .eq("status", "upcoming")
        .eq("match_type", "public")
        .gt("match_date", now)
        .order("match_date", { ascending: true })
        .limit(10);

      // Build result with first friend who joined each match
      const result: FriendMatch[] = [];
      const seenMatchIds = new Set<string>();

      (matchesData ?? []).forEach((m: any) => {
        if (seenMatchIds.has(m.id)) return;
        seenMatchIds.add(m.id);

        // Find first friend in participants for this match
        const friendParticipant = (participants ?? []).find((p: any) => p.match_id === m.id);
        const venue = Array.isArray(m.venue) ? m.venue[0] ?? null : m.venue ?? null;
        const friend = friendParticipant?.user;

        result.push({
          id: m.id,
          join_code: m.join_code,
          match_mode: m.match_mode,
          format: m.format,
          match_date: m.match_date,
          entry_fee: m.entry_fee ?? 0,
          core_paid_count: m.core_paid_count ?? 0,
          max_core_players: m.max_core_players ?? m.players_per_side ?? 10,
          venue,
          friend_name: friend?.full_name || "A friend",
          friend_avatar: friend?.avatar_url || null,
        });
      });

      setMatches(result.slice(0, 5));
      setLoading(false);
    };

    load();
  }, [user]);

  return { matches, loading };
}
