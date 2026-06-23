import { HomeMatch } from "@/hooks/useHomeMatches";

/* ------------------------------------------------------------
   Match helpers — transform Supabase rows → UI-friendly shapes
   ------------------------------------------------------------ */

/** Count active core participants for a match */
export function getActiveCoreCount(match: HomeMatch | any): number {
  if (!match || !match.participants) return 0;
  return match.participants.filter(
    (p: any) => p.status === "active" && p.slot_type === "core"
  ).length;
}

/** Spots left = max_core_players minus active core count */
export function getSpotsLeft(match: HomeMatch | any): number {
  if (!match) return 0;
  const max = match.max_core_players ?? match.players_per_side ?? 10;
  return Math.max(0, max - getActiveCoreCount(match));
}

/** Is the match completely full? */
export function isMatchFull(match: HomeMatch): boolean {
  return getSpotsLeft(match) === 0;
}

/** Urgency label — returns text like "4 spots left" or "1 spot left" */
export function getUrgencyLabel(spotsLeft: number): string {
  if (spotsLeft <= 0) return "Full";
  if (spotsLeft === 1) return "1 spot left";
  return `${spotsLeft} spots left`;
}

/** Haversine distance in km between two lat/lng points */
export function getDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = deg2rad(lat2 - lat1);
  const dLng = deg2rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

/** Format a match date into friendly display text
 *  "Tonight · 7:30 PM" / "Sat · 4:00 PM" / "In 2h 15m"
 */
