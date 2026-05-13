import { useEffect, useState } from "react";

const API_KEY = import.meta.env.VITE_OPENWEATHER_API_KEY;

export type WeatherData = {
  temp: number;
  description: string;
  icon: string;
  rainChance: number;
  humidity: number;
  windSpeed: number;
};

export function useWeather(lat?: number | null, lng?: number | null, matchTime?: string) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!lat || !lng || !matchTime) { setWeather(null); return; }
    if (!API_KEY) { setError("No API key"); return; }

    setLoading(true);
    setError(null);

    const fetchWeather = async () => {
      try {
        // Use OpenWeatherMap 5-day forecast to get closest time
        const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lng}&appid=${API_KEY}&units=metric`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Weather API failed");
        const data = await res.json();

        const targetTime = new Date(matchTime).getTime();
        const closest = data.list.reduce((best: any, curr: any) => {
          const currTime = new Date(curr.dt * 1000).getTime();
          const bestTime = new Date(best.dt * 1000).getTime();
          return Math.abs(currTime - targetTime) < Math.abs(bestTime - targetTime) ? curr : best;
        });

        setWeather({
          temp: Math.round(closest.main.temp),
          description: closest.weather[0]?.description || "",
          icon: closest.weather[0]?.icon || "",
          rainChance: Math.round((closest.pop ?? 0) * 100),
          humidity: closest.main.humidity,
          windSpeed: closest.wind.speed,
        });
      } catch (err: any) {
        setError(err.message);
        setWeather(null);
      } finally {
        setLoading(false);
      }
    };

    fetchWeather();
  }, [lat, lng, matchTime]);

  return { weather, loading, error };
}
