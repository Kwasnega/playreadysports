import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell, BellOff, UserPlus, UserMinus, CalendarClock, XCircle, ShieldAlert, Megaphone, Mail, CheckCheck,
} from "lucide-react";
import { gsap } from "gsap";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { useNotifications, timeAgo, type NotifType } from "@/hooks/useNotifications";
import { useAuth } from "@/hooks/useAuth";

const iconFor = (t: NotifType) => {
  switch (t) {
    case "match_invite": return Mail;
    case "match_join":   return UserPlus;
    case "match_leave":  return UserMinus;
    case "match_update": return CalendarClock;
    case "match_cancel": return XCircle;
    case "account":      return ShieldAlert;
    default:             return Megaphone;
  }
};

export const NotificationsBell = () => {
  const { user } = useAuth();
  const { items, loading, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  const prevUnread = useRef(unreadCount);

  // Bell shake when a new unread arrives.
  useEffect(() => {
    if (unreadCount > prevUnread.current && bellRef.current) {
      gsap.fromTo(
        bellRef.current,
        { rotation: 0 },
        { rotation: -12, duration: 0.07, yoyo: true, repeat: 5, ease: "power1.inOut",
          onComplete: () => gsap.set(bellRef.current, { rotation: 0 }) },
      );
    }
    prevUnread.current = unreadCount;
  }, [unreadCount]);

  // Stagger items on open.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const rows = listRef.current.querySelectorAll("[data-notif]");
    if (!rows.length) return;
    gsap.fromTo(rows, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.25, stagger: 0.04, ease: "power2.out" });
  }, [open, items.length]);

  const onClick = (n: { id: string; link?: string; type: NotifType; message: string }) => {
    markRead(n.id);
    setOpen(false);
    // Navigate via data.join_code if present (extract from message or stored link)
    if (n.link) {
      nav(n.link);
      return;
    }
    // Try to extract join code from message for match notifications
    if (n.type && n.type.startsWith("match_")) {
      const codeMatch = n.message.match(/([A-Z]{3}-\d{3})/);
      if (codeMatch) {
        nav(`/lobby/${codeMatch[1]}`);
      }
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          ref={bellRef}
          className="relative p-2 rounded-full hover:bg-secondary"
          aria-label="Notifications"
        >
          <Bell className="w-5 h-5" />
          {user && unreadCount > 0 && (
            <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold leading-[18px] text-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[340px] p-0 rounded-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="font-display font-bold text-sm">Notifications</p>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-[11px] font-semibold text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <CheckCheck className="w-3.5 h-3.5" /> Mark all read
            </button>
          )}
        </div>

        <div ref={listRef} className="max-h-[60vh] overflow-y-auto">
          {loading && (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">Loading…</div>
          )}
          {!loading && items.length === 0 && (
            <div className="px-4 py-10 text-center">
              <BellOff className="w-7 h-7 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-semibold">You're all caught up 👍</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                You'll see match updates and invites here.
              </p>
            </div>
          )}
          {!loading && items.map((n) => {
            const Icon = iconFor(n.type);
            return (
              <button
                key={n.id}
                data-notif
                onClick={() => onClick(n)}
                className={`w-full text-left px-4 py-3 flex items-start gap-3 border-b border-border last:border-b-0 transition-colors hover:bg-secondary/60 ${
                  !n.read ? "bg-primary/5 border-l-2 border-l-emerald-500 pl-[14px]" : ""
                }`}
              >
                <span className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                  !n.read ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"
                }`}>
                  <Icon className="w-4 h-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold truncate">{n.title}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                      {timeAgo(n.createdAt)}
                    </span>
                  </span>
                  <span className="block text-[11px] text-muted-foreground truncate">
                    {n.message}
                  </span>
                </span>
                {!n.read && <span className="mt-1.5 w-2 h-2 rounded-full bg-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};