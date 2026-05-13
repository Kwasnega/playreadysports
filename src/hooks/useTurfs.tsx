import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type TurfStatus = "pending" | "verified" | "rejected";

export type Turf = {
  id: string;
  ownerEmail: string;
  name: string;
  area: string;
  city: string;
  address: string;
  hourlyRate: number;
  capacity: number;
  surface: "Astroturf";
  amenities: string[];
  contactPhone: string;
  notes?: string;
  status: TurfStatus;
  createdAt: number;
};

const toTurf = (row: any): Turf => ({
  id: row.id,
  ownerEmail: row.owner_email ?? "",
  name: row.name,
  area: row.area ?? "",
  city: row.city,
  address: row.address,
  hourlyRate: row.price_per_hour ?? 0,
  capacity: row.capacity ?? 10,
  surface: row.surface ?? "Astroturf",
  amenities: row.amenities ?? [],
  contactPhone: row.contact_phone ?? "",
  notes: row.description ?? undefined,
  status: row.status ?? "pending",
  createdAt: new Date(row.created_at).getTime(),
});

const fromTurf = (t: any): any => ({
  owner_email: t.ownerEmail,
  name: t.name,
  area: t.area,
  city: t.city,
  address: t.address,
  price_per_hour: t.hourlyRate,
  capacity: t.capacity,
  surface: t.surface ?? "Astroturf",
  amenities: t.amenities,
  contact_phone: t.contactPhone,
  description: t.notes,
  status: t.status ?? "pending",
});

export const useTurfs = (ownerEmail?: string) => {
  const channelRef = useRef<string>("");
  const [turfs, setTurfs] = useState<Turf[]>([]);

  useEffect(() => {
    const load = async () => {
      let q = supabase.from("venues").select("*").order("created_at", { ascending: false });
      if (ownerEmail) q = q.eq("owner_email", ownerEmail);
      const { data, error } = await q;
      if (error) return;
      setTurfs((data ?? []).map(toTurf));
    };

    load();
    const channelName = "venues:" + (channelRef.current || (channelRef.current = crypto.randomUUID()));
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "venues" }, () => load())
      .subscribe();
    return () => { channel.unsubscribe(); supabase.removeChannel(channel); };
  }, [ownerEmail]);

  const addTurf = useCallback(async (t: Omit<Turf, "id" | "createdAt" | "status" | "surface"> & { status?: TurfStatus }) => {
    const payload = fromTurf({ ...t, surface: "Astroturf", status: t.status ?? "pending" });
    const { data, error } = await supabase.from("venues").insert(payload).select().single();
    if (!error && data) {
      setTurfs(prev => [toTurf(data), ...prev]);
    }
    return data ? toTurf(data) : null;
  }, []);

  const removeTurf = useCallback(async (id: string) => {
    const { error } = await supabase.from("venues").delete().eq("id", id);
    if (!error) setTurfs(prev => prev.filter(t => t.id !== id));
  }, []);

  const list = ownerEmail ? turfs.filter(t => t.ownerEmail === ownerEmail) : turfs;
  return { turfs: list, allTurfs: turfs, addTurf, removeTurf };
};
