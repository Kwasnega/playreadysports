export type MoolrePaymentStatus = {
  success: boolean;
  pending: boolean;
  amount: number;
  reference: string;
  transactionId?: string;
  raw: unknown;
  message?: string;
};

type MoolreKeyMode = "public" | "private" | "vas";

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function getMoolreConfig() {
  const env = Deno.env.get("MOOLRE_ENV") || "sandbox";
  const baseUrl =
    Deno.env.get("MOOLRE_BASE_URL") ||
    (env === "live" ? "https://api.moolre.com" : "https://sandbox.moolre.com");

  return {
    env,
    baseUrl: baseUrl.replace(/\/$/, ""),
    apiUser: requiredEnv("MOOLRE_API_USER"),
    accountNumber: requiredEnv("MOOLRE_ACCOUNT_NUMBER"),
    publicKey: Deno.env.get("MOOLRE_PUBLIC_KEY") || "",
    privateKey: Deno.env.get("MOOLRE_PRIVATE_KEY") || "",
    vasKey: Deno.env.get("MOOLRE_VAS_KEY") || "",
  };
}

export function buildMoolreHeaders(mode: MoolreKeyMode = "public") {
  const config = getMoolreConfig();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-API-USER": config.apiUser,
  };

  if (mode === "public" && config.publicKey) {
    headers["X-API-PUBKEY"] = config.publicKey;
  }
  if (mode === "private" && config.privateKey) {
    headers["X-API-KEY"] = config.privateKey;
  }
  if (mode === "vas" && config.vasKey) {
    headers["X-API-VASKEY"] = config.vasKey;
  }

  return headers;
}

export async function moolrePost<T>(
  path: string,
  body: Record<string, unknown>,
  mode: MoolreKeyMode = "public",
): Promise<T> {
  const config = getMoolreConfig();
  const res = await fetch(`${config.baseUrl}${path}`, {
    method: "POST",
    headers: buildMoolreHeaders(mode),
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => null);
  
  // Log all responses for debugging
  console.log(`[moolrePost] ${path} - status: ${res.status}, response:`, JSON.stringify(data));
  
  if (!res.ok) {
    throw new Error((data as any)?.message || `Moolre request failed with ${res.status}`);
  }

  return data as T;
}

export async function verifyMoolrePayment(reference: string, email?: string): Promise<MoolrePaymentStatus> {
  const config = getMoolreConfig();
  
  try {
    const data = await moolrePost<any>("/open/transact/status", {
      type: 1,
      idtype: 2, // 2 = email
      id: email || "player@joinplayready.com",
      externalref: reference,
      accountnumber: config.accountNumber,
    });

    const tx = data?.data || {};
    const txStatus = Number(tx.txstatus ?? 0);
    const amount = Number(tx.amount ?? tx.value ?? 0);

    return {
      success: Number(data?.status) === 1 && txStatus === 1,
      pending: Number(data?.status) === 1 && txStatus === 0,
      amount,
      reference: String(tx.externalref || reference),
      transactionId: tx.transactionid ? String(tx.transactionid) : undefined,
      raw: data,
      message: Array.isArray(data?.message) ? data.message.join(" ") : data?.message,
    };
  } catch (err: any) {
    console.error("[verifyMoolrePayment] Error:", err.message);
    
    // Return a pending status if the transaction is not yet found on Moolre's side
    // This can happen if the webhook hasn't processed yet
    if (err.message?.includes("not found") || err.message?.includes("404")) {
      return {
        success: false,
        pending: true, // Treat as still pending so frontend can retry
        amount: 0,
        reference,
        message: "Payment verification pending - please wait for confirmation",
      };
    }
    
    // Re-throw other errors
    throw err;
  }
}
