import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type CreateMatchPayload = {
  title: string;
  sportType: string;
  venueId: string;
  matchType: string;
  matchMode: string;
  format: string;
  matchDate: string;
  durationMinutes: number;
  entryFee: number;
  maxCore: number;
  profitAmount?: number;
  notes?: string;
  teamColorA?: string;
  teamColorB?: string;
};

export type CreateMatchResult =
  | { success: true; match: any }
  | { success: false; error: string; field?: string };

export function useCreateMatch() {
  const [creating, setCreating] = useState(false);

  const createMatch = async (payload: CreateMatchPayload): Promise<CreateMatchResult> => {
    setCreating(true);
    console.log("[createMatch] Payload:", payload);
    try {
      const { data, error } = await supabase.functions.invoke("create-match", {
        body: payload,
      });

      console.log("[createMatch] Response:", { data, error });

      if (error) {
        console.error("[createMatch] Error:", error);
        toast.error(error.message || "Failed to create match");
        setCreating(false);
        return { success: false, error: error.message || "Failed to create match" };
      }

      if (data?.error) {
        setCreating(false);
        console.error("[createMatch] Validation error:", data);
        if (data.error === "VALIDATION_ERROR" && data.field) {
          const msg = `${data.field}: ${data.message}`;
          toast.error(msg);
          return { success: false, error: msg, field: data.field };
        }
        toast.error(data.error);
        return { success: false, error: data.error };
      }

      const match = data?.match;
      if (!match?.join_code) {
        toast.error("Match created but no code returned");
        setCreating(false);
        return { success: false, error: "Match created but no code returned" };
      }

      toast.success("Match created!");
      return { success: true, match };
    } catch (err: any) {
      console.error("[createMatch] Exception:", err);
      toast.error(err.message || "Network error");
      setCreating(false);
      return { success: false, error: err.message || "Network error" };
    } finally {
      setCreating(false);
    }
  };

  return { createMatch, creating, setCreating };
}
