import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft, Star, MapPin, ShieldAlert, Calendar, Trophy,
  Swords, MessageSquare, User, Flag, UserPlus, UserCheck, UserX, Loader2, Send
} from "lucide-react";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { useFriends } from "@/hooks/useFriends";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getFormattedTime } from "@/lib/matchHelpers";
import { useSEO } from "@/hooks/useSEO";

/* ---- Player Profile Page ---- */

const POSITIONS: Record<string, string> = {
  GK: "Goalkeeper", CB: "Centre-back", LB: "Left-back", RB: "Right-back",
  CM: "Central midfield", LM: "Left midfield", RM: "Right midfield",
  ST: "Striker", CF: "Centre-forward", LW: "Left winger", RW: "Right winger",
  CDM: "Defensive midfield", CAM: "Attacking midfield",
};

function initials(name?: string | null): string {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

function memberSince(date?: string): string {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

const StarRating = ({ score }: { score: number }) => {
  const rounded = Math.round(score);
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`w-4 h-4 ${i < rounded ? "text-amber-500 fill-amber-500" : "text-muted-foreground"}`}
        />
      ))}
    </div>
  );
};

const ReportModal = ({
  open,
  onClose,
  reportedUserId,
  reporterId,
}: {
  open: boolean;
  onClose: () => void;
  reportedUserId: string;
  reporterId?: string;
}) => {
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async () => {
    if (!reason.trim()) return;
    setSending(true);
    const { error } = await supabase.from("reports").insert({
      reported_user_id: reportedUserId,
      reporter_id: reporterId,
      reason: reason.trim(),
    } as any);
    setSending(false);
    if (error) {
      toast.error("Failed to send report");
      return;
    }
    toast.success("Report sent");
    setReason("");
    onClose();
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="bg-card rounded-xl p-6 w-full max-w-sm space-y-4 shadow-2xl">
        <div className="flex items-center gap-2">
          <Flag className="w-5 h-5 text-destructive" />
          <h2 className="font-display font-bold text-lg">Report player</h2>
        </div>
        <p className="text-sm text-muted-foreground">What happened? Your report is anonymous.</p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Describe the issue..."
          rows={3}
          className="w-full bg-secondary rounded-xl px-4 py-3 text-sm outline-none resize-none"
        />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 h-12 rounded-full bg-secondary text-sm font-semibold">Cancel</button>
          <button
            onClick={submit}
            disabled={!reason.trim() || sending}
            className="flex-1 h-12 rounded-full bg-destructive text-destructive-foreground text-sm font-semibold disabled:opacity-40"
          >
            {sending ? "Sending…" : "Report"}
          </button>
        </div>
      </div>
    </div>
  );
};

