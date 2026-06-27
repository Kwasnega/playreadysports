import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type SuggestedProfile = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  city: string | null;
  reason: string;
};

export function useSuggestedFriends() {
  const { user } = useAuth();
  const [suggested, setSuggested] = useState<SuggestedProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }

    const load = async () => {
      setLoading(true);

      // 1. Get current user's city and friend IDs
      const { data: me } = await supabase
        .from("profiles")
        .select("city")
        .eq("id", user.id)
        .single();

      const { data: friendships } = await (supabase as any)
        .from("friendships")
        .select("requester_id, recipient_id, status")
        .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`);

      const friendIds = new Set<string>();
      const pendingIds = new Set<string>();
      (friendships ?? []).forEach((f: any) => {
        const fid = f.requester_id === user.id ? f.recipient_id : f.requester_id;
        if (f.status === "accepted") friendIds.add(fid);
        if (f.status === "pending") pendingIds.add(fid);
      });
      friendIds.add(user.id);

      // 2. Get match co-players (people who played in same matches)
      const { data: myMatches } = await supabase
        .from("match_participants")
        .select("match_id")
        .eq("user_id", user.id)
        .eq("status", "active");

      const myMatchIds = (myMatches ?? []).map((m: any) => m.match_id);
      const coPlayerIds = new Set<string>();
      if (myMatchIds.length > 0) {
        const { data: coPlayers } = await supabase
          .from("match_participants")
          .select("user_id")
          .in("match_id", myMatchIds)
          .eq("status", "active")
          .neq("user_id", user.id)
          .limit(100);
        (coPlayers ?? []).forEach((p: any) => coPlayerIds.add(p.user_id));
      }

      // 3. Build suggestions
      const scored = new Map<string, { profile: any; score: number; reason: string }>();

      // Same city players
      if (me?.city) {
        const { data: cityPlayers } = await (supabase as any)
          .from("public_profiles")
          .select("id, username, full_name, avatar_url, city")
          .eq("city", me.city)
          .neq("id", user.id)
          .limit(20);

        (cityPlayers ?? []).forEach((p: any) => {
          if (friendIds.has(p.id) || pendingIds.has(p.id)) return;
          scored.set(p.id, { profile: p, score: 1, reason: `Plays in ${me.city}` });
        });
      }

      // Co-players get higher score
      coPlayerIds.forEach((id) => {
        if (friendIds.has(id) || pendingIds.has(id)) return;
        const existing = scored.get(id);
        if (existing) {
          existing.score += 3;
          existing.reason = "Played together before";
        } else {
          // Fetch profile for co-player not in city list
        }
      });

      // Mutual friends
      if (friendIds.size > 1) {
        const friendArray = Array.from(friendIds).filter((id) => id !== user.id);
        const { data: theirFriends } = await supabase
          .from("friendships")
          .select("requester_id, recipient_id")
          .in("requester_id", friendArray)
          .in("recipient_id", friendArray)
          .eq("status", "accepted")
          .limit(200);

        const mutualCounts = new Map<string, number>();
        (theirFriends ?? []).forEach((f: any) => {
          const fid = f.requester_id === user.id ? f.recipient_id : f.requester_id;
          if (friendIds.has(fid) || fid === user.id) return;
          mutualCounts.set(fid, (mutualCounts.get(fid) || 0) + 1);
        });

        for (const [fid, count] of mutualCounts) {
          if (count < 2) continue; // At least 2 mutual friends
          const existing = scored.get(fid);
          if (existing) {
            existing.score += count;
            existing.reason = `${count} mutual friends`;
          }
        }
      }

      const result = Array.from(scored.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map((s) => ({
          id: s.profile.id,
          username: s.profile.username,
          full_name: s.profile.full_name,
          avatar_url: s.profile.avatar_url,
          city: s.profile.city,
          reason: s.reason,
        }));

      setSuggested(result);
      setLoading(false);
    };

    load();
  }, [user]);

  return { suggested, loading };
}
