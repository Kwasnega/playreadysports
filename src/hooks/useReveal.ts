import { useEffect, useRef } from "react";

/**
 * Reveals direct children (or [data-reveal] descendants) on scroll-into-view
 * with a soft fade + slide-up + stagger. Honors prefers-reduced-motion.
 * CSS-based — no GSAP dependency.
 */
export function useReveal<T extends HTMLElement = HTMLElement>(opts?: {
  selector?: string;
  y?: number;
  stagger?: number;
  duration?: number;
  delay?: number;
}) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

    const targets: HTMLElement[] = opts?.selector
      ? Array.from(el.querySelectorAll<HTMLElement>(opts.selector))
      : Array.from(el.children as HTMLCollectionOf<HTMLElement>);

    if (!targets.length) return;

    if (reduce) return;

    const y = opts?.y ?? 18;
    const duration = opts?.duration ?? 0.7;
    const stagger = opts?.stagger ?? 0.08;
    const delay = opts?.delay ?? 0;

    targets.forEach((t, i) => {
      t.style.opacity = "0";
      t.style.transform = `translateY(${y}px)`;
      t.style.transition = `opacity ${duration}s ease, transform ${duration}s ease`;
      t.style.transitionDelay = `${delay + i * stagger}s`;
    });

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          targets.forEach((t) => {
            t.style.opacity = "1";
            t.style.transform = "translateY(0)";
          });
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [opts?.selector, opts?.y, opts?.stagger, opts?.duration, opts?.delay]);
  return ref;
}

/** One-shot enter animation (no scroll trigger). CSS-based. */
export function useEnter<T extends HTMLElement = HTMLElement>(opts?: { y?: number; delay?: number }) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce) return;
    const y = opts?.y ?? 24;
    const delay = opts?.delay ?? 0;
    el.style.opacity = "0";
    el.style.transform = `translateY(${y}px)`;
    const raf = requestAnimationFrame(() => {
      el.style.transition = `opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1)`;
      el.style.transitionDelay = `${delay}s`;
      el.style.opacity = "1";
      el.style.transform = "translateY(0)";
    });
    return () => cancelAnimationFrame(raf);
  }, [opts?.delay, opts?.y]);
  return ref;
}