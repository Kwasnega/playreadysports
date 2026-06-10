import { useState, ReactNode, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { useFriends } from "@/hooks/useFriends";
import { useAuth } from "@/hooks/useAuth";
import { UserPlus, UserCheck, UserX, Loader2, Search, Users, Sparkles, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Props = { trigger: ReactNode };

type Tab = "friends" | "requests" | "suggested";

export const FriendsSheet = ({ trigger }: Props) => {
  const { user } = useAuth();
  const { friends, pendingRequests, loading, acceptRequest, rejectRequest, unfriend, refresh } = useFriends();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("friends");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [suggested, setSuggested] = useState<any[]>([]);
  const [suggestedLoading, setSuggestedLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user || activeTab !== "suggested") return;
    const loadSuggested = async () => {
      setSuggestedLoading(true);
      // Get friend ids
      // @ts-ignore
      const { data: friendships } = await supabase
        .from("friendships")
        .select("requester_id, recipient_id, status")
        .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`);

      const friendIds = new Set<string>();
      const pendingIds = new Set<string>();
      (friendships ?? []).forEach((f: any) => {
        const fid = f.requester_id === user.id ? f.recipient_id : f.requester_id;
        if (f.status === "accepted") friendIds.add(fid);
        if (f.status === "pending") pendingIds.add(fid);
      });
      friendIds.add(user.id);

      const { data: me } = await supabase.from("profiles").select("city").eq("id", user.id).single();

      const result: any[] = [];
      if (me?.city) {
        const { data: cityPlayers } = await (supabase as any)
          .from("public_profiles")
          .select("id, username, full_name, avatar_url, city")
          .eq("city", me.city)
          .neq("id", user.id)
          .limit(10);
        (cityPlayers ?? []).forEach((p: any) => {
          if (friendIds.has(p.id) || pendingIds.has(p.id)) return;
          result.push({ ...p, reason: `Plays in ${me.city}` });
        });
      }

      // Co-players
      const { data: myMatches } = await supabase
        .from("match_participants")
        .select("match_id")
        .eq("user_id", user.id)
        .eq("status", "active");
      const myMatchIds = (myMatches ?? []).map((m: any) => m.match_id);
      if (myMatchIds.length > 0) {
        const { data: coPlayers } = await supabase
          .from("match_participants")
          .select("user_id")
          .in("match_id", myMatchIds)
          .eq("status", "active")
          .neq("user_id", user.id)
          .limit(30);
        const coIds = [...new Set((coPlayers ?? []).map((p: any) => p.user_id))]
          .filter((id) => !friendIds.has(id) && !pendingIds.has(id));
        if (coIds.length > 0) {
          const { data: coProfiles } = await (supabase as any)
            .from("public_profiles")
            .select("id, username, full_name, avatar_url")
            .in("id", coIds)
            .limit(10);
          (coProfiles ?? []).forEach((profile: any) => {
            if (result.find((r) => r.id === profile.id)) return;
            result.push({ ...profile, reason: "Played together" });
          });
        }
      }

      setSuggested(result.slice(0, 10));
      setSuggestedLoading(false);
    };
    loadSuggested();
  }, [user, activeTab]);

  const handleSearch = async () => {
    if (!searchQuery.trim() || !user) return;
    setSearching(true);
    const { data } = await (supabase as any)
      .from("public_profiles")
      .select("id, username, full_name, avatar_url")
      .or(`username.ilike.%${searchQuery}%,full_name.ilike.%${searchQuery}%`)
      .neq("id", user.id)
      .limit(10);
    setSearchResults(data ?? []);
    setSearching(false);
  };

  const handleSendRequest = async (recipientId: string) => {
    setSendingTo(recipientId);
    // @ts-ignore
    const { error } = await supabase.from("friendships").insert({
      requester_id: user!.id,
      recipient_id: recipientId,
      status: "pending",
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Friend request sent");
      await supabase.from("notifications").insert({
        user_id: recipientId,
        title: "Friend request",
        body: `${user?.user_metadata?.full_name || "Someone"} wants to be friends`,
        type: "system",
        data: { sender_id: user!.id },
      });
      refresh();
    }
    setSendingTo(null);
  };

  const goToProfile = (id: string) => {
    setOpen(false);
    navigate(`/player/${id}`);
  };

  const avatarOrInitial = (p: any) => {
    if (p.avatar_url) {
      return <img src={p.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />;
    }
    const initial = (p.full_name?.[0] || p.username?.[0] || "?").toUpperCase();
    return (
      <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-xs font-bold">
        {initial}
      </div>
    );
  };

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "friends", label: "Friends", count: friends.length },
    { key: "requests", label: "Requests", count: pendingRequests.length || undefined },
    { key: "suggested", label: "Suggested" },
  ];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh] flex flex-col">
        <SheetHeader className="pb-3">
          <SheetTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Friends
          </SheetTitle>
        </SheetHeader>

        {/* Tabs */}
        <div className="flex gap-1 mb-3 p-1 bg-secondary rounded-xl">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex-1 relative text-[11px] font-bold py-2 rounded-lg transition-all ${
                activeTab === t.key ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
              }`}
            >
              {t.label}
              {t.count ? (
                <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-1 rounded-lg bg-primary text-primary-foreground text-[8px] font-bold leading-[14px] text-center">
                  {t.count}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            placeholder="Search players..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="flex-1 rounded-xl bg-secondary px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            onClick={handleSearch}
            disabled={searching}
            className="p-2 rounded-xl bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </button>
        </div>

        {searchResults.length > 0 && (
          <div className="mb-3 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Search results</p>
            {searchResults.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2">
                <button onClick={() => goToProfile(p.id)} className="flex items-center gap-3 text-left">
                  {avatarOrInitial(p)}
                  <div>
                    <p className="text-sm font-semibold">{p.full_name || p.username || "Player"}</p>
                    <p className="text-[11px] text-muted-foreground">@{p.username || "user"}</p>
                  </div>
                </button>
                <button
                  onClick={() => handleSendRequest(p.id)}
                  disabled={sendingTo === p.id}
                  className="p-2 rounded-full bg-primary/8 border border-primary/15 text-primary hover:bg-primary/20 disabled:opacity-50"
                >
                  {sendingTo === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
          {/* FRIENDS TAB */}
          {activeTab === "friends" && (
            <>
              {loading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
              ) : friends.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  <Users className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                  <p className="font-semibold">No friends yet</p>
                  <p className="text-[11px] mt-1">Check Suggested to find players</p>
                </div>
              ) : (
                friends.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => goToProfile(f.id)}
                    className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-secondary/50 rounded-xl px-2 transition-colors"
                  >
                    {avatarOrInitial(f)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{f.full_name || f.username || "Player"}</p>
                      <p className="text-[11px] text-muted-foreground truncate">@{f.username || "user"}</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); unfriend(f.id); }}
                      className="p-1.5 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      title="Remove friend"
                    >
                      <UserX className="w-3.5 h-3.5" />
                    </button>
                  </button>
                ))
              )}
            </>
          )}

          {/* REQUESTS TAB */}
          {activeTab === "requests" && (
            <>
              {pendingRequests.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  <UserCheck className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                  <p className="font-semibold">No pending requests</p>
                </div>
              ) : (
                pendingRequests.map((req) => (
                  <div key={req.id} className="flex items-center justify-between py-2 px-2">
                    <button onClick={() => goToProfile(req.requester_id)} className="flex items-center gap-3 text-left">
                      {avatarOrInitial(req.requester)}
                      <div>
                        <p className="text-sm font-semibold">{req.requester?.full_name || req.requester?.username || "Player"}</p>
                        <p className="text-[11px] text-muted-foreground">Wants to be friends</p>
                      </div>
                    </button>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => acceptRequest(req.id)}
                        className="p-2 rounded-full bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"
                      >
                        <UserCheck className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => rejectRequest(req.id)}
                        className="p-2 rounded-full bg-red-500/10 text-red-500 hover:bg-red-500/20"
                      >
                        <UserX className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </>
          )}

          {/* SUGGESTED TAB */}
          {activeTab === "suggested" && (
            <>
              {suggestedLoading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
              ) : suggested.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  <Sparkles className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                  <p className="font-semibold">No suggestions yet</p>
                  <p className="text-[11px] mt-1">Join more matches to discover players</p>
                </div>
              ) : (
                suggested.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-2 px-2">
                    <button onClick={() => goToProfile(p.id)} className="flex items-center gap-3 text-left">
                      {avatarOrInitial(p)}
                      <div>
                        <p className="text-sm font-semibold">{p.full_name || p.username || "Player"}</p>
                        <p className="text-[11px] text-muted-foreground">{p.reason}</p>
                      </div>
                    </button>
                    <button
                      onClick={() => handleSendRequest(p.id)}
                      disabled={sendingTo === p.id}
                      className="p-2 rounded-full bg-primary/8 border border-primary/15 text-primary hover:bg-primary/20 disabled:opacity-50"
                    >
                      {sendingTo === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                    </button>
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
