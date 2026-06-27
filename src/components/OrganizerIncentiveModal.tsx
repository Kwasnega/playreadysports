import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PartyPopper, X } from "lucide-react";

export function OrganizerIncentiveModal() {
  const { user } = useAuth();
  const [notificationId, setNotificationId] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [completedCount, setCompletedCount] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;

    const checkNotifications = async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, data")
        .eq("user_id", user.id)
        .eq("is_read", false)
        .eq("type", "system")
        .order("created_at", { ascending: true })
        .limit(10);

      if (error || !data || data.length === 0) return;

      // Find the first unread organizer_incentive notification
      const incentiveNotif = data.find((n: any) => n.data && n.data.type === "organizer_incentive");
      if (incentiveNotif) {
        setNotificationId(incentiveNotif.id);
        setAmount(Number(incentiveNotif.data.amount));
        setCompletedCount(Number(incentiveNotif.data.completed_count));
        setOpen(true);
      }
    };

    checkNotifications();
  }, [user]);

  const dismiss = async () => {
    setOpen(false);
    if (notificationId) {
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", notificationId);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-card w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden border border-border animate-in zoom-in-95 duration-300">
        <div className="relative pt-8 pb-6 px-6 text-center">
          <button
            onClick={dismiss}
            className="absolute top-4 right-4 p-2 rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          
          <div className="mx-auto w-16 h-16 bg-gradient-to-tr from-emerald-500 to-teal-400 rounded-full flex items-center justify-center mb-5 shadow-lg shadow-emerald-500/20">
            <PartyPopper className="w-8 h-8 text-white" />
          </div>
          
          <h2 className="text-2xl font-display font-bold text-foreground mb-2">
            Milestone Achieved!
          </h2>
          
          <p className="text-muted-foreground text-sm leading-relaxed mb-6">
            🎉 You've been credited <strong className="text-foreground">GHS {amount?.toFixed(2)}</strong> for completing <strong className="text-foreground">{completedCount} matches</strong> as an active organizer on PlayReady Sports!
          </p>

          <button
            onClick={dismiss}
            className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold py-3 rounded-xl shadow-lg transition-all active:scale-[0.98]"
          >
            Claim Reward
          </button>
        </div>
      </div>
    </div>
  );
}
