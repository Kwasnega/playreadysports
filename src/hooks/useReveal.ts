import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/**
 * Reveals direct children (or [data-reveal] descendants) on scroll-into-view
 * with a soft fade + slide-up + stagger. Honors prefers-reduced-motion.
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
    const targets = opts?.selector
      ? el.querySelectorAll<HTMLElement>(opts.selector)
      : (el.children as unknown as HTMLElement[]);
    if (!targets || (targets as ArrayLike<HTMLElement>).length === 0) return;

    if (reduce) {
      gsap.set(targets, { opacity: 1, y: 0 });
      return;
    }

    const ctx = gsap.context(() => {
      gsap.fromTo(
        targets,
        { opacity: 0, y: opts?.y ?? 18 },
        {
          opacity: 1,
          y: 0,
          duration: opts?.duration ?? 0.7,
          ease: "power3.out",
          stagger: opts?.stagger ?? 0.08,
          delay: opts?.delay ?? 0,
          scrollTrigger: { trigger: el, start: "top 85%", once: true },
        },
      );
    }, el);
    return () => ctx.revert();
  }, [opts?.selector, opts?.y, opts?.stagger, opts?.duration, opts?.delay]);
  return ref;
}

/** One-shot enter animation (no scroll trigger). */
export function useEnter<T extends HTMLElement = HTMLElement>(opts?: { y?: number; delay?: number }) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce) return;
    const ctx = gsap.context(() => {
      gsap.from(el, {
        opacity: 0,
        y: opts?.y ?? 24,
        duration: 0.9,
        ease: "expo.out",
        delay: opts?.delay ?? 0,
      });
    }, el);
    return () => ctx.revert();
  }, [opts?.delay, opts?.y]);
  return ref;
}