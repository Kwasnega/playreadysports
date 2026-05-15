import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle, ChevronRight, Inbox as InboxIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface InboxItem {
  id: string;
  title: string;
  body: string;
  type: string;
  is_read: boolean;
  created_at: string;
  data: { match_id?: string; join_code?: string } | null;
}

export function Inbox() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setItems([]); setLoading(false); return; }
    (async () => {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from("notifications")
        .select("id, title, body, type, is_read, created_at, data")
        .eq("user_id", user.id)
        .in("type", ["match_share", "friend_invite", "match_join", "match_update"])
        .order("created_at", { ascending: false })
        .limit(50);
      if (!error) setItems((data ?? []) as InboxItem[]);
      setLoading(false);
    })();
  }, [user]);

  const openItem = async (item: InboxItem) => {
    if (!item.is_read) {
      await supabase.from("notifications").update({ is_read: true }).eq("id", item.id);
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, is_read: true } : i));
    }
    const code = item.data?.join_code;
    if (code) navigate(`/lobby/${code}`);
  };

  if (!user) return null;

  return (
    <div className="bg-card rounded-3xl border border-border/60 overflow-hidden">
      <div className="px-5 py-4 border-b border-border/60 flex items-center gap-2">
        <MessageCircle className="w-4 h-4 text-primary" />
        <h3 className="font-display font-bold text-sm">Messages</h3>
        <span className="text-[10px] text-muted-foreground ml-auto">
          {items.filter((i) => !i.is_read).length} unread
        </span>
      </div>
      {loading ? (
        <div className="p-5 space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-secondary rounded-xl" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="p-8 text-center">
          <InboxIcon className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No messages yet</p>
          <p className="text-[11px] text-muted-foreground mt-1">Match invites and friend shares will appear here.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border/60 max-h-[400px] overflow-y-auto">
          {items.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => openItem(item)}
                className={`w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-secondary/50 transition-colors ${!item.is_read ? "bg-primary/5" : ""}`}
              >
                <div className={`w-2 h-2 rounded-full shrink-0 ${!item.is_read ? "bg-primary" : "bg-transparent"}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm truncate ${!item.is_read ? "font-bold" : "font-medium"}`}>{item.title}</p>
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">{item.body}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {new Date(item.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                {item.data?.join_code && <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
