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
  joinCode: string;
  team?: string;
  entryFee?: number;
  onSuccess: (reference: string) => void;
  onClose: () => void;
}): Promise<void> {
  const key = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY as string | undefined;
  if (!key) {
    config.onClose();
    throw new Error("Paystack public key not configured");
  }

  try {
    await loadPaystackScript();
  } catch (e) {
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
      join_code: config.joinCode,
      team: config.team || "unassigned",
      entry_fee: config.entryFee ?? config.amount,
    },
    onSuccess: (transaction: any) => {
      config.onSuccess(transaction.reference);
    },
    onLoad: () => {},
    // No-op: Paystack loaded successfully
    onCancel: () => {
      config.onClose();
    },
    onError: () => {
      config.onClose();
    },
  });
}
