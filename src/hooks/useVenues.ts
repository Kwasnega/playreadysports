import { useEffect, useMemo, useState } from "react";
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
  is_active: boolean;
  image_urls: string[] | null;
};

export function useVenues(userLat?: number, userLng?: number) {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase
        .from("venues")
        .select("*")
        .eq("is_active", true)
        .order("name");

      if (cancelled) return;

      if (error) {
        console.error("useVenues error:", error);
        setVenues([]);
      } else {
        setVenues((data ?? []) as Venue[]);
      }
      setLoading(false);
    };

    load();
  }, []);

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
