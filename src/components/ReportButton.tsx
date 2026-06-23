import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Flag, X, AlertTriangle } from "lucide-react";

interface ReportButtonProps {
  reportedUserId?: string;
  matchId?: string;
  reportedName?: string;
  size?: "sm" | "md";
}

const REASONS = [
  "No-show / ghosting",
  "Toxic behaviour",
  "Late payment",
  "Match fixing",
  "Poor sportsmanship",
  "Safety concern",
  "Spam / scam",
  "Other",
];

export default function ReportButton({ reportedUserId, matchId, reportedName, size = "sm" }: ReportButtonProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!reason) { toast.error("Select a reason"); return; }
    if (!reportedUserId && !matchId) { toast.error("Nothing to report"); return; }

    setSubmitting(true);
    const { error } = await supabase.from("reports").insert({
      reported_user_id: reportedUserId || null,
      match_id: matchId || null,
      reason,
      description: description.trim() || null,
    });
    setSubmitting(false);

    if (error) {
      toast.error(error.message || "Failed to submit report");
    } else {
      toast.success("Report submitted. Admins will review it.");
      setOpen(false);
      setReason("");
      setDescription("");
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 rounded-lg text-destructive hover:bg-destructive/10 transition-all ${
          size === "sm" ? "px-2 py-1 text-[11px] font-medium" : "px-3 py-1.5 text-xs font-semibold"
        }`}
      >
        <Flag className={size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5"} /> Report
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">Report {reportedName || "issue"}</h2>
                <p className="text-xs text-muted-foreground">Reports are anonymous to other players.</p>
              </div>
            </div>

            <label className="block text-xs text-muted-foreground mb-1.5">Reason</label>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {REASONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setReason(r)}
                  className={`text-left px-3 py-2 rounded-xl text-xs font-medium transition-all border ${
                    reason === r
                      ? "bg-destructive/10 text-destructive border-destructive/20"
                      : "bg-background text-muted-foreground border-border hover:bg-secondary"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            <label className="block text-xs text-muted-foreground mb-1.5">Details (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what happened..."
              rows={3}
              className="w-full rounded-xl bg-background border border-border p-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-foreground transition-all resize-none mb-4"
            />

            <div className="flex gap-3">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-secondary text-foreground text-sm font-semibold hover:bg-secondary/80 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={submitting}
                className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 transition-all disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Submit Report"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
