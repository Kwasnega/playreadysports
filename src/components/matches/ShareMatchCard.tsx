import { useRef, useState, useCallback } from "react";
import html2canvas from "html2canvas";
import { X, Copy, Share2, MessageCircle, Download, Check } from "lucide-react";
import { toast } from "sonner";

/* ------------------------------------------------------------
   ShareMatchCard — renders a visual match card off-screen,
   captures it with html2canvas, and offers share options.
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
  const cardRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  const generate = useCallback(async () => {
    if (!cardRef.current || blobUrl) return;
    setGenerating(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        scale: 3,
        backgroundColor: null,
        logging: false,
      });
      canvas.toBlob((b) => {
        if (b) {
          const url = URL.createObjectURL(b);
          setBlobUrl(url);
        }
        setGenerating(false);
      }, "image/png");
    } catch (err) {
      console.error("html2canvas error:", err);
      toast.error("Failed to generate image");
      setGenerating(false);
    }
  }, [blobUrl]);

  if (open && !blobUrl && !generating) {
    // Auto-generate when opened
    setTimeout(generate, 100);
  }

  const shareImage = async () => {
    if (!blobUrl) return;
    const res = await fetch(blobUrl);
    const blob = await res.blob();
    const file = new File([blob], `match-${data.joinCode}.png`, { type: "image/png" });

    const shareData: any = {
      title: `⚽ ${data.venueName}`,
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

  const whatsappText = encodeURIComponent(
    `⚽ Football at ${data.venueName}\n` +
    `Time: ${data.matchDate} · ${data.format} · ${data.mode === "gala" ? "Gala" : "Two-team"}\n` +
    `Entry: ${data.entryFee > 0 ? `₵${data.entryFee}/player` : "Free"}\n\n` +
    `Join code: ${data.joinCode}\n` +
    `${window.location.origin}/lobby/${data.joinCode}`
  );

  const spotsLabel = data.spotsLeft <= 0 ? "Full" : `${data.spotsLeft} spot${data.spotsLeft === 1 ? "" : "s"} left`;
  const feeLabel = data.entryFee > 0 ? `₵${data.entryFee}/player` : "Free";

  if (!open) return null;

  return (
    <>
      {/* Off-screen card for capture */}
      <div
        ref={cardRef}
        style={{
          position: "fixed",
          left: "-9999px",
          top: "-9999px",
          width: "400px",
          minHeight: "540px",
          padding: "36px 32px",
          background: "#0f172a",
          color: "#fff",
          fontFamily: "system-ui, -apple-system, sans-serif",
          borderRadius: "24px",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0px",
        }}
      >
        {/* Logo */}
        <p style={{
          fontSize: "11px",
          fontWeight: 700,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          color: "#94a3b8",
          margin: "0 0 18px",
          textAlign: "center",
          width: "100%",
        }}>
          PlayReadySports
        </p>

        {/* Football emoji */}
        <div style={{
          fontSize: "56px",
          lineHeight: "56px",
          margin: "0 0 18px",
          textAlign: "center",
          width: "100%",
        }}>
          ⚽
        </div>

        {/* Venue */}
        <p style={{
          fontSize: "22px",
          fontWeight: 800,
          textAlign: "center",
          margin: "0 0 6px",
          lineHeight: 1.2,
          width: "100%",
        }}>
          {data.venueName}
        </p>

        {/* Date/time */}
        <p style={{
          fontSize: "14px",
          textAlign: "center",
          color: "#cbd5e1",
          margin: "0 0 14px",
          width: "100%",
        }}>
          {data.matchDate}
        </p>

        {/* Format badge */}
        <span style={{
          display: "inline-block",
          fontSize: "11px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          background: "#1e293b",
          color: "#e2e8f0",
          padding: "6px 14px",
          borderRadius: "999px",
          margin: "0 0 12px",
        }}>
          {data.format} · {data.mode === "gala" ? "Gala" : "Two-team"}
        </span>

        {/* Area — show city only, not redundant venue name */}
        <p style={{
          fontSize: "12px",
          textAlign: "center",
          color: "#94a3b8",
          margin: "0 0 10px",
          width: "100%",
        }}>
          {data.venueCity || "Accra"}
        </p>

        {/* Entry fee */}
        <p style={{
          fontSize: "13px",
          textAlign: "center",
          color: "#cbd5e1",
          margin: "0 0 22px",
          fontWeight: 600,
          width: "100%",
        }}>
          {feeLabel}
        </p>

        {/* Join code */}
        <div style={{
          width: "100%",
          background: "#1e293b",
          borderRadius: "16px",
          padding: "12px 16px 10px",
          textAlign: "center",
          margin: "0 0 14px",
          border: "1.5px dashed #475569",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          boxSizing: "border-box",
          overflow: "hidden",
        }}>
          <p style={{
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#94a3b8",
            margin: "0 0 4px",
            lineHeight: 1,
          }}>
            Join code
          </p>
          <p style={{
            fontSize: "26px",
            fontWeight: 800,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            letterSpacing: "0.04em",
            color: "#f8fafc",
            margin: 0,
            lineHeight: 1.1,
            maxWidth: "100%",
            overflowWrap: "break-word",
            wordWrap: "break-word",
            textAlign: "center",
          }}>
            {data.joinCode}
          </p>
        </div>

        {/* Spots */}
        <p style={{
          fontSize: "13px",
          fontWeight: 700,
          textAlign: "center",
          color: data.spotsLeft <= 2 ? "#fbbf24" : "#94a3b8",
          margin: "0 0 22px",
          width: "100%",
        }}>
          {spotsLabel}
        </p>

        {/* Footer */}
        <p style={{
          fontSize: "10px",
          textAlign: "center",
          color: "#64748b",
          margin: 0,
          letterSpacing: "0.05em",
          width: "100%",
        }}>
          playreadysports.com
        </p>
      </div>

      {/* Modal overlay */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div className="bg-card rounded-3xl p-6 w-full max-w-sm space-y-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-lg">Share match</h2>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-secondary">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Preview */}
          <div className="rounded-2xl overflow-hidden border border-border/60">
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
              className="w-full h-12 rounded-full bg-foreground text-background text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.99]"
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
                  <Check className="w-4 h-4 text-success" /> Copied
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" /> Copy code
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// Inline check icon for copy feedback
function Check({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
