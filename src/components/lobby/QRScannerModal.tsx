/**
 * QRScannerModal — self-contained camera QR scanner.
 *
 * FIX: Issue 2 - Complete rewrite of the QR scanner to fix:
 *   1. videoRef.current === null race: the old code called startScan() from Lobby.tsx
 *      and immediately checked videoRef.current, but the <video> element only appeared in
 *      the DOM after scanning state was set to true — so the ref was always null and the
 *      camera never opened.
 *   2. BarcodeDetector is Chrome-only. iOS Safari and Firefox don't support it, so the
 *      scan loop ran forever with zero detections on those platforms.
 *   3. No loading indicator, no visible scan frame animation, no fallback UI on deny.
 *
 * Solution: self-contained modal that owns its own <video> ref + lifecycle. The stream
 * starts inside a useEffect that fires AFTER the video element is mounted, guaranteeing
 * the ref is populated. Uses jsqr (pure-JS, all browsers) via canvas getImageData.
 */

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, X, Loader2, AlertCircle, KeyRound } from "lucide-react";

type ScannerState = "initialising" | "active" | "denied" | "unsupported";

interface QRScannerModalProps {
  /** Called with the raw QR string value once a code is successfully decoded. */
  onScan: (value: string) => void;
  /** Called when the user dismisses the modal without a successful scan. */
  onClose: () => void;
}

export const QRScannerModal = ({ onScan, onClose }: QRScannerModalProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [scanState, setScanState] = useState<ScannerState>("initialising");
  const [scanned, setScanned] = useState(false); // prevent double-fire

  // FIX: Issue 2 - Start camera stream inside useEffect so videoRef.current is
  // guaranteed to be a mounted DOM element before we access it.
  useEffect(() => {
    let cancelled = false;

    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setScanState("unsupported");
        return;
      }

      try {
        // Request rear-facing camera first; fall back to any camera.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        const video = videoRef.current;
        if (!video) return;

        video.srcObject = stream;
        // playsInline + muted are required for iOS Safari autoplay policy
        video.playsInline = true;
        video.muted = true;

        await video.play();
        setScanState("active");

        // Start the decode loop
        const decode = () => {
          if (cancelled) return;
          const canvas = canvasRef.current;
          const ctx = canvas?.getContext("2d", { willReadFrequently: true });
          if (!canvas || !ctx || !video || video.readyState < 2) {
            rafRef.current = requestAnimationFrame(decode);
            return;
          }

          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

          // FIX: Issue 2 - jsqr works on ALL browsers (iOS Safari, Firefox, all Chromium)
          // unlike BarcodeDetector which is Chrome-only.
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
          });

          if (code?.data && !cancelled) {
            setScanned(true);
            // Haptic feedback (works on mobile browsers that support vibration API)
            try { navigator.vibrate?.(100); } catch {}
            stopCamera();
            onScan(code.data);
            return;
          }

          rafRef.current = requestAnimationFrame(decode);
        };

        rafRef.current = requestAnimationFrame(decode);
      } catch (err: any) {
        if (cancelled) return;
        const isDenied =
          err?.name === "NotAllowedError" ||
          err?.name === "PermissionDeniedError";
        setScanState(isDenied ? "denied" : "unsupported");
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopCamera = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  return (
    /* FIX: Issue 2 - Full-screen modal overlay so the video element is always in the
       DOM when the useEffect fires — no conditional render gate that would keep the ref null. */
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label="QR code scanner"
    >
      {/* Header */}
      <div className="relative flex items-center justify-center h-14 px-4 shrink-0">
        <p className="text-white text-[11px] font-black uppercase tracking-widest">
          Scan Venue QR Code
        </p>
        <button
          onClick={handleClose}
          aria-label="Close scanner"
          className="absolute right-4 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/10 flex items-center justify-center"
        >
          <X className="w-4 h-4 text-white" />
        </button>
      </div>

      {/* Scanner viewport */}
      <div className="relative flex-1 overflow-hidden">
        {/* Video is always rendered so useEffect ref access is guaranteed */}
        <video
          ref={videoRef}
          className={`w-full h-full object-cover ${scanState !== "active" ? "opacity-0" : "opacity-100"}`}
          playsInline
          muted
          autoPlay
        />

        {/* Hidden canvas used by jsqr for pixel decoding */}
        <canvas ref={canvasRef} className="hidden" aria-hidden="true" />

        {/* FIX: Issue 2 - Loading state while camera initialises */}
        {scanState === "initialising" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black">
            <Loader2 className="w-10 h-10 text-white animate-spin" />
            <p className="text-white/70 text-sm font-medium">Opening camera…</p>
          </div>
        )}

        {/* FIX: Issue 2 - Denied / unsupported fallback instead of raw toast error */}
        {(scanState === "denied" || scanState === "unsupported") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-black px-8 text-center">
            <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-red-400" />
            </div>
            <div>
              <p className="text-white font-bold text-base mb-2">
                {scanState === "denied" ? "Camera Access Denied" : "Camera Unavailable"}
              </p>
              <p className="text-white/60 text-sm leading-relaxed">
                {scanState === "denied"
                  ? "Please allow camera access in your browser settings and try again."
                  : "Your browser does not support camera access. Use manual code entry below."}
              </p>
            </div>
            <button
              onClick={handleClose}
              className="mt-2 inline-flex items-center gap-2 bg-white text-black rounded-full px-5 py-2.5 text-sm font-black uppercase tracking-widest"
            >
              <KeyRound className="w-4 h-4" />
              Use Manual Code
            </button>
          </div>
        )}

        {/* FIX: Issue 2 - Animated scan frame so users know where to point the camera */}
        {scanState === "active" && !scanned && (
          <>
            {/* Dark vignette corners */}
            <div className="absolute inset-0 pointer-events-none">
              {/* Top-left */}
              <div className="absolute top-0 left-0 right-0 h-[20%] bg-black/40" />
              <div className="absolute bottom-0 left-0 right-0 h-[20%] bg-black/40" />
              <div className="absolute top-[20%] bottom-[20%] left-0 w-[10%] bg-black/40" />
              <div className="absolute top-[20%] bottom-[20%] right-0 w-[10%] bg-black/40" />
            </div>

            {/* Scan box */}
            <div
              className="absolute"
              style={{ top: "20%", left: "10%", right: "10%", bottom: "20%" }}
            >
              {/* Corner brackets */}
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-lg" />

              {/* Animated scan line */}
              <div className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-green-400 to-transparent animate-scan-line" />
            </div>

            <p className="absolute bottom-6 left-0 right-0 text-center text-white/70 text-[11px] font-bold uppercase tracking-widest">
              Point at the venue QR code
            </p>
          </>
        )}

        {/* Success flash */}
        {scanned && (
          <div className="absolute inset-0 bg-green-500/30 flex items-center justify-center">
            <div className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center animate-ping-once">
              <Camera className="w-10 h-10 text-white" />
            </div>
          </div>
        )}
      </div>

      {/* Footer hint */}
      {scanState === "active" && (
        <div className="shrink-0 px-5 py-4 text-center">
          <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">
            Camera auto-detects · No button needed
          </p>
        </div>
      )}
    </div>
  );
};

export default QRScannerModal;
