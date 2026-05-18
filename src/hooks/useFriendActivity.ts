import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type FriendActivity = {
  id: string;
  type: "joined" | "created" | "looking";
  friend_id: string;
  friend_name: string;
  friend_avatar: string | null;
  match_id?: string;
  match_title?: string;
  join_code?: string;
  venue_name?: string;
  created_at: string;
};

export function useFriendActivity() {
  const { user } = useAuth();
  const [activities, setActivities] = useState<FriendActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }

    const load = async () => {
      setLoading(true);
      // Get accepted friend IDs
      // @ts-ignore
      const { data: friendships } = await supabase
        .from("friendships")
        .select("requester_id, recipient_id")
        // @ts-ignore
        .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`)
        // @ts-ignore
        .eq("status", "accepted");

      const friendIds = (friendships ?? []).map((f: any) =>
        f.requester_id === user.id ? f.recipient_id : f.requester_id
      ).filter(Boolean);

      if (friendIds.length === 0) {
        setActivities([]);
        setLoading(false);
        return;
      }

      // Recent match joins by friends (last 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: joins } = await supabase
        .from("match_participants")
        .select("id, user_id, match_id, joined_at, match:matches(id, title, join_code, venue_id)")
        .in("user_id", friendIds)
        .eq("status", "active")
        .gte("joined_at", sevenDaysAgo)
        .order("joined_at", { ascending: false })
        .limit(20);

      const matchIds = [...new Set((joins ?? []).map((j: any) => j.match_id).filter(Boolean))];
      if (matchIds.length === 0) {
        setActivities([]);
        setLoading(false);
        return;
      }
      const { data: matchesData } = await supabase
        .from("matches")
        .select("id, title, join_code, venue_id, venues(name)")
        .in("id", matchIds);
      const matchMap = new Map((matchesData ?? []).map((m: any) => [m.id, m]));

      // Fetch friend profiles
      const { data: profiles } = await (supabase as any)
        .from("public_profiles")
        .select("id, full_name, avatar_url")
        .in("id", friendIds);

      const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

      const items: FriendActivity[] = (joins ?? []).map((j: any) => {
        const prof = profileMap.get(j.user_id);
        const match = matchMap.get(j.match_id);
        const venue = Array.isArray(match?.venues) ? match.venues[0] : match?.venues;
        return {
          id: j.id,
          type: "joined" as const,
          friend_id: j.user_id,
          friend_name: prof?.full_name || "Friend",
          friend_avatar: prof?.avatar_url || null,
          match_id: match?.id ?? j.match_id,
          match_title: match?.title || null,
          join_code: match?.join_code || null,
          venue_name: venue?.name || null,
          created_at: j.joined_at,
        };
      });

      setActivities(items);
      setLoading(false);
    };

    load();
  }, [user]);

  return { activities, loading };
}
