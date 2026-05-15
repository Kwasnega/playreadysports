import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type CreateMatchPayload = {
  venueId: string;
  matchType: string;
  matchMode: string;
  format: string;
  matchDate: string;
  durationMinutes: number;
  entryFee: number;
  notes?: string;
  teamColorA?: string;
  teamColorB?: string;
};

export function useCreateMatch() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  const createMatch = async (payload: CreateMatchPayload) => {
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-match", {
        body: payload,
      });

      if (error) {
        console.error("Edge function error:", error);
        toast.error(error.message || "Failed to create match");
        setCreating(false);
        return null;
      }

      if (data?.error) {
        toast.error(data.error);
        setCreating(false);
        return null;
      }

      const match = data?.match;
      if (!match?.join_code) {
        toast.error("Match created but no code returned");
        setCreating(false);
        return null;
      }

      toast.success("Match created!");
      return match;
    } catch (err: any) {
      console.error("createMatch exception:", err);
      toast.error(err.message || "Network error");
      setCreating(false);
      return null;
    }
  };

  return { createMatch, creating, setCreating };
}
