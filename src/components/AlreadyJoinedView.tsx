import React, { useState } from "react";
import {
  Clock, MapPin, Check, Camera, AlertCircle, ChevronDown, ChevronUp
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getFormattedTime } from "@/lib/matchHelpers";
import { QRScannerModal } from "@/components/lobby/QRScannerModal";

interface Participant {
  id: string;
  user_id: string;
  team: string;
  status: string;
  slot_type: string;
  payment_status: string;
  attendance_scanned?: boolean;
  profile?: {
    full_name: string | null;
    username: string | null;
    avatar_url?: string | null;
  } | null;
}

interface AlreadyJoinedViewProps {
  match: {
    id: string;
    join_code: string;
    match_mode: string;
    format: string;
    match_date: string;
    entry_fee: number;
    status: string;
    venue?: {
      name: string;
      city: string;
      area: string | null;
    } | null;
  };
  user: any;
  participants: Participant[];
  onRefresh: () => Promise<void> | void;
}

export const AlreadyJoinedView = ({
  match,
  user,
  participants,
  onRefresh,
}: AlreadyJoinedViewProps) => {
  const [scannerOpen, setScannerOpen] = useState(false);
  const [checkInCode, setCheckInCode] = useState("");
  const [checkInBusy, setCheckInBusy] = useState(false);
  const [showCheckInOptions, setShowCheckInOptions] = useState(false);

  const currentUserParticipant = participants.find((p) => p.user_id === user?.id);
  if (!currentUserParticipant) return null;

  const teamName = currentUserParticipant.team;
  const isCheckedIn = !!currentUserParticipant.attendance_scanned;

  // Check-in window logic (1.5 hours before to 2 hours after kickoff)
  const matchTimeMs = new Date(match.match_date).getTime();
  const nowMs = Date.now();
  const hoursUntilMatch = (matchTimeMs - nowMs) / (1000 * 60 * 60);
  const isMatchLiveForCheckIn =
    match.status !== "completed" &&
    match.status !== "cancelled" &&
    hoursUntilMatch <= 1.5 &&
    hoursUntilMatch >= -2;

  const formatTeamName = (team: string) => {
    if (team === "reds") return "Reds";
    if (team === "blues") return "Blues";
    if (team === "__substitute__") return "Substitute";
    return team.charAt(0).toUpperCase() + team.slice(1);
  };

  const submitCheckIn = async (codeVal: string) => {
    const sanitized = codeVal.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!sanitized) {
      toast.warning("Please enter a check-in code.");
      return;
    }
    if (sanitized.length !== 10) {
      toast.warning(`Code must be 10 characters — you entered ${sanitized.length}.`);
      return;
    }
    setCheckInBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("scan-match-qr", {
        body: { token: sanitized },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.already) {
        toast.info("You are already checked in! ✅");
      } else {
        const venueName = match.venue?.name ?? match.join_code;
        toast.success(`✅ You're checked in to ${venueName}!`);
      }
      await onRefresh();
    } catch (e: any) {
      const msg: string = e?.message ?? "";
      if (msg.includes("not registered")) {
        toast.error("You are not registered for this match.");
      } else if (msg.includes("already checked in") || msg.includes("already")) {
        toast.info("You are already checked in! ✅");
      } else if (msg.includes("not open for check-in") || msg.includes("cancelled") || msg.includes("completed")) {
        toast.error("This match is no longer open for check-in.");
      } else if (msg.includes("around match time")) {
        toast.error("Check-in is only available within 2 hours of match time.");
      } else if (msg.includes("payment") || msg.includes("paid")) {
        toast.error("Please complete your payment before checking in.");
      } else if (msg.includes("Invalid") || msg.includes("not found") || msg.includes("expired")) {
        toast.error("Invalid check-in code. Please check and try again.");
      } else if (msg.includes("active")) {
        toast.error("Only active match participants can check in.");
      } else {
        toast.error(msg || "Check-in failed. Please try again.");
      }
    } finally {
      setCheckInBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Registration Status Banner */}
      <div className="rounded-2xl border-2 border-foreground bg-foreground text-background p-5 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-background flex items-center justify-center text-foreground shrink-0">
            <Check className="w-5 h-5 font-black" />
          </div>
          <div>
            <h3 className="font-display font-black text-lg tracking-tight leading-tight">
              Registered!
            </h3>
            <p className="text-xs opacity-90 mt-0.5">
              You are already registered for this match as a{" "}
              <span className="font-black underline">
                {formatTeamName(teamName)}
              </span>
              .
            </p>
          </div>
        </div>
      </div>

      {/* Check-In Status */}
      <section className="bg-card border-2 border-border rounded-2xl p-5 shadow-sm">
        <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3 pb-2 border-b-2 border-dashed border-border flex items-center justify-between">
          <span>Pitch Attendance</span>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-sm text-[9px] font-black uppercase tracking-widest border ${
              isCheckedIn
                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                : "bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400"
            }`}
          >
            {isCheckedIn ? "Checked In" : "Not Checked In"}
          </span>
        </div>

        {isCheckedIn ? (
          <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-4 text-emerald-600 dark:text-emerald-400">
            <Check className="w-4 h-4 shrink-0" />
            <p className="text-xs font-bold uppercase tracking-wide">
              Your attendance has been verified. Have a great match!
            </p>
          </div>
        ) : isMatchLiveForCheckIn ? (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              The match is currently live/about to start. Tap below to scan the venue QR or enter the code manually.
            </p>
            {!showCheckInOptions ? (
              <button
                onClick={() => setShowCheckInOptions(true)}
                className="w-full h-12 inline-flex items-center justify-center gap-2 bg-foreground text-background rounded-xl text-xs font-black uppercase tracking-widest hover:opacity-90 active:scale-[0.99] transition-all"
              >
                <Camera className="w-4 h-4" /> Check In Now
              </button>
            ) : (
              <div className="space-y-4 pt-2">
                <button
                  onClick={() => setScannerOpen(true)}
                  disabled={checkInBusy}
                  className="w-full h-12 inline-flex items-center justify-center gap-2 bg-foreground text-background rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-50 hover:bg-foreground/90 transition-all"
                >
                  <Camera className="w-4 h-4" /> Scan QR Code
                </button>

                <div className="relative flex py-2 items-center">
                  <div className="flex-grow border-t border-border"></div>
                  <span className="flex-shrink mx-4 text-[9px] font-black uppercase tracking-widest text-muted-foreground">OR</span>
                  <div className="flex-grow border-t border-border"></div>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground block">
                    10-Char Manual Code
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={checkInCode}
                      onChange={(e) =>
                        setCheckInCode(
                          e.target.value
                            .toUpperCase()
                            .replace(/[^A-Z0-9]/g, "")
                            .slice(0, 10)
                        )
                      }
                      placeholder="E.G. A3K9M2X7Q1"
                      maxLength={10}
                      className="flex-1 rounded-xl border-2 border-border bg-background px-4 py-2.5 text-xs font-mono font-bold uppercase tracking-widest focus:outline-none focus:border-foreground"
                    />
                    <button
                      onClick={() => submitCheckIn(checkInCode)}
                      disabled={checkInBusy || checkInCode.length !== 10}
                      className="px-5 h-10 inline-flex items-center justify-center bg-foreground text-background rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-40 hover:opacity-90 transition-opacity"
                    >
                      {checkInBusy ? "..." : "Submit"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-start gap-2.5 bg-secondary/50 border border-border rounded-xl p-4">
            <AlertCircle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Check-in will become available 90 minutes before kickoff and remain open until 2 hours after.
            </p>
          </div>
        )}
      </section>

      {/* Match Details */}
      <section className="bg-card border-2 border-border rounded-2xl p-5 shadow-sm">
        <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3 pb-2 border-b-2 border-dashed border-border">
          Match Details
        </h4>
        <div className="space-y-3.5 text-xs text-foreground">
          <div className="flex items-start gap-3">
            <Clock className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="font-bold uppercase tracking-wider">Kickoff Time</p>
              <p className="text-muted-foreground font-semibold mt-0.5">
                {getFormattedTime(match.match_date)}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="font-bold uppercase tracking-wider">Venue Location</p>
              <p className="text-muted-foreground font-semibold mt-0.5">
                {match.venue?.name} · {match.venue?.area ?? match.venue?.city}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Teammates List */}
      <section className="bg-card border-2 border-border rounded-2xl p-5 shadow-sm">
        <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3 pb-2 border-b-2 border-dashed border-border">
          Teammates ({participants.length})
        </h4>
        <ul className="divide-y divide-border -my-1">
          {participants.map((p) => {
            const displayName =
              p.profile?.full_name ?? p.profile?.username ?? "Anonymous Player";
            const initials = displayName
              .split(" ")
              .map((n) => n.charAt(0))
              .join("")
              .toUpperCase()
              .slice(0, 2);

            return (
              <li key={p.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {p.profile?.avatar_url ? (
                    <img
                      src={p.profile.avatar_url}
                      alt={displayName}
                      className="w-7 h-7 rounded-full object-cover border border-border grayscale"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-[9px] font-black text-muted-foreground border border-border">
                      {initials}
                    </div>
                  )}
                  <span className="text-xs font-bold text-foreground truncate">
                    {displayName} {p.user_id === user?.id && "(You)"}
                  </span>
                </div>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-sm text-[8px] font-black uppercase tracking-widest border ${
                    p.team === "reds"
                      ? "border-red-500/30 text-red-600 bg-red-500/10"
                      : p.team === "blues"
                      ? "border-blue-500/30 text-blue-600 bg-blue-500/10"
                      : "border-border text-muted-foreground bg-secondary/50"
                  }`}
                >
                  {formatTeamName(p.team)}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {scannerOpen && (
        <QRScannerModal
          onScan={(value) => {
            setScannerOpen(false);
            submitCheckIn(value);
          }}
          onClose={() => setScannerOpen(false)}
        />
      )}
    </div>
  );
};
