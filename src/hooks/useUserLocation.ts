import { useEffect, useState } from "react";

export type UserLocation = {
  lat: number;
  lng: number;
  city?: string;
  error?: string;
};

export function useUserLocation() {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocation({ lat: 5.6037, lng: -0.187, error: "Geolocation not supported" });
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setLoading(false);
      },
      (err) => {
        // Default to Accra
        setLocation({
          lat: 5.6037,
          lng: -0.187,
          error: err.message,
        });
        setLoading(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
    );
  }, []);

  return { location, loading };
}
