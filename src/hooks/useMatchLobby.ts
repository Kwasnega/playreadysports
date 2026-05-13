import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type LobbyParticipant = {
  id: string;
  user_id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  slot_type: string;
  team: string;
  payment_status: string;
  status: string;
  joined_at: string;
};

export type LobbyMatch = {
  id: string;
  join_code: string;
  title: string | null;
  match_mode: string;
  match_type: string;
  format: string;
  players_per_side: number | null;
  max_core_players: number | null;
  max_spare_players: number;
  match_date: string;
  duration_minutes: number;
  entry_fee: number;
  status: string;
  core_paid_count: number;
  notes: string | null;
  organizer_id: string;
  venue: {
    id: string;
    name: string;
    city: string;
    area: string | null;
    lat: number | null;
    lng: number | null;
  } | null;
  organizer: {
    id: string;
    username: string | null;
    full_name: string | null;
    avatar_url: string | null;
    reputation_score: number | null;
  } | null;
};

export function useMatchLobby(joinCode: string) {
  const { user } = useAuth();
  const [match, setMatch] = useState<LobbyMatch | null>(null);
  const [participants, setParticipants] = useState<LobbyParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const matchId = match?.id;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const load = async () => {
      const { data, error: supaErr } = await supabase
        .from("matches")
        .select(`
          *,
          venue:venues(id, name, city, area, lat, lng),
          organizer:profiles(id, username, full_name, avatar_url, reputation_score)
        `)
        .eq("join_code", joinCode)
        .single();

      if (cancelled) return;

      if (supaErr) {
        setError(supaErr.message);
        setLoading(false);
        return;
      }

      const m = {
        ...data,
        venue: Array.isArray(data.venue) ? data.venue[0] ?? null : data.venue ?? null,
        organizer: Array.isArray(data.organizer) ? data.organizer[0] ?? null : data.organizer ?? null,
      } as LobbyMatch;
      setMatch(m);

      // Load participants
      await loadParticipants(m.id);
    };

    const loadParticipants = async (mid: string) => {
      const { data, error: pErr } = await supabase
        .from("match_participants")
        .select(`
          id, user_id, slot_type, team, payment_status, status, joined_at,
          profile:profiles(username, full_name, avatar_url)
        `)
        .eq("match_id", mid)
        .order("joined_at", { ascending: true });

      if (cancelled) return;

      if (pErr) {
        console.error("loadParticipants error:", pErr);
      } else {
        const normalized = (data ?? []).map((row: any) => {
          const prof = Array.isArray(row.profile) ? row.profile[0] ?? {} : row.profile ?? {};
          return {
            id: row.id,
            user_id: row.user_id,
            username: prof.username ?? null,
            full_name: prof.full_name ?? null,
            avatar_url: prof.avatar_url ?? null,
            slot_type: row.slot_type,
            team: row.team,
            payment_status: row.payment_status,
            status: row.status,
            joined_at: row.joined_at,
          } as LobbyParticipant;
        });
        setParticipants(normalized);
      }
      setLoading(false);
    };

    load();

    return () => { cancelled = true; };
  }, [joinCode]);

  // Realtime subscription for participants
  useEffect(() => {
    if (!matchId) return;

    const channelName = "lobby-participants:" + matchId;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "match_participants",
          filter: `match_id=eq.${matchId}`,
        } as any,
        () => {
          // Reload participants
          supabase
            .from("match_participants")
            .select(`
              id, user_id, slot_type, team, payment_status, status, joined_at,
              profile:profiles(username, full_name, avatar_url)
            `)
            .eq("match_id", matchId)
            .order("joined_at", { ascending: true })
            .then(({ data }) => {
              const normalized = (data ?? []).map((row: any) => {
                const prof = Array.isArray(row.profile) ? row.profile[0] ?? {} : row.profile ?? {};
                return {
                  id: row.id,
                  user_id: row.user_id,
                  username: prof.username ?? null,
                  full_name: prof.full_name ?? null,
                  avatar_url: prof.avatar_url ?? null,
                  slot_type: row.slot_type,
                  team: row.team,
                  payment_status: row.payment_status,
                  status: row.status,
                  joined_at: row.joined_at,
                } as LobbyParticipant;
              });
              setParticipants(normalized);
            });
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [matchId]);

  const activeParticipants = useMemo(
    () => participants.filter((p) => p.status === "active"),
    [participants]
  );

  const coreList = useMemo(
    () => activeParticipants.filter((p) => p.slot_type === "core"),
    [activeParticipants]
  );

  const spareList = useMemo(
    () => activeParticipants.filter((p) => p.slot_type === "spare"),
    [activeParticipants]
  );

  const joinRequests = useMemo(
    () => participants.filter((p) => p.status === "pending"),
    [participants]
  );

  const corePaidCount = useMemo(
    () => coreList.filter((p) => p.payment_status === "paid").length,
    [coreList]
  );

  const maxCore = match?.max_core_players ?? match?.players_per_side ?? 10;

  const isOrganizer = user?.id === match?.organizer_id;
  const userParticipant = participants.find((p) => p.user_id === user?.id) ?? null;

  return {
    match,
    venue: match?.venue,
    organizer: match?.organizer,
    participants,
    activeParticipants,
    coreList,
    spareList,
    joinRequests,
    coreCount: coreList.length,
    corePaidCount,
    maxCore,
    isOrganizer,
    userParticipant,
    loading,
    error,
  };
}
