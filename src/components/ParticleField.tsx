import { useEffect, useRef } from "react";

/**
 * Canvas 2D particle field for the hero background.
 * Replaces the Three.js implementation — same visual, ~50 KB smaller bundle.
 * - 140 points, soft cursor parallax
 * - Pauses when offscreen (IntersectionObserver) and on tab blur
 * - DPR clamped to 1.5 for perf
 */
export const ParticleField = ({ className = "" }: { className?: string }) => {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;";
    wrap.appendChild(canvas);
    const ctx = canvas.getContext("2d")!;

    // Read brand cyan from CSS
    const cssCyan = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "187 100% 50%";
    const color = `hsl(${cssCyan.split(/\s+/).join(", ")})`;

    const COUNT = 140;
    interface Particle { x: number; y: number; z: number; vx: number; vy: number }
    const particles: Particle[] = Array.from({ length: COUNT }, () => ({
      x: (Math.random() - 0.5) * 2,
      y: (Math.random() - 0.5) * 2,
      z: Math.random(),
      vx: (Math.random() - 0.5) * 0.0002,
      vy: (Math.random() - 0.5) * 0.0002,
    }));

    let W = 0, H = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 1.5);
      W = wrap.clientWidth; H = wrap.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const mouse = { x: 0, y: 0 };
    const smooth = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => {
      const r = wrap.getBoundingClientRect();
      mouse.x = (e.clientX - r.left) / r.width - 0.5;
      mouse.y = (e.clientY - r.top) / r.height - 0.5;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    let visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.01 });
    io.observe(wrap);

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!visible || document.hidden) return;

      smooth.x += (mouse.x - smooth.x) * 0.04;
      smooth.y += (mouse.y - smooth.y) * 0.04;

      ctx.clearRect(0, 0, W, H);

      for (const p of particles) {
        if (!reduce) { p.x += p.vx; p.y += p.vy; }
        // Wrap around
        if (p.x > 1) p.x -= 2; if (p.x < -1) p.x += 2;
        if (p.y > 1) p.y -= 2; if (p.y < -1) p.y += 2;

        const sx = (p.x + smooth.x * 0.6) * W * 0.5 + W * 0.5;
        const sy = (p.y + smooth.y * 0.4) * H * 0.5 + H * 0.5;
        const radius = (0.5 + p.z * 1.5) * 1.5;
        const alpha = 0.3 + p.z * 0.45;

        ctx.beginPath();
        ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx.fillStyle = color.replace("hsl(", `hsla(`).replace(")", `, ${alpha})`);
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      ro.disconnect();
      io.disconnect();
      canvas.remove();
    };
  }, []);

  return <div ref={wrapRef} className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`} aria-hidden />;
};