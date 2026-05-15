import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type BookingStatus = "booked" | "tentative";
export type PaymentStatus = "paid" | "unpaid" | "deposit";

export type Booking = {
  id: string;
  pitchId: string;
  date: string;
  hour: number;
  duration: number;
  status: BookingStatus;
  customerName: string;
  customerPhone: string;
  price: number;
  notes?: string;
  payment: PaymentStatus;
  createdAt: number;
  source: "manual" | "app";
};

const toBooking = (row: any): Booking => ({
  id: row.id,
  pitchId: row.pitch_id,
  date: row.date,
  hour: row.hour,
  duration: row.duration,
  status: row.status,
  customerName: row.customer_name,
  customerPhone: row.customer_phone ?? "",
  price: row.price ?? 0,
  notes: row.notes ?? undefined,
  payment: row.payment,
  createdAt: new Date(row.created_at).getTime(),
  source: row.source,
});

const fromBooking = (b: any): any => ({
  pitch_id: b.pitchId,
  date: b.date,
  hour: b.hour,
  duration: b.duration,
  status: b.status,
  customer_name: b.customerName,
  customer_phone: b.customerPhone,
  price: b.price,
  notes: b.notes,
  payment: b.payment,
  source: b.source ?? "manual",
});

export const useBookings = (pitchId?: string) => {
  const [bookings, setBookings] = useState<Booking[]>([]);

  useEffect(() => {
    const load = async () => {
      let q = supabase.from("bookings").select("*").order("created_at", { ascending: false });
      if (pitchId) q = q.eq("pitch_id", pitchId);
      const { data, error } = await q;
      if (error) return;
      setBookings((data ?? []).map(toBooking));
    };

    load();
    const channelName = "bookings:" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => load())
      .subscribe();
    return () => { channel.unsubscribe(); supabase.removeChannel(channel); };
  }, [pitchId]);

  const addBooking = useCallback(async (b: Omit<Booking, "id" | "createdAt" | "source"> & { source?: Booking["source"] }) => {
    const { data, error } = await supabase.from("bookings").insert(fromBooking(b)).select().single();
    if (!error && data) {
      setBookings(prev => [toBooking(data), ...prev]);
    }
    return data ? toBooking(data) : null;
  }, []);

  const removeBooking = useCallback(async (id: string) => {
    const { error } = await supabase.from("bookings").delete().eq("id", id);
    if (!error) setBookings(prev => prev.filter(b => b.id !== id));
  }, []);

  const updateBooking = useCallback(async (id: string, patch: Partial<Booking>) => {
    const dbPatch: any = {};
    if (patch.pitchId !== undefined) dbPatch.pitch_id = patch.pitchId;
    if (patch.date !== undefined) dbPatch.date = patch.date;
    if (patch.hour !== undefined) dbPatch.hour = patch.hour;
    if (patch.duration !== undefined) dbPatch.duration = patch.duration;
    if (patch.status !== undefined) dbPatch.status = patch.status;
    if (patch.customerName !== undefined) dbPatch.customer_name = patch.customerName;
    if (patch.customerPhone !== undefined) dbPatch.customer_phone = patch.customerPhone;
    if (patch.price !== undefined) dbPatch.price = patch.price;
    if (patch.notes !== undefined) dbPatch.notes = patch.notes;
    if (patch.payment !== undefined) dbPatch.payment = patch.payment;
    if (patch.source !== undefined) dbPatch.source = patch.source;

    const { data, error } = await supabase.from("bookings").update(dbPatch).eq("id", id).select().single();
    if (!error && data) {
      setBookings(prev => prev.map(b => (b.id === id ? toBooking(data) : b)));
    }
  }, []);

  const filtered = pitchId ? bookings.filter(b => b.pitchId === pitchId) : bookings;
  return { bookings: filtered, addBooking, removeBooking, updateBooking };
};
