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

  const friendlyFunctionError = async (err: any): Promise<string> => {
    const msg = (err?.message ?? "").toString().toLowerCase();
    if (err?.status === 429 || msg.includes("too many") || msg.includes("rate limit")) {
      return "You have reached the match creation limit. Please wait a few minutes and try again.";
    }
    try {
      const context = err?.context;
      if (context?.json) {
        const body = await context.clone().json();
        if (body?.message) return String(body.message);
        if (body?.error) return String(body.error);
      }
    } catch {
      // ignore parse failure
    }
    return err?.message || "Failed to create match. Please try again.";
  };

  const createMatch = async (payload: CreateMatchPayload): Promise<CreateMatchResult> => {
    setCreating(true);

    try {
      const { data, error } = await supabase.functions.invoke("create-match", {
        body: payload,
      });



      if (error) {
        const friendly = await friendlyFunctionError(error);
        console.error("[createMatch] Error:", error);
        toast.error(friendly);
        setCreating(false);
        return { success: false, error: friendly };
      }

      if (data?.error) {
        setCreating(false);
        console.error("[createMatch] Validation error:", data);
        if (data.error === "VALIDATION_ERROR" && data.field) {
          const msg = `${data.field}: ${data.message}`;
          toast.error(msg);
          return { success: false, error: msg, field: data.field };
        }
        const friendly = data.message || data.error;
        toast.error(friendly);
        return { success: false, error: friendly };
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
