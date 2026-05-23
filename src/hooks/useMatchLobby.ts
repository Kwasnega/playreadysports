import { useCallback, useEffect, useState, useMemo } from "react";
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
  attendance_scanned?: boolean;
  no_show?: boolean;
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
  team_color_a: string | null;
  team_color_b: string | null;
  winning_team: string | null;
  venue: {
    id: string;
    name: string;
    city: string;
    area: string | null;
    lat: number | null;
    lng: number | null;
    image_urls: string[] | null;
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

  const loadParticipants = useCallback(async (mid: string) => {
    const { data, error: pErr } = await supabase
      .from("match_participants")
      .select("id, user_id, slot_type, team, payment_status, status, joined_at, attendance_scanned, no_show")
      .eq("match_id", mid)
      .order("joined_at", { ascending: true });

    if (pErr) {
      return;
    }

    const userIds = [...new Set((data ?? []).map((r: any) => r.user_id))];
    const profMap: Record<string, any> = {};
    if (userIds.length > 0) {
      const { data: profs } = await (supabase as any)
        .from("public_profiles")
        .select("id, username, full_name, avatar_url")
        .in("id", userIds);
      (profs ?? []).forEach((p: any) => { profMap[p.id] = p; });
    }

    const normalized = (data ?? []).map((row: any) => {
      const prof = profMap[row.user_id] ?? {};
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
        attendance_scanned: !!row.attendance_scanned,
        no_show: !!row.no_show,
      } as LobbyParticipant;
    });
    setParticipants(normalized);
  }, []);

  const refresh = useCallback(async () => {
    if (!matchId) return;
    setLoading(true);
    await loadParticipants(matchId);
    setLoading(false);
  }, [matchId, loadParticipants]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const load = async () => {
      const { data, error: supaErr } = await supabase
        .from("matches")
        .select("*, venue:venues(id, name, city, area, lat, lng, image_urls)")
        .eq("join_code", joinCode)
        .single();

      if (cancelled) return;

      if (supaErr) {
        setError(supaErr.message);
        setLoading(false);
        return;
      }

      let organizer = null;
      if ((data as any).organizer_id) {
        const { data: org } = await (supabase as any)
          .from("public_profiles")
          .select("id, username, full_name, avatar_url, reputation_score")
          .eq("id", (data as any).organizer_id)
          .maybeSingle();
        organizer = org ?? null;
      }

      const m = {
        ...data,
        venue: Array.isArray(data.venue) ? data.venue[0] ?? null : data.venue ?? null,
        organizer,
        team_color_a: (data as any).team_color_a ?? null,
        team_color_b: (data as any).team_color_b ?? null,
        winning_team: (data as any).winning_team ?? null,
      } as unknown as LobbyMatch;
      setMatch(m);

      // Load participants
      await loadParticipants(m.id);
      if (!cancelled) setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, [joinCode, loadParticipants]);

  // Realtime subscription — incremental updates instead of full refetch
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
        (payload: any) => {
          const ev = payload.eventType;
          const newRow = payload.new;
          const oldRow = payload.old;

          if (ev === "DELETE") {
            setParticipants((prev) => prev.filter((p) => p.id !== oldRow.id));
            return;
          }

          if (ev === "INSERT" && newRow) {
            // Profile not included in realtime payload; do a single-row fetch
            (supabase as any)
              .from("public_profiles")
              .select("username, full_name, avatar_url")
              .eq("id", newRow.user_id)
              .single()
              .then(({ data: prof }) => {
                setParticipants((prev) => {
                  if (prev.some((p) => p.id === newRow.id)) return prev;
                  const next = [...prev, {
                    id: newRow.id,
                    user_id: newRow.user_id,
                    username: prof?.username ?? null,
                    full_name: prof?.full_name ?? null,
                    avatar_url: prof?.avatar_url ?? null,
                    slot_type: newRow.slot_type,
                    team: newRow.team,
                    payment_status: newRow.payment_status,
                    status: newRow.status,
                    joined_at: newRow.joined_at,
                    attendance_scanned: !!newRow.attendance_scanned,
                  } as LobbyParticipant];
                  return next.sort((a, b) =>
                    new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime()
                  );
                });
              });
            return;
          }

          if (ev === "UPDATE" && newRow) {
            setParticipants((prev) =>
              prev.map((p) =>
                p.id === newRow.id
                  ? {
                      ...p,
                      slot_type: newRow.slot_type ?? p.slot_type,
                      team: newRow.team ?? p.team,
                      payment_status: newRow.payment_status ?? p.payment_status,
                      status: newRow.status ?? p.status,
                      attendance_scanned: !!newRow.attendance_scanned,
                    }
                  : p
              )
            );
            return;
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [matchId]);

  // Realtime: watch match status changes (e.g. upcoming -> completed)
  useEffect(() => {
    if (!matchId) return;

    const channel = supabase
      .channel(`lobby-match:${matchId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "matches",
          filter: `id=eq.${matchId}`,
        } as any,
        (payload: any) => {
          const newRow = payload.new;
          if (!newRow) return;
          setMatch((prev) => {
            if (!prev) return prev;
            return { ...prev, status: newRow.status ?? prev.status } as LobbyMatch;
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
    refresh,
  };
}