const PlayerProfile = () => {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile, stats, matchHistory, reviews, loading } = useProfile(username);

  useSEO({
    title: profile ? `${profile.full_name || profile.username} | PlayReady Sports Profile` : "Player Profile | PlayReady Sports",
    description: profile ? `View ${profile.full_name || profile.username}'s football stats, reputation, and match history on PlayReady Sports.` : "View player profiles, match history, and football stats on PlayReady Sports.",
    structuredData: profile ? {
      "@type": "Person",
      name: profile.full_name || profile.username,
      description: `Football player based in ${profile.city || "Ghana"}`,
      url: `https://joinplayready.com/player/${profile.username}`
    } : undefined
  });

  const { sendRequest, acceptRequest, unfriend, getFriendshipStatus } = useFriends();
  const [reportOpen, setReportOpen] = useState(false);
  const [friendStatus, setFriendStatus] = useState<"none" | "pending_sent" | "pending_received" | "friends">("none");
  const [friendLoading, setFriendLoading] = useState(false);
  const [friendshipId, setFriendshipId] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.id || !user || isOwn) return;
    let cancelled = false;
    getFriendshipStatus(profile.id).then((status) => {
      if (cancelled) return;
      setFriendStatus(status);
    });
    // Also fetch the friendship ID for unfriend/cancel
    // friendships table not in generated types yet
    (supabase as any)
      .from("friendships")
      .select("id, requester_id, status")
      .or(`and(requester_id.eq.${user.id},recipient_id.eq.${profile.id}),and(requester_id.eq.${profile.id},recipient_id.eq.${user.id})`)
      .maybeSingle()
      .then((res: any) => {
        if (cancelled) return;
        if (res.data) setFriendshipId(res.data.id);
      });
    return () => { cancelled = true; };
  }, [profile?.id, user?.id]);

  const isOwn = user?.id === profile?.id;

  const handleAddFriend = async () => {
    if (!profile?.id) return;
    setFriendLoading(true);
    const result = await sendRequest(profile.id);
    if (!result.error) {
      setFriendStatus("pending_sent");
    }
    setFriendLoading(false);
  };

  const handleAccept = async () => {
    if (!friendshipId) return;
    setFriendLoading(true);
    await acceptRequest(friendshipId);
    setFriendStatus("friends");
    setFriendLoading(false);
  };

  const handleUnfriend = async () => {
    if (!friendshipId) return;
    setFriendLoading(true);
    await unfriend(friendshipId);
    setFriendStatus("none");
    setFriendshipId(null);
    setFriendLoading(false);
  };

  return (
    <main className="min-h-screen bg-background pb-10">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="max-w-[680px] mx-auto px-5 h-14 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-secondary">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-display font-bold text-xl tracking-tight flex-1">Profile</h1>
          {isOwn && (
            <Link to="/profile/edit" className="text-xs font-semibold text-primary hover:underline">
              Edit
            </Link>
          )}
        </div>
      </header>

      <div className="max-w-[680px] mx-auto px-5 py-6 space-y-6">
        {loading ? (
          <div className="space-y-4 animate-pulse">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-full bg-secondary" />
              <div className="space-y-2 flex-1">
                <div className="h-4 bg-secondary rounded w-32" />
                <div className="h-3 bg-secondary rounded w-24" />
              </div>
            </div>
          </div>
        ) : !profile ? (
          <div className="text-center py-12">
            <User className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-semibold">Profile not yet set up</p>
            <p className="text-[11px] text-muted-foreground mt-1">This player hasn't completed their profile.</p>
          </div>
        ) : (
          <>
            {/* Avatar + Name */}
            <div className="flex items-start gap-4">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={profile.full_name ?? ""} className="w-20 h-20 rounded-full object-cover ring-2 ring-border" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center text-xl font-bold">
                  {initials(profile.full_name ?? profile.username)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-display font-bold text-2xl tracking-tight truncate">{profile.full_name ?? profile.username ?? "Player"}</p>
                <p className="text-sm text-muted-foreground">@{profile.username}</p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {profile.city && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="w-3 h-3" /> {profile.city}
                    </span>
                  )}
                  {profile.position && (
                    <span className="text-[11px] font-semibold bg-primary/8 border border-primary/15 text-primary rounded-full px-2 py-0.5">
                      {POSITIONS[profile.position] ?? profile.position}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <StarRating score={Math.round(profile.reputation_score ?? 5)} />
                  <span className="text-xs font-semibold text-muted-foreground">{profile.reputation_score?.toFixed(1) ?? "5.0"}</span>
                </div>
                {!isOwn && (
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {friendStatus === "none" && (
                      <button
                        onClick={handleAddFriend}
                        disabled={friendLoading}
                        className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-primary/8 border border-primary/15 text-primary hover:bg-primary/20 rounded-full px-3 py-1.5 disabled:opacity-50"
                      >
                        {friendLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
                        Add friend
                      </button>
                    )}
                    {friendStatus === "pending_sent" && (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-secondary text-muted-foreground rounded-full px-3 py-1.5">
                        <Loader2 className="w-3 h-3" /> Request sent
                      </span>
                    )}
                    {friendStatus === "pending_received" && (
                      <button
                        onClick={handleAccept}
                        disabled={friendLoading}
                        className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 rounded-full px-3 py-1.5 disabled:opacity-50"
                      >
                        {friendLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserCheck className="w-3 h-3" />}
                        Accept request
                      </button>
                    )}
                    {friendStatus === "friends" && (
                      <button
                        onClick={handleUnfriend}
                        disabled={friendLoading}
                        className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-secondary text-muted-foreground hover:text-destructive rounded-full px-3 py-1.5 disabled:opacity-50"
                      >
                        {friendLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserCheck className="w-3 h-3" />}
                        Friends
                      </button>
                    )}
                    <button
                      onClick={() => toast.info("Messaging coming soon")}
                      className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-secondary text-muted-foreground hover:bg-secondary/80 rounded-full px-3 py-1.5"
                    >
                      <MessageSquare className="w-3 h-3" /> Message
                    </button>
                    <button
                      onClick={() => toast.info("Invite feature coming soon")}
                      className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-secondary text-muted-foreground hover:bg-secondary/80 rounded-full px-3 py-1.5"
                    >
                      <Send className="w-3 h-3" /> Invite
                    </button>
                    <button
                      onClick={() => setReportOpen(true)}
                      className="text-[11px] text-muted-foreground hover:text-destructive underline inline-flex items-center gap-1 px-1"
                    >
                      <ShieldAlert className="w-3 h-3" /> Report
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Stats Cards */}
            {stats && (
              <div className="grid grid-cols-4 gap-2">
                <StatCard icon={Trophy} label="Matches" value={String(stats.matchesPlayed)} />
                <StatCard icon={MessageSquare} label="Reviews" value={String(stats.reviewsReceived)} />
                <StatCard icon={Star} label="Rating" value={stats.avgRating?.toFixed(1) ?? "—"} />
                <StatCard icon={Calendar} label="Joined" value={memberSince(profile.created_at)} />
              </div>
            )}

            {/* Match History */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Swords className="w-4 h-4 text-muted-foreground" />
                <h2 className="font-display font-bold text-lg tracking-tight">Match history</h2>
              </div>
              {matchHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No matches played yet.</p>
              ) : (
                <ul className="space-y-2">
                  {matchHistory.map((m) => (
                    <li key={m.id}>
                      <Link
                        to={`/lobby/${m.join_code}`}
                        className="flex items-center gap-3 bg-card rounded-xl px-4 py-3 border border-border hover:bg-secondary/50 transition-colors"
                      >
                        <span className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center shrink-0">
                          <Swords className="w-4 h-4 text-foreground/60" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{m.venue_name ?? "Venue"}</p>
                          <p className="text-[11px] text-muted-foreground">{getFormattedTime(m.match_date)} · {m.format}</p>
                        </div>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          m.status === "completed" ? "bg-success/15 text-success" :
                          m.status === "cancelled" ? "bg-destructive/10 text-destructive" :
                          "bg-primary/8 border border-primary/15 text-primary"
                        }`}>
                          {m.status}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Reviews */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare className="w-4 h-4 text-muted-foreground" />
                <h2 className="font-display font-bold text-lg tracking-tight">Reviews</h2>
              </div>
              {reviews.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No reviews yet.</p>
              ) : (
                <ul className="space-y-3">
                  {reviews.map((r) => (
                    <li key={r.id} className="bg-card rounded-xl p-4 border border-border">
                      <div className="flex items-center gap-3 mb-2">
                        {r.reviewer_avatar ? (
                          <img src={r.reviewer_avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold">
                            {initials(r.reviewer_name)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{r.reviewer_name}</p>
                          <StarRating score={r.rating} />
                        </div>
                        <span className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
                      </div>
                      {r.comment && <p className="text-sm text-muted-foreground leading-relaxed">{r.comment}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>

      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        reportedUserId={profile?.id ?? ""}
        reporterId={user?.id}
      />
    </main>
  );
};

/* ---- Sub-components ---- */

const StatCard = ({
  icon: Icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: string;
}) => (
  <div className="bg-card rounded-xl p-3 border border-border text-center">
    <Icon className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
    <p className="font-display font-bold text-lg leading-none">{value}</p>
    <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider font-semibold">{label}</p>
  </div>
);

export default PlayerProfile;
