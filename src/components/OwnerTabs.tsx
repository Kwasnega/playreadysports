import { Link, useLocation } from "react-router-dom";
import { Building2, CalendarDays, MapPin, User } from "lucide-react";
import { ProfileSheet } from "@/components/ProfileSheet";

const tabs = [
  { to: "/venue/dashboard", icon: Building2, label: "Dashboard", match: (p: string) => p === "/venue/dashboard" || p === "/venue/earnings" },
  { to: "/schedule", icon: CalendarDays, label: "Schedule", match: (p: string) => p.startsWith("/schedule") },
  { to: "/turf/pitches", icon: MapPin, label: "Pitches", match: (p: string) => p.startsWith("/turf/pitches") || p.startsWith("/turf/register") },
];

export const OwnerTabs = () => {
  const { pathname } = useLocation();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-background/95 backdrop-blur-md border-t border-border">
      <div className="max-w-[680px] mx-auto grid grid-cols-4 h-16">
        {tabs.map(t => {
          const active = t.match(pathname);
          return (
            <Link
              key={t.to}
              to={t.to}
              className={`flex flex-col items-center justify-center gap-1 ${active ? "text-foreground" : "text-muted-foreground"}`}
            >
              <t.icon className="w-5 h-5" strokeWidth={active ? 2.4 : 2} />
              <span className="text-[10px] font-semibold">{t.label}</span>
            </Link>
          );
        })}
        <ProfileSheet
          trigger={
            <button className="flex flex-col items-center justify-center gap-1 text-muted-foreground" aria-label="Open profile">
              <User className="w-5 h-5" />
              <span className="text-[10px] font-semibold">Profile</span>
            </button>
          }
        />
      </div>
    </nav>
  );
};
