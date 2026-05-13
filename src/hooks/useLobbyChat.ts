import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

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

  const sendMessage = async (content: string, userId: string) => {
    if (!matchId || !content.trim()) return;
    const { error } = await supabase.from("messages").insert({
      match_id: matchId,
      sender_id: userId,
      content: content.trim().slice(0, 500),
      message_type: "text" as any,
    });
    if (error) console.error("sendMessage error:", error);
  };

  return { messages, loading, sendMessage, scrollRef };
}
