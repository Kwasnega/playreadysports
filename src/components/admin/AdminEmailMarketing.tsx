import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Mail, Send, Loader2, Users, Copy, Check, Trash2,
  AlertTriangle, Info, History
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface EmailLog {
  id: string;
  subject: string;
  recipient_count: number;
  sent_at: string;
  body: string;
}

export default function AdminEmailMarketing() {
  const [tab, setTab] = useState<"send" | "history">("send");
  
  // Send tab state
  const [campaignName, setCampaignName] = useState("");
  const [subject, setSubject] = useState("Vote for PlayReady Sports in the Moolre Competition!");
  const [emailBody, setEmailBody] = useState(`
Hi there!

We're excited to let you know that PlayReady Sports is participating in the Moolre competition!

We'd love your support. Click the link below to vote for us:

---

Thank you for your support!

Best regards,
PlayReady Sports Team
  `.trim());
  
  const [votingLink, setVotingLink] = useState("");
  const [recipientType, setRecipientType] = useState<"all_users" | "venue_owners" | "players" | "custom">("all_users");
  const [customEmails, setCustomEmails] = useState("");
  const [sending, setSending] = useState(false);
  const [recipientCount, setRecipientCount] = useState(0);
  const [copied, setCopied] = useState(false);

  // History tab state
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Fetch potential recipients based on type
  const fetchRecipientCount = async () => {
    try {
      if (recipientType === "custom") {
        const emails = customEmails.split("\n").filter((e) => e.trim());
        setRecipientCount(emails.length);
        return;
      }

      let q = supabase.from("profiles").select("id", { count: "exact", head: true });

      if (recipientType === "venue_owners") {
        q = q.neq("is_admin", true).not("is_admin", "is", null); // Venue owners, not all players
      } else if (recipientType === "players") {
        q = q.eq("is_admin", false); // Regular players
      }

      const { count } = await q;
      setRecipientCount(count || 0);
    } catch (err: any) {
      console.error("Failed to fetch recipient count:", err);
    }
  };

  useEffect(() => {
    fetchRecipientCount();
  }, [recipientType, customEmails]);

  // Fetch email history
  const fetchEmailHistory = async () => {
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from("email_logs")
        .select("id, subject, recipient_count, sent_at, body")
        .order("sent_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setEmailLogs((data as EmailLog[]) || []);
    } catch (err: any) {
      toast.error("Failed to load email history");
      console.error(err);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "history") {
      fetchEmailHistory();
    }
  }, [tab]);

  // Get recipient emails based on type
  const getRecipientEmails = async (): Promise<string[]> => {
    if (recipientType === "custom") {
      return customEmails
        .split("\n")
        .map((e) => e.trim())
        .filter((e) => e && e.includes("@"));
    }

    let q = supabase.from("profiles").select("email");

    if (recipientType === "venue_owners") {
      q = q.neq("is_admin", true).not("is_admin", "is", null);
    } else if (recipientType === "players") {
      q = q.eq("is_admin", false);
    }

    const { data, error } = await q;
    if (error) throw error;

    return (data as any[])
      .map((p) => p.email)
      .filter((e): e is string => !!e && e.includes("@"));
  };

  // Send campaign
  const handleSendCampaign = async () => {
    if (!subject.trim()) {
      toast.error("Subject is required");
      return;
    }

    if (!emailBody.trim()) {
      toast.error("Email body is required");
      return;
    }

    if (recipientCount === 0) {
      toast.error("No recipients selected");
      return;
    }

    if (!confirm(`Send email to ${recipientCount} recipients?\n\nThis cannot be undone.`)) {
      return;
    }

    setSending(true);
    try {
      // Get session token
      const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr || !session?.access_token) {
        throw new Error("Not authenticated");
      }

      // Fetch recipient emails
      const recipients = await getRecipientEmails();
      if (recipients.length === 0) {
        toast.error("No valid email addresses found");
        return;
      }

      // Call edge function
      const response = await fetch(
        `${supabase.supabaseUrl}/functions/v1/send-bulk-email`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            recipients,
            subject,
            body: emailBody,
            votingLink: votingLink || undefined,
            campaignName: campaignName || "Campaign",
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to send emails");
      }

      toast.success(
        `Campaign sent! Delivered: ${result.sent}/${result.total}${result.failed > 0 ? `, Failed: ${result.failed}` : ""}`
      );

      // Reset form
      setCampaignName("");
      setSubject("");
      setEmailBody("");
      setVotingLink("");
      setCustomEmails("");

      // Refresh history
      await fetchEmailHistory();
    } catch (err: any) {
      toast.error(err.message || "Failed to send campaign");
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setTab("send")}
          className={`px-4 py-2 border-b-2 transition ${
            tab === "send"
              ? "border-orange-500 text-orange-600"
              : "border-transparent text-gray-600 hover:text-gray-900"
          }`}
        >
          <Mail className="w-4 h-4 inline mr-2" />
          Send Campaign
        </button>
        <button
          onClick={() => setTab("history")}
          className={`px-4 py-2 border-b-2 transition ${
            tab === "history"
              ? "border-orange-500 text-orange-600"
              : "border-transparent text-gray-600 hover:text-gray-900"
          }`}
        >
          <History className="w-4 h-4 inline mr-2" />
          History
        </button>
      </div>

      {tab === "send" && (
        <div className="space-y-6">
          {/* Campaign info banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
            <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              Send emails to your users with voting links or any marketing message. All emails are logged for auditing.
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Campaign Name */}
            <div>
              <label className="block text-sm font-medium mb-2">Campaign Name</label>
              <Input
                placeholder="e.g., Moolre Voting Campaign"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
              />
            </div>

            {/* Recipient Type */}
            <div>
              <label className="block text-sm font-medium mb-2">Recipients</label>
              <select
                value={recipientType}
                onChange={(e) => setRecipientType(e.target.value as any)}
                className="w-full px-3 py-2 border rounded-md bg-white"
              >
                <option value="all_users">All Users</option>
                <option value="venue_owners">Venue Owners Only</option>
                <option value="players">Players Only</option>
                <option value="custom">Custom Email List</option>
              </select>
            </div>
          </div>

          {/* Custom emails */}
          {recipientType === "custom" && (
            <div>
              <label className="block text-sm font-medium mb-2">Email Addresses (one per line)</label>
              <Textarea
                placeholder="user1@example.com&#10;user2@example.com&#10;user3@example.com"
                value={customEmails}
                onChange={(e) => setCustomEmails(e.target.value)}
                rows={4}
              />
            </div>
          )}

          {/* Voting Link */}
          <div>
            <label className="block text-sm font-medium mb-2">Moolre Voting Link (Optional)</label>
            <div className="flex gap-2">
              <Input
                placeholder="https://moolre.com/vote/..."
                value={votingLink}
                onChange={(e) => setVotingLink(e.target.value)}
              />
              {votingLink && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(votingLink);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              )}
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium mb-2">Subject Line</label>
            <Input
              placeholder="Email subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          {/* Email Body */}
          <div>
            <label className="block text-sm font-medium mb-2">Email Body (HTML supported)</label>
            <Textarea
              placeholder="Write your email message here..."
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              rows={8}
            />
          </div>

          {/* Summary & Send */}
          <div className="bg-gray-50 border rounded-lg p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <Users className="w-4 h-4 text-gray-600" />
              <span className="font-medium">Recipients: {recipientCount}</span>
            </div>

            <Button
              onClick={handleSendCampaign}
              disabled={sending || recipientCount === 0 || !subject.trim() || !emailBody.trim()}
              size="lg"
              className="w-full bg-orange-600 hover:bg-orange-700"
            >
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Send Campaign to {recipientCount} Recipients
                </>
              )}
            </Button>

            <p className="text-xs text-gray-500">
              ⚠️ Once sent, emails cannot be unsent. This action will be logged for auditing.
            </p>
          </div>
        </div>
      )}

      {tab === "history" && (
        <div className="space-y-4">
          {historyLoading ? (
            <div className="text-center py-8">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
            </div>
          ) : emailLogs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No email campaigns sent yet
            </div>
          ) : (
            <div className="space-y-3">
              {emailLogs.map((log) => (
                <div key={log.id} className="border rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium">{log.subject}</h4>
                      <p className="text-sm text-gray-600 mt-1">
                        Sent to {log.recipient_count} recipients
                      </p>
                      <p className="text-xs text-gray-500 mt-2">
                        {new Date(log.sent_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
