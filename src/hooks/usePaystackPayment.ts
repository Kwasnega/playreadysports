import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const EDGE_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export function usePaystackPayment() {
  const [paying, setPaying] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const initiate = useCallback(async (matchId: string) => {
    setPaying(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        toast.error("Please sign in to pay");
        setPaying(false);
        return null;
      }

      const callbackUrl = `${window.location.origin}/lobby/?verify=${matchId}`;
      const res = await fetch(`${EDGE_BASE}/paystack-init`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ matchId, callbackUrl }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        toast.error(data.error || "Payment failed to start");
        setPaying(false);
        return null;
      }

      if (data.free) {
        toast.success("No fee — you're confirmed!");
        setPaying(false);
        return "free";
      }

      // Open Paystack checkout in same window
      if (data.authorizationUrl) {
        window.location.href = data.authorizationUrl;
        return "redirecting";
      }

      toast.error("No payment URL returned");
      setPaying(false);
      return null;
    } catch (err: any) {
      toast.error(err.message || "Payment error");
      setPaying(false);
      return null;
    }
  }, []);

  const verify = useCallback(async (reference: string) => {
    setVerifying(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setVerifying(false);
        return false;
      }

      const res = await fetch(`${EDGE_BASE}/paystack-verify`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reference }),
      });

      const data = await res.json();
      setVerifying(false);

      if (data.success && data.verified) {
        toast.success("Payment confirmed! You're in.");
        return true;
      }

      toast.error(data.error || "Payment verification failed");
      return false;
    } catch (err: any) {
      toast.error(err.message || "Verification error");
      setVerifying(false);
      return false;
    }
  }, []);

  return { initiate, verify, paying, verifying };
}
