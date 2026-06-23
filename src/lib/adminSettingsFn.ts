import { supabase } from "@/integrations/supabase/client";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-platform-settings`;

async function getAuthHeader(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? `Bearer ${token}` : null;
}

/** GET — fetch all allowed platform settings */
export async function callAdminSettings(method: "GET"): Promise<{
  settings?: { key: string; value: string; description: string | null }[];
  error?: string;
}>;

/** POST — upsert a single setting */
export async function callAdminSettings(
  method: "POST",
  body: { key: string; value: string },
): Promise<{ success?: boolean; error?: string }>;

export async function callAdminSettings(
  method: "GET" | "POST",
  body?: { key: string; value: string },
): Promise<any> {
  const authHeader = await getAuthHeader();
  if (!authHeader) return { error: "Not authenticated" };

  try {
    const res = await fetch(FN_URL, {
      method,
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      ...(method === "POST" && body ? { body: JSON.stringify(body) } : {}),
    });

    const json = await res.json().catch(() => ({ error: "Invalid response from server" }));
    if (!res.ok) return { error: json?.error ?? `HTTP ${res.status}` };
    return json;
  } catch {
    if (method === "GET") {
      const { data, error } = await (supabase as any)
        .from("platform_settings")
        .select("key, value, description")
        .order("key");
      if (error) return { error: error.message };
      return { settings: data ?? [] };
    }

    if (!body) return { error: "Missing setting body" };
    const { error } = await (supabase as any)
      .from("platform_settings")
      .upsert(
        { key: body.key, value: body.value, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
    if (error) return { error: error.message };
    return { success: true };
  }
}
