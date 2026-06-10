import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UserPlus, Copy, Check, Building2, Mail, Phone, Calendar } from "lucide-react";

interface VenueOption {
  id: string;
  name: string;
  city: string | null;
  status: string | null;
}

interface OwnerRow {
  id: string;
  full_name: string | null;
  email: string | null;
  phone_number: string | null;
  created_at: string;
  venues: { name: string; city: string | null }[] | null;
}

export default function AdminCreateOwner() {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [venueId, setVenueId] = useState("");
  const [venues, setVenues] = useState<VenueOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [owners, setOwners] = useState<OwnerRow[]>([]);
  const [loadingOwners, setLoadingOwners] = useState(true);

  const loadOwners = async () => {
    setLoadingOwners(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, email, phone_number, created_at, venues:venues(name, city)")
      .eq("role", "turf_owner")
      .order("created_at", { ascending: false });
    setOwners((data ?? []) as OwnerRow[]);
    setLoadingOwners(false);
  };

  useEffect(() => {
    supabase
      .from("venues")
      .select("id, name, city, status")
      .order("name")
      .then(({ data }) => setVenues((data ?? []) as VenueOption[]));
    loadOwners();
  }, []);

  const submit = async () => {
    if (!email.trim() || !fullName.trim()) {
      toast.error("Email and full name are required");
      return;
    }
    setBusy(true);
    setTempPassword(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-create-venue-owner`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.access_token ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          fullName: fullName.trim(),
          phone: phone.trim() || undefined,
          password: password.trim() || undefined,
          venueId: venueId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to create owner");

      if (data.temporaryPassword) {
        setTempPassword(data.temporaryPassword);
        toast.success("Owner created — copy the temporary password below");
      } else if (data.existingUser) {
        toast.success("Existing user promoted to turf owner");
      } else {
        toast.success("Turf owner account created");
      }
      setEmail("");
      setFullName("");
      setPhone("");
      setPassword("");
      setVenueId("");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  const copyPassword = () => {
    if (!tempPassword) return;
    navigator.clipboard.writeText(tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-3xl font-display font-bold text-white tracking-tight flex items-center gap-2">
          <UserPlus className="w-7 h-7 text-emerald-400" />
          Create venue owner
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Creates an auth account, sets turf_owner role, and optionally links a venue.
        </p>
      </div>

      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-6 space-y-4">
        <input
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-emerald-500/40"
        />
        <input
          placeholder="Full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-emerald-500/40"
        />
        <input
          placeholder="Phone (optional)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-emerald-500/40"
        />
        <input
          placeholder="Password (leave blank to auto-generate)"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-emerald-500/40"
        />
        <select
          value={venueId}
          onChange={(e) => setVenueId(e.target.value)}
          className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/40"
        >
          <option value="">Link venue (optional)</option>
          {venues.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} ({v.city ?? "—"}) — {v.status ?? "unknown"}
            </option>
          ))}
        </select>

        <button
          type="button"
          disabled={busy}
          onClick={submit}
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-semibold disabled:opacity-50"
        >
          {busy ? "Creating..." : "Create turf owner"}
        </button>
      </div>

      {tempPassword && (
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-4">
          <p className="text-sm font-semibold text-amber-200">Temporary password</p>
          <p className="text-xs text-amber-300/80 mt-1">Share securely with the owner. They should change it after first login.</p>
          <div className="flex items-center gap-2 mt-3">
            <code className="flex-1 text-sm bg-black/30 rounded-lg px-3 py-2 text-amber-100 font-mono">{tempPassword}</code>
            <button type="button" onClick={copyPassword} className="p-2 rounded-lg bg-white/10 hover:bg-white/15">
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-300" />}
            </button>
          </div>
        </div>
      )}

      {/* Owner registry */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-display font-bold text-white tracking-tight">Turf owners</h2>
          <span className="text-xs text-slate-500">{owners.length} total</span>
        </div>

        {loadingOwners ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06] animate-pulse">
                <div className="h-4 bg-white/5 rounded w-48 mb-2" />
                <div className="h-3 bg-white/5 rounded w-32" />
              </div>
            ))}
          </div>
        ) : owners.length === 0 ? (
          <p className="text-sm text-slate-500">No turf owners yet.</p>
        ) : (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Owner</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Venue(s)</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {owners.map((o) => {
                    const venueList = Array.isArray(o.venues) ? o.venues : [];
                    return (
                      <tr key={o.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3">
                          <p className="text-slate-200 font-medium">{o.full_name || "—"}</p>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="flex items-center gap-1 text-[11px] text-slate-500">
                              <Mail className="w-3 h-3" /> {o.email || "—"}
                            </span>
                            {o.phone_number && (
                              <span className="flex items-center gap-1 text-[11px] text-slate-500">
                                <Phone className="w-3 h-3" /> {o.phone_number}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {venueList.length > 0 ? (
                            <div className="space-y-1">
                              {venueList.map((v, i) => (
                                <span key={i} className="flex items-center gap-1 text-xs text-slate-400">
                                  <Building2 className="w-3 h-3 text-emerald-400" /> {v.name} {v.city ? `· ${v.city}` : ""}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-600">No venue linked</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="flex items-center gap-1 text-[11px] text-slate-500">
                            <Calendar className="w-3 h-3" />
                            {new Date(o.created_at).toLocaleDateString()}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
