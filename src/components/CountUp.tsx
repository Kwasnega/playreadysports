import { useEffect, useRef } from "react";

type Props = {
  to: number;
  from?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
};

/** Scroll-triggered animated counter. CSS/rAF-based — no GSAP dependency. */
export const CountUp = ({ to, from = 0, duration = 1.8, prefix = "", suffix = "", decimals = 0, className = "" }: Props) => {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    el.textContent = `${prefix}${from.toFixed(decimals)}${suffix}`;
    if (reduce) {
      el.textContent = `${prefix}${to.toFixed(decimals)}${suffix}`;
      return;
    }

    let raf = 0;
    const runCount = () => {
      const startTime = performance.now();
      const range = to - from;
      const tick = (now: number) => {
        const elapsed = (now - startTime) / 1000;
        const progress = Math.min(elapsed / duration, 1);
        // ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = from + range * eased;
        el.textContent = `${prefix}${current.toFixed(decimals)}${suffix}`;
        if (progress < 1) {
          raf = requestAnimationFrame(tick);
        } else {
          el.textContent = `${prefix}${to.toFixed(decimals)}${suffix}`;
        }
      };
      raf = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          observer.disconnect();
          runCount();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => { observer.disconnect(); cancelAnimationFrame(raf); };
  }, [to, from, duration, prefix, suffix, decimals]);
  return <span ref={ref} className={className}>{`${prefix}${from.toFixed(decimals)}${suffix}`}</span>;
};