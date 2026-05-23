import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const ANTI_POACH_PATTERNS = [
  /\b\d{9,}\b/,                              // phone numbers (9+ digits)
  /\+\d{1,3}\s?\d{6,}/,                      // international phone
  /\b\w+@\w+\.\w{2,}\b/,                     // email addresses
  /https?:\/\/[^\s]+/i,                       // URLs
  /\b(whatsapp|telegram|signal|ig|insta|snapchat)\b/i, // platform keywords
  /\b(wa\.me|t\.me|bit\.ly)\b/i,             // short links
];

function containsPoachingContent(text: string): boolean {
  return ANTI_POACH_PATTERNS.some((pattern) => pattern.test(text));
}

export type ChatMessage = {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_avatar: string | null;
  content: string;
  created_at: string;
};

const PAGE_SIZE = 50;

type ProfileCache = Record<string, { full_name: string | null; username: string | null; avatar_url: string | null }>;

function normalizeRow(row: any, cache?: ProfileCache): ChatMessage {
  const s = Array.isArray(row.sender) ? row.sender[0] ?? {} : row.sender ?? {};
  const prof = cache?.[row.sender_id] ?? s;
  return {
    id: row.id,
    sender_id: row.sender_id,
    sender_name: prof.full_name ?? prof.username ?? "Unknown",
    sender_avatar: prof.avatar_url ?? null,
    content: row.content,
    created_at: row.created_at,
  };
}

export function useLobbyChat(matchId: string | undefined) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const profileCache = useRef<ProfileCache>({});
  const oldestCreatedAt = useRef<string | null>(null);

  useEffect(() => {
    if (!matchId) { setMessages([]); setHasMore(false); return; }

    let cancelled = false;
    setLoading(true);
    profileCache.current = {};
    oldestCreatedAt.current = null;

    const load = async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, sender_id, content, created_at")
        .eq("match_id", matchId)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      if (cancelled) return;

      if (error) {
        // Loading error — silently handled
      } else {
        const rows = (data ?? []).reverse();
        const senderIds = [...new Set(rows.map((r: any) => r.sender_id))];
        if (senderIds.length > 0) {
          const { data: profs } = await (supabase as any)
            .from("public_profiles")
            .select("id, username, full_name, avatar_url")
            .in("id", senderIds);
          (profs ?? []).forEach((p: any) => { profileCache.current[p.id] = p; });
        }
        const normalized = rows.map((row: any) => normalizeRow(row, profileCache.current));
        setMessages(normalized);
        setHasMore((data ?? []).length === PAGE_SIZE);
        if (rows.length > 0) oldestCreatedAt.current = rows[0].created_at;
      }
      setLoading(false);
    };

    load();

    // Realtime subscription — profile cache eliminates N+1 fetch on most messages
    const channelName = "lobby-chat:" + matchId;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `match_id=eq.${matchId}`,
        } as any,
        async (payload: any) => {
          const newRow = payload.new;
          let prof = profileCache.current[newRow.sender_id];
          if (!prof) {
            const { data: p } = await (supabase as any)
              .from("public_profiles")
              .select("username, full_name, avatar_url")
              .eq("id", newRow.sender_id)
              .single();
            prof = p ?? { full_name: null, username: null, avatar_url: null };
            profileCache.current[newRow.sender_id] = prof;
          }
          const msg = normalizeRow(newRow, profileCache.current);
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [matchId]);

  const loadMore = useCallback(async () => {
    if (!matchId || !hasMore || loadingMore || !oldestCreatedAt.current) return;
    setLoadingMore(true);
    const { data, error } = await supabase
      .from("messages")
      .select("id, sender_id, content, created_at")
      .eq("match_id", matchId)
      .lt("created_at", oldestCreatedAt.current)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    setLoadingMore(false);
    if (error) { return; }
    const rows = (data ?? []).reverse();
    const senderIds = [...new Set(rows.map((r: any) => r.sender_id))];
    if (senderIds.length > 0) {
      const { data: profs } = await (supabase as any)
        .from("public_profiles")
        .select("id, username, full_name, avatar_url")
        .in("id", senderIds);
      (profs ?? []).forEach((p: any) => { profileCache.current[p.id] = p; });
    }
    const older = rows.map((row: any) => normalizeRow(row, profileCache.current));
    setMessages((prev) => [...older, ...prev]);
    setHasMore((data ?? []).length === PAGE_SIZE);
    if (rows.length > 0) oldestCreatedAt.current = rows[0].created_at;
  }, [matchId, hasMore, loadingMore]);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const sendMessage = useCallback(async (content: string, userId: string) => {
    if (!matchId || !content.trim()) return;
    const trimmed = content.trim().slice(0, 500);

    if (containsPoachingContent(trimmed)) {
      return { blocked: true };
    }

    const { error } = await supabase.from("messages").insert({
      match_id: matchId,
      sender_id: userId,
      content: trimmed,
      message_type: "text" as any,
    });
    return { blocked: false };
  }, [matchId]);

  return { messages, loading, loadingMore, hasMore, loadMore, sendMessage, scrollRef };
}
