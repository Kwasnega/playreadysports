import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type WalletTransaction = {
  id: string;
  user_id: string;
  amount: number;
  type: "deposit" | "spend" | "refund" | "cashback" | "bonus" | "tip" | "withdrawal" | "venue_cut" | "organizer_profit";
  reference: string | null;
  status: string;
  description: string | null;
  balance_after: number | null;
  match_id: string | null;
  created_at: string;
};

const normalizeTeamSide = (team?: string | null): "reds" | "blues" | "unassigned" => {
  const value = String(team ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["reds", "red", "team_a", "a"].includes(value)) return "reds";
  if (["blues", "blue", "team_b", "b"].includes(value)) return "blues";
  return "unassigned";
};

export function useWallet() {
  const { user } = useAuth();
  const userId = user?.id;
  const [balance, setBalance] = useState<number>(0);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [toppingUp, setToppingUp] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [paying, setPaying] = useState(false);

  const fetchWallet = useCallback(async () => {
    if (!userId) {
      setBalance(0);
      setTransactions([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch balance
      const { data: balanceData, error: balanceErr } = await (supabase as any)
        .from("wallet_balances")
        .select("balance")
        .eq("user_id", userId)
        .maybeSingle();

      if (balanceErr) {
        throw balanceErr;
      }

      setBalance(balanceData ? Number(balanceData.balance) || 0 : 0);

      // Fetch transactions
      const { data: txData, error: txErr } = await (supabase as any)
        .from("wallet_transactions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (txErr) throw txErr;

      setTransactions((txData ?? []) as WalletTransaction[]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`wallet_balance:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wallet_balances", filter: `user_id=eq.${userId}` },
        (payload) => {
          if (payload.new && typeof (payload.new as any).balance !== "undefined") {
            setBalance(Number((payload.new as any).balance) || 0);
          }
        }
      )
      .subscribe();
    channelRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId]);

  const topUp = async (amountInCedis: number) => {
    if (!user) return false;
    setToppingUp(true);

    const EDGE_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
    // On localhost, default to Moolre for testing; production uses env variable
    const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const paymentProvider = (isLocalhost ? "moolre" : import.meta.env.VITE_PAYMENT_PROVIDER || "paystack").toLowerCase();

    if (paymentProvider === "moolre") {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) {
          setToppingUp(false);
          return false;
        }

        const redirectUrl = `${window.location.origin}/wallet`;
        const res = await fetch(`${EDGE_BASE}/moolre-init`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ amount: amountInCedis, redirectUrl }),
        });

        const data = await res.json();
        if (!res.ok || !data.authorizationUrl) {
          setError(data.error || "Could not start Moolre top-up");
          setToppingUp(false);
          return false;
        }

        window.location.href = data.authorizationUrl;
        return true;
      } catch (err: any) {
        setError(err.message || "Could not start Moolre top-up");
        setToppingUp(false);
        return false;
      }
    }
    
    return new Promise<boolean>((resolve) => {
      try {
        if (!(window as any).PaystackPop) {
          setToppingUp(false);
          resolve(false);
          return;
        }
        const handler = (window as any).PaystackPop.setup({
          key: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY,
          email: user.email,
          amount: amountInCedis * 100, // Paystack expects pesewas
          currency: "GHS",
          ref: `wallet_${user.id}_${Date.now()}`,
          callback: async (response: any) => {
            // Verify with edge function
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            if (!token) {
              setToppingUp(false);
              return resolve(false);
            }

            const res = await fetch(`${EDGE_BASE}/wallet-topup`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ reference: response.reference }),
            });

            const data = await res.json();
            if (res.ok && data.success) {
              await fetchWallet();
              setToppingUp(false);
              resolve(true);
            } else {
              setToppingUp(false);
              resolve(false);
            }
          },
          onClose: () => {
            setToppingUp(false);
            resolve(false);
          },
        });
        handler.openIframe();
      } catch (err) {
        setToppingUp(false);
        resolve(false);
      }
    });
  };

  const verifyTopUp = useCallback(async (reference: string, provider = "moolre") => {
    if (!user) return { success: false, error: "Not signed in" };
    setToppingUp(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setToppingUp(false);
        return { success: false, error: "Session expired" };
      }

      const EDGE_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
      
      // Poll for up to 10 seconds, checking every 500ms for webhook completion
      const maxRetries = 20;
      let retries = 0;
      
      while (retries < maxRetries) {
        const res = await fetch(`${EDGE_BASE}/wallet-topup`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ reference, provider }),
        });

        const data = await res.json();
        
        // If successful, we're done
        if (res.ok && data.success) {
          await fetchWallet();
          setToppingUp(false);
          return { success: true, newBalance: data.newBalance };
        }
        
        // If still pending, wait and retry
        if (res.status === 202 && data.pending) {
          retries++;
          if (retries < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms before retrying
            continue;
          } else {
            // Timeout - still pending after 10 seconds
            await fetchWallet();
            setToppingUp(false);
            return { success: false, pending: true, error: "Payment is taking longer than expected. Please check back in a moment." };
          }
        }
        
        // Any other error
        setError(data.error || "Top-up verification failed");
        setToppingUp(false);
        return { success: false, error: data.error || "Top-up verification failed" };
      }

      // Shouldn't reach here, but just in case
      setToppingUp(false);
      return { success: false, error: "Verification timeout" };
    } catch (err: any) {
      setError(err.message || "Top-up verification failed");
      setToppingUp(false);
      return { success: false, error: err.message || "Top-up verification failed" };
    }
  }, [fetchWallet, user]);

  const withdraw = async (amount: number, phone: string, provider: string) => {
    if (!user) return { success: false, error: "Not signed in" };
    setWithdrawing(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setWithdrawing(false);
        return { success: false, error: "Session expired" };
      }

      const EDGE_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
      const res = await fetch(`${EDGE_BASE}/wallet-withdraw`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amount, phone, provider }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        await fetchWallet();
        setWithdrawing(false);
        return { success: true, message: data.message, status: data.status };
      } else {
        setError(data.error || "Withdrawal failed");
        setWithdrawing(false);
        return { success: false, error: data.error || "Withdrawal failed" };
      }
    } catch (err: any) {
      setError(err.message || "Withdrawal failed");
      setWithdrawing(false);
      return { success: false, error: err.message || "Withdrawal failed" };
    }
  };

  const payForMatch = async (matchId: string, team: string, slotType: string = "core") => {
    if (!user) return { success: false, error: "Not signed in" };
    setPaying(true);
    try {
      const { data, error: rpcError } = await (supabase as any).rpc("join_match_with_wallet", {
        p_match_id: matchId,
        p_user_id: user.id,
        p_team: normalizeTeamSide(team),
        p_slot_type: slotType,
      });

      if (rpcError) throw rpcError;
      
      await fetchWallet();
      setPaying(false);
      return { success: true, participantId: (data as any)?.participant_id };
    } catch (err: any) {
      setPaying(false);
      return { success: false, error: err.message };
    }
  };

  return {
    balance,
    transactions,
    loading,
    toppingUp,
    withdrawing,
    paying,
    error,
    topUp,
    verifyTopUp,
    withdraw,
    payForMatch,
    refresh: fetchWallet,
  };
}
