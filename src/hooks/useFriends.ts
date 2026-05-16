import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type Friendship = {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: "pending" | "accepted" | "blocked";
  created_at: string;
  updated_at: string;
  requester?: { id: string; username: string | null; full_name: string | null; avatar_url: string | null };
  recipient?: { id: string; username: string | null; full_name: string | null; avatar_url: string | null };
};

export type FriendProfile = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

export function useFriends() {
  const { user } = useAuth();
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [pendingRequests, setPendingRequests] = useState<Friendship[]>([]);
  const [sentRequests, setSentRequests] = useState<Friendship[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) { setFriends([]); setPendingRequests([]); setSentRequests([]); setLoading(false); return; }
    setLoading(true);

    // @ts-ignore — friendships table not in generated types yet
    const { data, error } = await supabase
      .from("friendships")
      .select("*, requester:profiles!requester_id(id, username, full_name, avatar_url), recipient:profiles!recipient_id(id, username, full_name, avatar_url)")
      .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .order("created_at", { ascending: false });

    if (error) { setLoading(false); return; }

    const accepted: FriendProfile[] = [];
    const pending: Friendship[] = [];
    const sent: Friendship[] = [];

    (data ?? []).forEach((row: any) => {
      const f: Friendship = {
        id: row.id,
        requester_id: row.requester_id,
        recipient_id: row.recipient_id,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
        requester: row.requester,
        recipient: row.recipient,
      };

      if (f.status === "accepted") {
        const isRequester = f.requester_id === user.id;
        const profile = isRequester ? f.recipient : f.requester;
        if (profile) accepted.push(profile);
      } else if (f.status === "pending") {
        if (f.recipient_id === user.id) pending.push(f);
        else sent.push(f);
      }
    });

    setFriends(accepted);
    setPendingRequests(pending);
    setSentRequests(sent);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!user) return;

    const chan1 = supabase.channel(`friendships_req:${user.id}`);
    const chan2 = supabase.channel(`friendships_rec:${user.id}`);

    try {
      chan1
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "friendships", filter: `requester_id=eq.${user.id}` },
          () => load()
        )
        .subscribe();
    } catch {
      /* ignore duplicate subscription on strict-mode remount */
    }

    try {
      chan2
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "friendships", filter: `recipient_id=eq.${user.id}` },
          () => load()
        )
        .subscribe();
    } catch {
      /* ignore duplicate subscription on strict-mode remount */
    }

    return () => {
      supabase.removeChannel(chan1);
      supabase.removeChannel(chan2);
    };
  }, [user, load]);

  const sendRequest = async (recipientId: string) => {
    if (!user) return { error: "Not signed in" };
    // Check if friendship already exists
    // @ts-ignore
    const { data: existing } = await supabase
      .from("friendships")
      .select("id, status")
      .or(`and(requester_id.eq.${user.id},recipient_id.eq.${recipientId}),and(requester_id.eq.${recipientId},recipient_id.eq.${user.id})`)
      .maybeSingle();
    if (existing) {
      if (existing.status === "accepted") return { error: "You are already friends with this player." };
      if (existing.status === "pending") return { error: "Friend request already sent." };
    }
    // @ts-ignore
    const { error } = await supabase.from("friendships").insert({
      requester_id: user.id,
      recipient_id: recipientId,
      status: "pending",
    });
    if (error) {
      if (error.message?.includes("duplicate") || error.code === "23505") {
        return { error: "You are already friends with this player." };
      }
      return { error: error.message };
    }
    // Send notification to recipient
    await supabase.from("notifications").insert({
      user_id: recipientId,
      title: "Friend request",
      body: `${user.user_metadata?.full_name || "Someone"} sent you a friend request`,
      type: "match_invite", // reuse existing type or add "friend_request"
      data: { sender_id: user.id },
    });
    load();
    return { error: null };
  };

  const acceptRequest = async (friendshipId: string) => {
    if (!user) return;
    // @ts-ignore
    await supabase.from("friendships").update({ status: "accepted", updated_at: new Date().toISOString() }).eq("id", friendshipId);
    load();
  };

  const rejectRequest = async (friendshipId: string) => {
    if (!user) return;
    // @ts-ignore
    await supabase.from("friendships").delete().eq("id", friendshipId);
    load();
  };

  const unfriend = async (friendshipId: string) => {
    if (!user) return;
    // @ts-ignore
    await supabase.from("friendships").delete().eq("id", friendshipId);
    load();
  };

  const getFriendshipStatus = async (otherUserId: string): Promise<"none" | "pending_sent" | "pending_received" | "friends"> => {
    if (!user || otherUserId === user.id) return "none";
    // @ts-ignore
    const { data } = await supabase
      .from("friendships")
      .select("id, requester_id, status")
      .or(`and(requester_id.eq.${user.id},recipient_id.eq.${otherUserId}),and(requester_id.eq.${otherUserId},recipient_id.eq.${user.id})`)
      .maybeSingle();

    if (!data) return "none";
    if (data.status === "accepted") return "friends";
    if (data.requester_id === user.id) return "pending_sent";
    return "pending_received";
  };

  return {
    friends,
    pendingRequests,
    sentRequests,
    loading,
    sendRequest,
    acceptRequest,
    rejectRequest,
    unfriend,
    getFriendshipStatus,
    refresh: load,
  };
}
