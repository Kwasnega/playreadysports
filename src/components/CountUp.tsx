import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

type Props = {
  to: number;
  from?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
};

/** Scroll-triggered animated counter with a brief scale pulse. */
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
    const obj = { v: from };
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: "top 90%", once: true } });
      tl.to(obj, {
        v: to,
        duration,
        ease: "power2.out",
        onUpdate: () => { el.textContent = `${prefix}${obj.v.toFixed(decimals)}${suffix}`; },
      })
        .fromTo(el, { scale: 0.92 }, { scale: 1, duration: 0.6, ease: "power3.out" }, 0)
        .fromTo(
          el,
          { textShadow: "0 0 0 rgba(0, 229, 255, 0)" },
          { textShadow: "0 0 18px rgba(0, 229, 255, 0.45)", duration: 0.8, yoyo: true, repeat: 1 },
          0,
        );
    }, el);
    return () => ctx.revert();
  }, [to, from, duration, prefix, suffix, decimals]);
  return <span ref={ref} className={className}>{`${prefix}${from.toFixed(decimals)}${suffix}`}</span>;
};