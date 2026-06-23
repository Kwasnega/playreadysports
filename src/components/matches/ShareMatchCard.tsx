import { useState, useCallback, useEffect } from "react";
import { X, Copy, Share2, MessageCircle, Download, CheckCheck, Users, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useFriends } from "@/hooks/useFriends";
import { supabase } from "@/integrations/supabase/client";

/* ------------------------------------------------------------
   ShareMatchCard — generates a match card via Canvas 2D API,
   and offers share options. No external dependencies.
   ------------------------------------------------------------ */

export type ShareMatchData = {
  joinCode: string;
  venueName: string;
  venueCity: string;
  matchDate: string;
  format: string;
  mode: string;
  entryFee: number;
  spotsLeft: number;
};

export function ShareMatchCard({
  open,
  onClose,
  data,
}: {
  open: boolean;
  onClose: () => void;
  data: ShareMatchData;
}) {
  const { user } = useAuth();
  const { friends, loading: friendsLoading } = useFriends();
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [showFriends, setShowFriends] = useState(false);

  const generate = useCallback(() => {
    if (blobUrl) return;
    setGenerating(true);
    try {
      const SCALE = 3;
      const W = 400 * SCALE, H = 540 * SCALE;
      const canvas = document.createElement("canvas");
      canvas.width = W; canvas.height = H;
      const c = canvas.getContext("2d")!;
      c.scale(SCALE, SCALE);

      // Background
      c.fillStyle = "#0f172a";
      const r = 24;
      c.beginPath();
      c.moveTo(r, 0); c.lineTo(400 - r, 0); c.arcTo(400, 0, 400, r, r);
      c.lineTo(400, 540 - r); c.arcTo(400, 540, 400 - r, 540, r);
      c.lineTo(r, 540); c.arcTo(0, 540, 0, 540 - r, r);
      c.lineTo(0, r); c.arcTo(0, 0, r, 0, r); c.closePath(); c.fill();

      const cx = 200;
      let y = 36;

      // Brand label
      c.font = "700 11px system-ui, sans-serif";
      c.fillStyle = "#94a3b8"; c.textAlign = "center"; c.letterSpacing = "0.15em";
      c.fillText("PLAYREADYSPORTS", cx, y); y += 44;

      // Icon
      c.save();
      c.translate(cx - 26, y - 40);
      c.scale(52/24, 52/24);
      c.strokeStyle = "#f8fafc";
      c.lineWidth = 2;
      c.lineCap = "round";
      c.lineJoin = "round";
      const paths = [
        "M6 9H4.5a2.5 2.5 0 0 1 0-5H6",
        "M18 9h1.5a2.5 2.5 0 0 0 0-5H18",
        "M4 22h16",
        "M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22",
        "M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22",
        "M18 2H6v7a6 6 0 0 0 12 0V2Z"
      ];
      paths.forEach(p => c.stroke(new Path2D(p)));
      c.restore();
      y += 30;

      // Venue
      c.font = "800 22px system-ui, sans-serif"; c.fillStyle = "#f8fafc";
      c.fillText(data.venueName.slice(0, 28), cx, y); y += 28;

      // Date
      c.font = "400 14px system-ui, sans-serif"; c.fillStyle = "#cbd5e1";
      c.fillText(data.matchDate, cx, y); y += 22;

      // Format badge
      const badgeText = `${data.format} \xB7 ${data.mode === "gala" ? "Gala" : "Two-team"}`;
      c.font = "700 11px system-ui, sans-serif"; c.fillStyle = "#e2e8f0";
      const bw = c.measureText(badgeText).width + 28;
      c.fillStyle = "#1e293b";
      c.beginPath();
      const bx = cx - bw / 2, by = y;
      c.roundRect(bx, by, bw, 24, 12); c.fill();
      c.font = "700 11px system-ui, sans-serif"; c.fillStyle = "#e2e8f0"; c.textAlign = "center";
      c.fillText(badgeText, cx, y + 16); y += 36;

      // City
      c.font = "400 12px system-ui, sans-serif"; c.fillStyle = "#94a3b8";
      c.fillText(data.venueCity || "Accra", cx, y); y += 22;

      // Fee
      c.font = "600 13px system-ui, sans-serif"; c.fillStyle = "#cbd5e1";
      c.fillText(data.entryFee > 0 ? `\u20B5${data.entryFee}/player` : "Free", cx, y); y += 32;

      // Join code box
      c.fillStyle = "#1e293b";
      c.beginPath(); c.roundRect(28, y, 344, 68, 16); c.fill();
      c.strokeStyle = "#475569"; c.lineWidth = 1.5;
      c.setLineDash([6, 4]);
      c.beginPath(); c.roundRect(28, y, 344, 68, 16); c.stroke();
      c.setLineDash([]);
      c.font = "700 10px system-ui, sans-serif"; c.fillStyle = "#94a3b8";
      c.fillText("JOIN CODE", cx, y + 20);
      c.font = `800 ${data.joinCode.length > 8 ? 20 : 26}px ui-monospace, monospace`; c.fillStyle = "#f8fafc";
      c.fillText(data.joinCode, cx, y + 50); y += 84;

      // Spots
      const spotsLeft = data.spotsLeft;
      c.font = "700 13px system-ui, sans-serif";
      c.fillStyle = spotsLeft <= 2 ? "#e2e8f0" : "#94a3b8";
      const sl = spotsLeft <= 0 ? "Full" : `${spotsLeft} spot${spotsLeft === 1 ? "" : "s"} left`;
      c.fillText(sl, cx, y); y += 40;

      // Footer
      c.font = "400 10px system-ui, sans-serif"; c.fillStyle = "#64748b";
      c.fillText("joinplayready.com", cx, y);

      canvas.toBlob((b) => {
        if (b) setBlobUrl(URL.createObjectURL(b));
        setGenerating(false);
      }, "image/png");
    } catch (err) {
      toast.error("Failed to generate image");
      setGenerating(false);
    }
  }, [blobUrl, data]);

  if (open && !blobUrl && !generating) {
    // Auto-generate when opened
    setTimeout(generate, 100);
  }

  const sendInvite = async (friendId: string) => {
    if (!user) return;
    setSendingTo(friendId);
    const senderName = user.user_metadata?.full_name || user.email?.split("@")[0] || "Someone";
    const { error } = await (supabase as any).from("notifications").insert({
      user_id: friendId,
      title: `Match invite from ${senderName}`,
      body: `${data.venueName} · ${data.format} · ${data.matchDate}`,
      type: "match_share",
      data: { join_code: data.joinCode },
    });
    if (error) {
      toast.error("Failed to send invite");
    } else {
      toast.success("Invite sent");
    }
    setSendingTo(null);
  };

  const shareImage = async () => {
    if (!blobUrl) return;
    const res = await fetch(blobUrl);
    const blob = await res.blob();
    const file = new File([blob], `match-${data.joinCode}.png`, { type: "image/png" });

    const shareData: any = {
      title: data.venueName,
      text: `${data.format} · ${data.matchDate}\nCode: ${data.joinCode}\nPlayReadySports`,
      files: [file],
    };

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // User cancelled or failed — fall through to download
      }
    }

    // Desktop fallback: trigger download
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `match-${data.joinCode}.png`;
    a.click();
    toast.success("Image downloaded");
  };

  const copyCode = () => {
    navigator.clipboard.writeText(data.joinCode);
    setCopied(true);
    toast.success(`Code ${data.joinCode} copied`);
    setTimeout(() => setCopied(false), 2000);
  };

  const matchUrl = `https://joinplayready.com/lobby/${data.joinCode}`;
  const whatsappText = encodeURIComponent(
    `Football at ${data.venueName}\n` +
    `Time: ${data.matchDate} · ${data.format} · ${data.mode === "gala" ? "Gala" : "Two-team"}\n` +
    `Entry: ${data.entryFee > 0 ? `₵${data.entryFee}/player` : "Free"}\n\n` +
    `Join code: ${data.joinCode}\n` +
    matchUrl
  );

  if (!open) return null;

  return (
    <>
      {/* Modal overlay */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300"
        onClick={onClose}
      >
        <div
          className="bg-card/95 backdrop-blur-xl border border-white/10 dark:border-white/5 rounded-[24px] p-6 w-full max-w-sm space-y-6 shadow-[0_0_40px_rgba(0,0,0,0.15)] animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-xl tracking-tight">Share match</h2>
            <button
              onClick={onClose}
              className="p-2 rounded-full bg-secondary/50 hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Preview */}
          <div className="relative rounded-2xl overflow-hidden border border-border/50 shadow-inner group">
            <div className="absolute inset-0 bg-gradient-to-tr from-black/5 to-transparent pointer-events-none z-10" />
            {generating ? (
              <div className="aspect-[4/5] bg-secondary/30 flex flex-col gap-3 items-center justify-center">
                <div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
                <span className="text-xs font-semibold text-muted-foreground animate-pulse">Designing card...</span>
              </div>
            ) : blobUrl ? (
              <img
                src={blobUrl}
                alt="Match card"
                className="w-full h-auto transform transition-transform duration-700 group-hover:scale-105"
              />
            ) : (
              <div className="aspect-[4/5] bg-secondary/30 flex items-center justify-center text-sm text-muted-foreground">
                Waiting...
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="space-y-3">
            {/* WhatsApp */}
            <a
              href={`https://wa.me/?text=${whatsappText}`}
              target="_blank"
              rel="noreferrer"
              className="w-full h-12 rounded-xl bg-foreground text-background text-sm font-bold flex items-center justify-center gap-2.5 shadow-lg shadow-foreground/10 hover:-translate-y-0.5 active:scale-[0.98] transition-all"
            >
              <MessageCircle className="w-5 h-5" />
              Share on WhatsApp
            </a>

            <div className="grid grid-cols-2 gap-3">
              {/* Share image */}
              <button
                onClick={shareImage}
                disabled={generating || !blobUrl}
                className="h-12 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-primary-hover hover:shadow-md active:scale-[0.98] transition-all"
              >
                {navigator.canShare ? (
                  <>
                    <Share2 className="w-4 h-4" /> Share
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" /> Save
                  </>
                )}
              </button>

              {/* Copy code */}
              <button
                onClick={copyCode}
                className="h-12 rounded-xl bg-secondary text-foreground text-sm font-semibold flex items-center justify-center gap-2 hover:bg-secondary/80 active:scale-[0.98] transition-all"
              >
                {copied ? (
                  <>
                    <CheckCheck className="w-4 h-4 text-success" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" /> Copy Code
                  </>
                )}
              </button>
            </div>

            {/* Invite friends toggle */}
            {user && (
              <div className="pt-3">
                <button
                  onClick={() => setShowFriends((s) => !s)}
                  className="w-full flex items-center justify-between p-3 rounded-xl border border-border/50 bg-secondary/20 hover:bg-secondary/40 transition-colors"
                >
                  <span className="flex items-center gap-2.5 text-sm font-semibold">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                      <Users className="w-3.5 h-3.5" />
                    </div>
                    Invite friends
                  </span>
                  <span className="text-xs font-medium text-muted-foreground bg-secondary px-2 py-1 rounded-full">
                    {friends.length}
                  </span>
                </button>

                {showFriends && (
                  <div className="mt-2 max-h-48 overflow-y-auto space-y-1.5 scrollbar-none animate-in slide-in-from-top-2 fade-in duration-200">
                    {friendsLoading ? (
                      <div className="py-6 flex flex-col items-center justify-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/60" />
                        <span className="text-xs text-muted-foreground font-medium">Loading friends...</span>
                      </div>
                    ) : friends.length === 0 ? (
                      <p className="text-xs text-center text-muted-foreground py-4 bg-secondary/20 rounded-xl border border-border/50">
                        No friends yet
                      </p>
                    ) : (
                      friends.map((f: any) => (
                        <div key={f.id} className="flex items-center justify-between p-2 rounded-xl hover:bg-secondary/30 transition-colors border border-transparent hover:border-border/50">
                          <div className="flex items-center gap-3">
                            {f.avatar_url ? (
                              <img src={f.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover ring-2 ring-background shadow-sm" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-xs font-bold text-primary ring-2 ring-background shadow-sm">
                                {(f.full_name?.[0] || f.username?.[0] || "?").toUpperCase()}
                              </div>
                            )}
                            <span className="text-sm font-semibold">{f.full_name || f.username || "Friend"}</span>
                          </div>
                          <button
                            onClick={() => sendInvite(f.id)}
                            disabled={sendingTo === f.id}
                            className="p-2 rounded-full bg-primary text-primary-foreground hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 transition-all shadow-sm"
                          >
                            {sendingTo === f.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Send className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
