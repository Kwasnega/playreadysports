import p1 from "@/assets/p1.jpg";
import p2 from "@/assets/p2.jpg";
import p3 from "@/assets/p3.jpg";
import heroPlayer from "@/assets/hero-player.jpg";
import { Plus } from "lucide-react";

const stories = [
  { name: "Your story", img: heroPlayer, isYou: true },
  { name: "Kofi A.", img: p1, live: true },
  { name: "Ama M.", img: p2, live: false },
  { name: "Yaw B.", img: p3, live: true },
  { name: "Akosua", img: heroPlayer, live: false },
  { name: "Emmanuel", img: p1, live: false },
  { name: "Kwesi", img: p3, live: false },
  { name: "Adwoa", img: p2, live: false },
  { name: "Kojo", img: p1, live: false },
];

export const StoriesRail = () => {
  return (
    <section className="border-b border-border bg-background">
      <div className="max-w-[680px] mx-auto px-4 py-4">
        <div className="flex gap-4 overflow-x-auto scrollbar-none -mx-1 px-1">
          {stories.map((s) => (
            <button key={s.name} className="flex flex-col items-center gap-1.5 shrink-0 group">
              <div className="relative">
                <div
                  className={`p-[2.5px] rounded-full ${
                    s.isYou
                      ? "bg-border"
                      : "story-ring-neon"
                  }`}
                >
                  <div className="bg-background p-[2px] rounded-full">
                    <img
                      src={s.img}
                      alt={s.name}
                      className="w-16 h-16 rounded-full object-cover group-hover:scale-105 transition-transform"
                    />
                  </div>
                </div>
                {s.isYou && (
                  <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-primary border-2 border-background flex items-center justify-center">
                    <Plus className="w-3 h-3 text-primary-foreground" strokeWidth={3} />
                  </div>
                )}
                {s.live && (
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-destructive text-destructive-foreground text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
                    Live
                  </div>
                )}
              </div>
              <span className="text-[11px] text-foreground/80 max-w-[68px] truncate">{s.name}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};
