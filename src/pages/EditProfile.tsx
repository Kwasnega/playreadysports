import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Camera, Loader2, Check } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useUpdateProfile, checkUsernameAvailable, uploadAvatar } from "@/hooks/useUpdateProfile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const CITIES = ["Accra", "Kumasi", "Tema", "Tamale", "Cape Coast", "Takoradi", "Sunyani", "Ho", "Bolgatanga", "Wa"];
const POSITIONS = ["GK", "CB", "LB", "RB", "CM", "LM", "RM", "CDM", "CAM", "ST", "CF", "LW", "RW", "Other"];

const EditProfile = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentUsername, setCurrentUsername] = useState("");

  // Resolve username from profile lookup by user id
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data?.username) setCurrentUsername(data.username);
      });
  }, [user?.id]);

  const { profile, loading: profileLoading } = useProfile(currentUsername);
  const update = useUpdateProfile(user?.id);

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [city, setCity] = useState("");
  const [position, setPosition] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [usernameAvail, setUsernameAvail] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name ?? "");
    setUsername(profile.username ?? "");
    setCity(profile.city ?? "");
    setPosition(profile.position ?? "");
    setPhone(profile.phone_number ?? "");
    setBio(profile.bio ?? "");
    setAvatarUrl(profile.avatar_url ?? null);
  }, [profile]);

  // Debounced username check
  useEffect(() => {
    if (!username.trim() || username === currentUsername) {
      setUsernameAvail(null);
      return;
    }
    const t = setTimeout(async () => {
      setCheckingUsername(true);
      const avail = await checkUsernameAvailable(username.trim(), user?.id);
      setUsernameAvail(avail);
      setCheckingUsername(false);
    }, 400);
    return () => clearTimeout(t);
  }, [username, currentUsername, user?.id]);

  const handleAvatar = async (file: File) => {
    if (!user?.id) return;
    try {
      const url = await uploadAvatar(user.id, file);
      setAvatarUrl(url);
      toast.success("Avatar uploaded");
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    }
  };

  const save = async () => {
    if (!user?.id) return;
    if (username.trim() && username !== currentUsername && usernameAvail === false) {
      toast.error("Username is already taken");
      return;
    }
    setSaving(true);
    try {
      await update.mutateAsync({
        full_name: fullName.trim() || null,
        username: username.trim() || null,
        city: city || null,
        position: position || null,
        phone_number: phone.trim() || null,
        bio: bio.trim() || null,
        avatar_url: avatarUrl,
      });
      toast.success("Profile updated");
      navigate(`/player/${username.trim() || currentUsername}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (profileLoading) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background pb-10">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border/60">
        <div className="max-w-[680px] mx-auto px-5 h-14 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-secondary">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-display font-bold text-xl tracking-tight flex-1">Edit Profile</h1>
        </div>
      </header>

      <div className="max-w-[680px] mx-auto px-5 py-6 space-y-6">
        {/* Avatar */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="w-24 h-24 rounded-full object-cover ring-2 ring-border" />
            ) : (
              <div className="w-24 h-24 rounded-full bg-secondary flex items-center justify-center text-2xl font-bold">
                {fullName ? fullName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() : "?"}
              </div>
            )}
            <button
              onClick={() => fileRef.current?.click()}
              className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center shadow-lg"
            >
              <Camera className="w-4 h-4" />
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleAvatar(f);
            }}
          />
        </div>

        {/* Form */}
        <div className="space-y-4">
          <Field label="Full name">
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
              className="w-full bg-secondary rounded-2xl px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-foreground"
            />
          </Field>

          <Field label="Username">
            <div className="relative">
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Unique username"
                className="w-full bg-secondary rounded-2xl px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-foreground pr-10"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2">
                {checkingUsername ? (
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                ) : usernameAvail === true ? (
                  <Check className="w-4 h-4 text-success" />
                ) : usernameAvail === false ? (
                  <span className="text-[10px] text-destructive font-semibold">Taken</span>
                ) : null}
              </span>
            </div>
          </Field>

          <Field label="City">
            <select
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full bg-secondary rounded-2xl px-4 py-3 text-sm font-semibold outline-none appearance-none focus:ring-2 focus:ring-foreground"
            >
              <option value="">Select city</option>
              {CITIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>

          <Field label="Position">
            <select
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              className="w-full bg-secondary rounded-2xl px-4 py-3 text-sm font-semibold outline-none appearance-none focus:ring-2 focus:ring-foreground"
            >
              <option value="">Select position</option>
              {POSITIONS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </Field>

          <Field label="Phone number">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+233..."
              className="w-full bg-secondary rounded-2xl px-4 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-foreground"
            />
          </Field>

          <Field label="Bio">
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="A little about yourself..."
              rows={3}
              className="w-full bg-secondary rounded-2xl px-4 py-3 text-sm font-semibold outline-none resize-none focus:ring-2 focus:ring-foreground"
            />
          </Field>
        </div>

        <button
          onClick={save}
          disabled={saving || (usernameAvail === false && username !== currentUsername)}
          className="w-full h-14 rounded-full bg-foreground text-background text-sm font-bold disabled:opacity-40 active:scale-[0.99]"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </main>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
    {children}
  </div>
);

export default EditProfile;
