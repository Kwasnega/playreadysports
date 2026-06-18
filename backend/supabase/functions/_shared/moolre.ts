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
  if (!res.ok) {
    throw new Error((data as any)?.message || `Moolre request failed with ${res.status}`);
  }

  return data as T;
}

export async function verifyMoolrePayment(reference: string): Promise<MoolrePaymentStatus> {
  const config = getMoolreConfig();
  const data = await moolrePost<any>("/open/transact/status", {
    type: 1,
    idtype: "1",
    id: reference,
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
}
