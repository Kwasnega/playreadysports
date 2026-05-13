export function generatePaymentReference(matchCode: string, userId: string): string {
  return `PRS-${matchCode}-${userId.slice(0, 8)}-${Date.now()}`;
}

function loadPaystackScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).PaystackPop) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://js.paystack.co/v2/inline.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Paystack script"));
    document.body.appendChild(script);
  });
}

export async function initPaystackPayment(config: {
  email: string;
  amount: number; // GHS
  reference: string;
  matchId: string;
  userId: string;
  onSuccess: (reference: string) => void;
  onClose: () => void;
}): Promise<void> {
  const key = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY as string | undefined;
  if (!key) {
    console.error("Paystack public key missing. Set VITE_PAYSTACK_PUBLIC_KEY in .env");
    config.onClose();
    throw new Error("Paystack public key not configured");
  }

  try {
    await loadPaystackScript();
  } catch (e) {
    console.error("Paystack script failed to load:", e);
    config.onClose();
    throw new Error("Payment provider unavailable. Check your connection.");
  }

  const PaystackPop = (window as any).PaystackPop;
  if (!PaystackPop) {
    config.onClose();
    throw new Error("Paystack not available");
  }

  const amountPesewas = Math.round(config.amount * 100);

  const popup = new PaystackPop();
  popup.newTransaction({
    key,
    email: config.email,
    amount: amountPesewas,
    reference: config.reference,
    currency: "GHS",
    channels: ["card", "mobile_money"],
    metadata: {
      match_id: config.matchId,
      user_id: config.userId,
    },
    onSuccess: (transaction: any) => {
      config.onSuccess(transaction.reference);
    },
    onLoad: (response: any) => {
      console.log("Paystack onLoad:", response);
    },
    onCancel: () => {
      config.onClose();
    },
    onError: (error: any) => {
      console.error("Paystack error:", error);
      config.onClose();
    },
  });
}
