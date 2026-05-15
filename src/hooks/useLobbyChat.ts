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

export function useLobbyChat(matchId: string | undefined) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!matchId) { setMessages([]); return; }

    let cancelled = false;
    setLoading(true);

    const load = async () => {
      const { data, error } = await supabase
        .from("messages")
        .select(`
          id, sender_id, content, created_at,
          sender:profiles(username, full_name, avatar_url)
        `)
        .eq("match_id", matchId)
        .order("created_at", { ascending: true })
        .limit(50);

      if (cancelled) return;

      if (error) {
        console.error("useLobbyChat load error:", error);
      } else {
        const normalized = (data ?? []).map((row: any) => {
          const s = Array.isArray(row.sender) ? row.sender[0] ?? {} : row.sender ?? {};
          return {
            id: row.id,
            sender_id: row.sender_id,
            sender_name: s.full_name ?? s.username ?? "Unknown",
            sender_avatar: s.avatar_url ?? null,
            content: row.content,
            created_at: row.created_at,
          } as ChatMessage;
        });
        setMessages(normalized);
      }
      setLoading(false);
    };

    load();

    // Realtime subscription
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
        (payload: any) => {
          const newRow = payload.new;
          // Fetch sender profile for the new message
          supabase
            .from("profiles")
            .select("username, full_name, avatar_url")
            .eq("id", newRow.sender_id)
            .single()
            .then(({ data: prof }) => {
              const msg: ChatMessage = {
                id: newRow.id,
                sender_id: newRow.sender_id,
                sender_name: prof?.full_name ?? prof?.username ?? "Unknown",
                sender_avatar: prof?.avatar_url ?? null,
                content: newRow.content,
                created_at: newRow.created_at,
              };
              setMessages((prev) => [...prev, msg]);
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

  // Auto-scroll to bottom on new message
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const sendMessage = useCallback(async (content: string, userId: string) => {
    if (!matchId || !content.trim()) return;
    const trimmed = content.trim().slice(0, 500);

    if (containsPoachingContent(trimmed)) {
      console.warn("[useLobbyChat] Message blocked by anti-poaching filter");
      return { blocked: true };
    }

    const { error } = await supabase.from("messages").insert({
      match_id: matchId,
      sender_id: userId,
      content: trimmed,
      message_type: "text" as any,
    });
    if (error) console.error("sendMessage error:", error);
    return { blocked: false };
  }, [matchId]);

  return { messages, loading, sendMessage, scrollRef };
}