export function getFormattedTime(matchDate: string): string {
  const now = new Date();
  const date = new Date(matchDate);
  const diffMs = date.getTime() - now.getTime();
  const diffHrs = diffMs / (1000 * 60 * 60);

  // Within 6 hours → show countdown
  if (diffHrs > 0 && diffHrs <= 6) {
    const hrs = Math.floor(diffHrs);
    const mins = Math.floor((diffHrs - hrs) * 60);
    if (hrs === 0) return `In ${mins}m`;
    return `In ${hrs}h ${mins}m`;
  }

  // Today
  if (isSameDay(date, now)) {
    return `Tonight · ${formatTime(date)}`;
  }

  // Tomorrow
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (isSameDay(date, tomorrow)) {
    return `Tomorrow · ${formatTime(date)}`;
  }

  // Day name
  const dayName = date.toLocaleDateString("en-US", { weekday: "short" });
  return `${dayName} · ${formatTime(date)}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Format match mode from DB value to UI value */
export function formatMatchMode(mode: string): string {
  if (mode === "two_team") return "two-team";
  if (mode === "gala") return "gala";
  return mode;
}

/** Extract format number, e.g. "6v6" → "6" */
export function extractFormatNumber(fmt: string): string {
  return fmt.split("v")[0] ?? fmt;
}

/** Count distinct teams in a gala match (teams != 'unassigned') */
export function getGalaTeamsIn(match: HomeMatch | any): number {
  if (!match || !match.participants) return 0;
  const teams = new Set(
    match.participants
      .filter((p: any) => p.status === "active" && p.team && p.team !== "unassigned")
      .map((p: any) => p.team)
  );
  return teams.size;
}

/** Estimated max teams for gala = max_core_players / players_per_side */
export function getGalaMaxTeams(match: HomeMatch): number {
  const side = match.players_per_side ?? 5;
  const max = match.max_core_players ?? side * 2;
  return Math.max(2, Math.floor(max / side));
}

/* ──────────── Venue operating hours helpers ──────────── */

/** Parse a "HH:MM" or "HH:MM:SS" string into total minutes since midnight. */
function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Format a "HH:MM:SS" time string to "6:00 AM" style for display. */
function formatTimeStr(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const suffix = (h ?? 0) >= 12 ? "PM" : "AM";
  const h12 = (h ?? 0) % 12 || 12;
  return `${h12}:${String(m ?? 0).padStart(2, "0")} ${suffix}`;
}

/**
 * Determine whether a venue is currently open based on its
 * structured `open_time` and `close_time` fields.
 *
 * Returns { isOpen, label } where label is e.g.
 * "Open · until 11:00 PM" or "Closed · opens 6:00 AM".
 * If the venue has no hours set we assume always open.
 */
export function isVenueOpen(
  venue: { open_time?: string | null; close_time?: string | null },
  now = new Date(),
): { isOpen: boolean; label: string } {
  if (!venue.open_time || !venue.close_time) {
    return { isOpen: true, label: "Open" };
  }

  const openMin = timeToMinutes(venue.open_time);
  const closeMin = timeToMinutes(venue.close_time);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const openLabel = formatTimeStr(venue.open_time);
  const closeLabel = formatTimeStr(venue.close_time);

  // Normal range (e.g. 06:00 – 23:00)
  if (openMin <= closeMin) {
    const isOpen = nowMin >= openMin && nowMin < closeMin;
    return {
      isOpen,
      label: isOpen ? `Open · until ${closeLabel}` : `Closed · opens ${openLabel}`,
    };
  }

  // Overnight range (e.g. 22:00 – 06:00)
  const isOpen = nowMin >= openMin || nowMin < closeMin;
  return {
    isOpen,
    label: isOpen ? `Open · until ${closeLabel}` : `Closed · opens ${openLabel}`,
  };
}

/**
 * Format venue hours into a display string like "6:00 AM – 11:00 PM".
 * Falls back to the free-text opening_hours if no structured times.
 */
export function formatVenueHours(
  venue: { open_time?: string | null; close_time?: string | null; opening_hours?: string | null },
): string | null {
  if (venue.open_time && venue.close_time) {
    return `${formatTimeStr(venue.open_time)} – ${formatTimeStr(venue.close_time)}`;
  }
  return venue.opening_hours ?? null;
}

/** Random 10-char check-in code for pitch QR fallback entry. */
export function generateCheckInCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

/** Whether venue is open at kickoff and through match duration. */
export function isVenueOpenForMatch(
  venue: { open_time?: string | null; close_time?: string | null } | null | undefined,
  kickoff: Date,
  durationMinutes = 60,
): { isOpen: boolean; label: string } {
  if (!venue?.open_time || !venue?.close_time) {
    return { isOpen: true, label: "Open" };
  }
  const start = isVenueOpen(venue, kickoff);
  if (!start.isOpen) return start;
  const end = new Date(kickoff.getTime() + durationMinutes * 60_000);
  const openMin = timeToMinutes(venue.open_time);
  const closeMin = timeToMinutes(venue.close_time);
  const endMin = end.getHours() * 60 + end.getMinutes();
  if (openMin <= closeMin && endMin > closeMin) {
    return { isOpen: false, label: `Closed · match ends after ${formatTimeStr(venue.close_time)}` };
  }
  return { isOpen: true, label: start.label };
}

/**
 * Return the array of valid kickoff hours constrained to a venue's operating window.
 * If no venue hours, returns 0-23 (all hours).
 */
export function getVenueHours(
  venue?: { open_time?: string | null; close_time?: string | null } | null,
): number[] {
  if (!venue?.open_time || !venue?.close_time) {
    return Array.from({ length: 24 }, (_, i) => i);
  }

  const openH = parseInt(venue.open_time.split(":")[0], 10);
  const closeH = parseInt(venue.close_time.split(":")[0], 10);

  // Normal range
  if (openH <= closeH) {
    return Array.from({ length: closeH - openH + 1 }, (_, i) => openH + i);
  }

  // Overnight range (e.g. 22 – 6 → [22,23,0,1,2,3,4,5,6])
  const hours: number[] = [];
  for (let h = openH; h < 24; h++) hours.push(h);
  for (let h = 0; h <= closeH; h++) hours.push(h);
  return hours;
}
