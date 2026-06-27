import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Clock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export type NotifType =
  | "match_share"
  | "match_invite"
  | "match_join"
  | "match_leave"
  | "match_update"
  | "match_cancel"
  | "match_confirmed"
  | "match_reminder"
  | "payment_received"
  | "refund_processed"
  | "account"
  | "system";

export type Notif = {
  id: string;
  type: NotifType;
  title: string;
  message: string;
  createdAt: Date;
  read: boolean;
  link?: string;
};

const PAGE = 20;

const toNotif = (v: any): Notif => {
  const data = v.data ?? {};
  return {
    id: v.id,
    type: (data.original_type || v.type || "system") as NotifType,
    title: v.title ?? "",
    message: v.body ?? "",
    createdAt: new Date(v.created_at),
    read: !!v.is_read,
    link: data.link,
  };
};

const showToast = (n: Notif) => {
  const t = n.type;
  const title = n.title;
  const body = n.message;
  if (!title) return;
  if (t === "match_join" || t === "match_confirmed") {
    toast.success(title, { description: body, duration: 4000 });
  } else if (t === "match_cancel" || t === "match_update") {
    toast(title, {
      description: body,
      duration: 4000,
      style: { background: "#fff7ed", borderColor: "#fdba74", color: "#9a3412" },
    });
  } else if (t === "payment_received") {
    toast(title, { description: body, duration: 4000 });
  } else if (t === "match_reminder") {
    toast(title, { description: body, duration: 5000, icon: <Clock className="w-4 h-4 text-primary" /> });
  } else {
    toast(title, { description: body, duration: 4000 });
  }
};

/** Realtime notifications for the signed-in user via Supabase. */
export const useNotifications = () => {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const load = async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(PAGE);

      if (error) {
        if (mountedRef.current) setLoading(false);
        return;
      }

      if (mountedRef.current) {
        setItems((data ?? []).map(toNotif));
        setLoading(false);
      }
    };

    load();

    let channel = supabase.channel(`notifications:${userId}`);
    const subscribe = () => {
      channel = supabase.channel(`notifications:${userId}`);
      channel
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
          (payload) => {
            const n = toNotif(payload.new);
            setItems((prev) => {
              const exists = prev.some((p) => p.id === n.id);
              if (exists) return prev;
              return [n, ...prev].slice(0, PAGE);
            });
            showToast(n);
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
          () => load()
        )
        .subscribe((status, err) => {
          if (err) {
            // Realtime subscription error — silently ignore in production
          }
        });
    };
    subscribe();

    // Mobile: reconnect when app comes back from background
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        load();
        supabase.removeChannel(channel);
        subscribe();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    const onOnline = () => {
      load();
      supabase.removeChannel(channel);
      subscribe();
    };
    window.addEventListener("online", onOnline);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const unreadCount = items.filter((n) => !n.read).length;

  const markRead = async (id: string) => {
    if (!userId) return;
    await supabase.from("notifications").update({ is_read: true }).eq("id", id).eq("user_id", userId);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAllRead = async () => {
    if (!userId) return;
    const unread = items.filter((n) => !n.read);
    if (!unread.length) return;
    const ids = unread.map((n) => n.id);
    await supabase.from("notifications").update({ is_read: true }).in("id", ids).eq("user_id", userId);
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  return { items, loading, unreadCount, markRead, markAllRead };
};

export const timeAgo = (d: Date) => {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const day = Math.floor(h / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString();
};