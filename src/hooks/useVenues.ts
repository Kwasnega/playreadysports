import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getDistanceKm } from "@/lib/matchHelpers";

export type Venue = {
  id: string;
  name: string;
  city: string | null;
  area: string | null;
  address: string | null;
  surface: string | null;
  lat: number | null;
  lng: number | null;
  price_per_hour: number | null;
  capacity: number | null;
  contact_phone: string | null;
  amenities: string[] | null;
  description: string | null;
  opening_hours: string | null;
  is_active: boolean;
  image_urls: string[] | null;
};

async function fetchVenues(): Promise<Venue[]> {
  const { data, error } = await supabase
    .from("venues")
    .select("*")
    .eq("is_active", true)
    .eq("status", "verified")
    .order("name");

  if (error) {
    console.error("useVenues error:", error);
    return [];
  }
  return (data ?? []) as Venue[];
}

export function useVenues(userLat?: number, userLng?: number) {
  const { data: venues = [], isLoading: loading } = useQuery({
    queryKey: ["venues"],
    queryFn: fetchVenues,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 5,
  });

  const sorted = useMemo(() => {
    if (userLat == null || userLng == null) return venues;
    return [...venues].sort((a, b) => {
      const da = a.lat && a.lng ? getDistanceKm(userLat, userLng, a.lat, a.lng) : Infinity;
      const db = b.lat && b.lng ? getDistanceKm(userLat, userLng, b.lat, b.lng) : Infinity;
      return da - db;
    });
  }, [venues, userLat, userLng]);

  return { venues: sorted, loading };
}
