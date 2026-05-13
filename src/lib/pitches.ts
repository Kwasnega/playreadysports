// Shared pitch list used by the owner dashboard and the schedule view so
// manual bookings created in either place reference the same pitch ids.
export type PitchType = "Astroturf" | "Grass" | "Indoor";

export type Pitch = {
  id: string;
  name: string;
  type: PitchType;
  distanceKm: number;
  hourlyRate: number; // GH₵
};

export const PITCHES: Pitch[] = [
  { id: "bantama", name: "Bantama Astro", type: "Astroturf", distanceKm: 1.4, hourlyRate: 180 },
  { id: "madina", name: "Madina Park", type: "Astroturf", distanceKm: 3.2, hourlyRate: 150 },
  { id: "legon", name: "Legon Field", type: "Grass", distanceKm: 5.0, hourlyRate: 200 },
  { id: "spintex", name: "Spintex Indoor", type: "Indoor", distanceKm: 7.6, hourlyRate: 220 },
];
