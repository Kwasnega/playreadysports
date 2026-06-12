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
      c.fillStyle = spotsLeft <= 2 ? "#fbbf24" : "#94a3b8";
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
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div className="bg-card rounded-xl p-6 w-full max-w-sm space-y-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-lg">Share match</h2>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-secondary">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Preview */}
          <div className="rounded-xl overflow-hidden border border-border">
            {generating ? (
              <div className="aspect-[4/5] bg-secondary flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />
              </div>
            ) : blobUrl ? (
              <img src={blobUrl} alt="Match card" className="w-full h-auto" />
            ) : (
              <div className="aspect-[4/5] bg-secondary flex items-center justify-center text-sm text-muted-foreground">
                Generating…
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="space-y-2.5">
            {/* WhatsApp */}
            <a
              href={`https://wa.me/?text=${whatsappText}`}
              target="_blank"
              rel="noreferrer"
              className="w-full h-12 rounded-full bg-[#25D366] text-white text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.99] transition-transform"
            >
              <MessageCircle className="w-5 h-5" />
              Share on WhatsApp
            </a>

            {/* Share image */}
            <button
              onClick={shareImage}
              disabled={generating || !blobUrl}
              className="w-full h-12 rounded-lg bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.99]"
            >
              {navigator.canShare ? (
                <>
                  <Share2 className="w-4 h-4" /> Share image
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" /> Download image
                </>
              )}
            </button>

            {/* Copy code */}
            <button
              onClick={copyCode}
              className="w-full h-12 rounded-full bg-secondary text-foreground text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.99]"
            >
              {copied ? (
                <>
                  <CheckCheck className="w-4 h-4 text-success" /> Copied
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" /> Copy code
                </>
              )}
            </button>

            {/* Invite friends toggle */}
            {user && (
              <div className="pt-2 border-t border-border">
                <button
                  onClick={() => setShowFriends((s) => !s)}
                  className="w-full flex items-center justify-between py-2 text-sm font-semibold"
                >
                  <span className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Invite friends
                  </span>
                  <span className="text-xs text-muted-foreground">{friends.length} friends</span>
                </button>

                {showFriends && (
                  <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
                    {friendsLoading ? (
                      <div className="py-4 flex items-center justify-center">
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      </div>
                    ) : friends.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2">No friends yet</p>
                    ) : (
                      friends.map((f: any) => (
                        <div key={f.id} className="flex items-center justify-between py-1.5">
                          <div className="flex items-center gap-2">
                            {f.avatar_url ? (
                              <img src={f.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold">
                                {(f.full_name?.[0] || f.username?.[0] || "?").toUpperCase()}
                              </div>
                            )}
                            <span className="text-xs font-medium">{f.full_name || f.username || "Friend"}</span>
                          </div>
                          <button
                            onClick={() => sendInvite(f.id)}
                            disabled={sendingTo === f.id}
                            className="p-1.5 rounded-full bg-primary/8 border border-primary/15 text-primary hover:bg-primary/20 disabled:opacity-50"
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
