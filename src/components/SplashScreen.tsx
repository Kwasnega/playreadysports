import { useEffect, useState } from "react";
import logo from "@/assets/playready-logo.jpg";

export const SplashScreen = ({ onDone }: { onDone: () => void }) => {
  const [phase, setPhase] = useState<"enter" | "lit" | "exit">("enter");

  useEffect(() => {
    // Smooth phase transitions using rAF so the first paint is dim, then fades in
    const r = requestAnimationFrame(() => {
      requestAnimationFrame(() => setPhase("lit"));
    });
    const t1 = setTimeout(() => setPhase("exit"), 1400);
    const t2 = setTimeout(() => onDone(), 2000);
    return () => {
      cancelAnimationFrame(r);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [onDone]);

  const lit = phase === "lit";
  const exiting = phase === "exit";

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black"
      style={{
        opacity: exiting ? 0 : 1,
        transition: "opacity 600ms cubic-bezier(0.22, 1, 0.36, 1)",
        pointerEvents: exiting ? "none" : "auto",
        willChange: "opacity",
      }}
      aria-hidden={exiting}
    >
      <div
        className="flex flex-col items-center gap-6"
        style={{
          transform: exiting ? "scale(1.04)" : lit ? "scale(1)" : "scale(0.985)",
          transition: "transform 1200ms cubic-bezier(0.22, 1, 0.36, 1)",
          willChange: "transform",
        }}
      >
        <img
          src={logo}
          alt="PlayReady Logo"
          width={180}
          height={180}
          className="w-32 h-32 sm:w-40 sm:h-40 object-contain select-none"
          style={{
            filter: `invert(1) brightness(${lit ? 1 : 0.4})`,
            opacity: lit ? 1 : 0.85,
            transition:
              "filter 1100ms cubic-bezier(0.22, 1, 0.36, 1), opacity 800ms ease-out",
            willChange: "filter, opacity",
          }}
          draggable={false}
        />
        <div
          className="text-2xl sm:text-3xl font-bold tracking-[0.2em] select-none text-center"
          style={{
            color: lit ? "white" : "rgb(110, 110, 110)",
            transition: "color 1100ms cubic-bezier(0.22, 1, 0.36, 1)",
            willChange: "color",
          }}
        >
          PLAYREADY
          <div className="text-sm tracking-[0.4em] mt-1">SPORTS</div>
        </div>
      </div>
    </div>
  );
};
