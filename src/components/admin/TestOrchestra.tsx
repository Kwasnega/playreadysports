// filepath: src/components/admin/TestOrchestra.tsx
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Zap, Users, CheckCircle2, AlertTriangle, Wallet, Target, BarChart3,
  ChevronDown, Loader2, PlayCircle, PauseCircle, Trophy, Settings2, X
} from "lucide-react";

interface MatchBreakdown {
  matchId: string;
  title: string;
  status: string;
  participantCount: number;
  checkedIn: number;
  totalCollected: number;
  platformFee: number;
  venueShare: number;
  organizerShare: number;
  organizer: string;
  venue: string;
  entryFee: number;
}

export function TestOrchestra() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"fill" | "lifecycle" | "wallet" | "breakdown">("fill");
  const [loading, setLoading] = useState(false);
  const [matchId, setMatchId] = useState("");
  const [playerCount, setPlayerCount] = useState(10);
  const [checkinPercentage, setCheckinPercentage] = useState(100);
  const [topupAmount, setTopupAmount] = useState(500);
  const [breakdown, setBreakdown] = useState<MatchBreakdown | null>(null);

  const callTestHelper = async (action: string, params: any = {}) => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke("test-helpers", {
        body: { action, ...params },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      return data;
    } catch (err: any) {
      toast.error(err.message || "Test operation failed");
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Match Filling Tools
  const fillMatchWithPlayers = async (count: number) => {
    if (!matchId) {
      toast.error("Please enter a match ID");
      return;
    }
    const result = await callTestHelper("fill-match", { matchId, count });
    if (result) {
      toast.success(`✅ Filled match: ${result.joined} joined, ${result.failed} failed`);
      const errors = Array.isArray(result.errors) ? result.errors : [];
      if (errors.length > 0) {
        console.log("Errors:", errors);
      }
    }
  };

  const fillAndAutoLineup = async () => {
    if (!matchId) {
      toast.error("Please enter a match ID");
      return;
    }
    const fillResult = await callTestHelper("fill-match", { matchId, count: playerCount });
    if (fillResult) {
      toast.loading("Auto-assigning lineup...");
      const lineupResult = await callTestHelper("auto-lineup", { matchId });
      if (lineupResult) {
        toast.success(`✅ Filled (${fillResult.joined} players) + Auto-assigned (${lineupResult.assigned} positions)`);
      }
    }
  };

  // Match Lifecycle Controls
  const forceStartMatch = async () => {
    if (!matchId) {
      toast.error("Please enter a match ID");
      return;
    }
    const result = await callTestHelper("simulate-checkins", { matchId, percentage: 100 });
    if (result) {
      toast.success(`✅ Match marked as Live: ${result.checkedIn}/${result.total} checked in`);
    }
  };

  const forceCompleteMatch = async () => {
    if (!matchId) {
      toast.error("Please enter a match ID");
      return;
    }
    const result = await callTestHelper("force-complete", { matchId });
    if (result?.completed) {
      toast.success(`✅ Match completed!\n💰 Total: ₵${result.totalCollected}\n📊 Platform fee: ₵${result.platformFee}\n🎁 Organizer: ₵${result.organizerShare}`);
    }
  };

  const forceCancelMatch = async () => {
    if (!matchId) {
      toast.error("Please enter a match ID");
      return;
    }
    const result = await callTestHelper("force-cancel", { matchId });
    if (result?.cancelled) {
      toast.success(`✅ Match cancelled!\n💸 Refunded ${result.refunded} players: ₵${result.totalRefunded} total`);
    }
  };

  const simulateCheckins = async () => {
    if (!matchId) {
      toast.error("Please enter a match ID");
      return;
    }
    const result = await callTestHelper("simulate-checkins", { matchId, percentage: checkinPercentage });
    if (result) {
      toast.success(`✅ Check-ins: ${result.checkedIn}/${result.total} (${checkinPercentage}%)`);
    }
  };

  // Wallet Testing
  const bulkTopupWallets = async () => {
    const result = await callTestHelper("bulk-topup", { amount: topupAmount });
    if (result) {
      toast.success(`✅ Topped up ${result.toppedup} test wallets with ₵${result.amount}`);
    }
  };

  // Get Match Breakdown
  const showBreakdown = async () => {
    if (!matchId) {
      toast.error("Please enter a match ID");
      return;
    }
    const result = await callTestHelper("match-breakdown", { matchId });
    if (result?.matchId) {
      setBreakdown(result);
    }
  };

  // Full Scenario Buttons
  const runHappyPath = async () => {
    if (!matchId) {
      toast.error("Please enter a match ID");
      return;
    }
    try {
      setLoading(true);
      toast.loading("Running Happy Path scenario...");

      // 1. Fill match
      toast.loading("📊 Filling match with players...");
      const fillResult = await callTestHelper("fill-match", { matchId, count: 10 });
      if (!fillResult) return;

      // 2. Auto-lineup
      toast.loading("🏆 Auto-assigning lineup...");
      const lineupResult = await callTestHelper("auto-lineup", { matchId });
      if (!lineupResult) return;

      // 3. Check-ins (90%)
      toast.loading("✅ Simulating check-ins...");
      const checkinResult = await callTestHelper("simulate-checkins", { matchId, percentage: 90 });
      if (!checkinResult) return;

      // 4. Complete match
      toast.loading("⚡ Completing match...");
      const completeResult = await callTestHelper("force-complete", { matchId });
      if (!completeResult?.completed) return;

      // 5. Get breakdown
      const breakdown = await callTestHelper("match-breakdown", { matchId });
      if (breakdown?.matchId) {
        setBreakdown(breakdown);
      }

      toast.success(`✅ Happy Path Complete!\n📊 ${fillResult.joined} players → ${lineupResult.assigned} lineups → 💰 ₵${completeResult.totalCollected} collected`);
    } finally {
      setLoading(false);
    }
  };

  const runAutoCancel = async () => {
    if (!matchId) {
      toast.error("Please enter a match ID");
      return;
    }
    try {
      setLoading(true);
      toast.loading("Running Auto-Cancel scenario...");

      // 1. Fill partially
      toast.loading("📊 Partially filling match...");
      const fillResult = await callTestHelper("fill-match", { matchId, count: 5 });
      if (!fillResult) return;

      // 2. Cancel
      toast.loading("❌ Cancelling match...");
      const cancelResult = await callTestHelper("force-cancel", { matchId });
      if (!cancelResult?.cancelled) return;

      toast.success(`✅ Auto-Cancel Complete!\n💸 ${fillResult.joined} players refunded ₵${(fillResult.joined * fillResult.totalSpent) / fillResult.joined}`);
    } finally {
      setLoading(false);
    }
  };

  const runTurfOwnerFlow = async () => {
    if (!matchId) {
      toast.error("Please enter a match ID");
      return;
    }
    try {
      setLoading(true);
      toast.loading("Running Turf Owner Flow...");

      // 1. Fill and complete
      toast.loading("📊 Setting up match...");
      const fillResult = await callTestHelper("fill-match", { matchId, count: 10 });
      if (!fillResult) return;

      // 2. Auto-lineup
      toast.loading("🏆 Auto-assigning...");
      await callTestHelper("auto-lineup", { matchId });

      // 3. Complete
      toast.loading("⚡ Completing...");
      const completeResult = await callTestHelper("force-complete", { matchId });
      if (!completeResult?.completed) return;

      // 4. Breakdown
      const breakdown = await callTestHelper("match-breakdown", { matchId });
      if (breakdown?.matchId) {
        setBreakdown(breakdown);
      }

      toast.success(`✅ Turf Owner Flow Complete!\n🏟️ ${breakdown?.venue} earned ₵${breakdown?.venueShare}\n📊 Organizer earned ₵${breakdown?.organizerShare}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-xl hover:shadow-2xl transition-all flex items-center justify-center group"
        title="Open Test Orchestra"
      >
        <Zap className="w-6 h-6 group-hover:scale-110 transition-transform" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-96 max-h-[90vh] bg-[#0B1120] border border-purple-500/20 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-purple-500/20 bg-gradient-to-r from-purple-500/10 to-pink-500/10">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-purple-400" />
          <h2 className="font-bold text-white">Test Orchestra</h2>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="p-1 hover:bg-white/10 rounded-lg transition-colors"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-3 border-b border-purple-500/20 bg-black/30 overflow-x-auto">
        <button
          onClick={() => setActiveTab("fill")}
          className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
            activeTab === "fill"
              ? "bg-purple-500/30 text-purple-200"
              : "bg-white/5 text-gray-400 hover:bg-white/10"
          }`}
        >
          <Users className="w-3 h-3 inline mr-1" /> Fill
        </button>
        <button
          onClick={() => setActiveTab("lifecycle")}
          className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
            activeTab === "lifecycle"
              ? "bg-purple-500/30 text-purple-200"
              : "bg-white/5 text-gray-400 hover:bg-white/10"
          }`}
        >
          <PlayCircle className="w-3 h-3 inline mr-1" /> Lifecycle
        </button>
        <button
          onClick={() => setActiveTab("wallet")}
          className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
            activeTab === "wallet"
              ? "bg-purple-500/30 text-purple-200"
              : "bg-white/5 text-gray-400 hover:bg-white/10"
          }`}
        >
          <Wallet className="w-3 h-3 inline mr-1" /> Wallet
        </button>
        <button
          onClick={() => setActiveTab("breakdown")}
          className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
            activeTab === "breakdown"
              ? "bg-purple-500/30 text-purple-200"
              : "bg-white/5 text-gray-400 hover:bg-white/10"
          }`}
        >
          <BarChart3 className="w-3 h-3 inline mr-1" /> Analytics
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Match ID Input */}
        <div>
          <label className="text-xs font-bold text-gray-300 mb-1 block">Match ID</label>
          <input
            type="text"
            value={matchId}
            onChange={(e) => setMatchId(e.target.value)}
            placeholder="Enter match ID"
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-xs placeholder-gray-500 focus:outline-none focus:border-purple-500/50"
          />
        </div>

        {/* Fill Tab */}
        {activeTab === "fill" && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-gray-300 mb-1 block">Players to Add</label>
              <input
                type="number"
                value={playerCount}
                onChange={(e) => setPlayerCount(Number(e.target.value))}
                min="1"
                max="100"
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-xs"
              />
            </div>

            <button
              onClick={() => fillMatchWithPlayers(8)}
              disabled={loading}
              className="w-full px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded-lg text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Users className="w-3 h-3" />}
              Fill with 8 Players
            </button>

            <button
              onClick={() => fillMatchWithPlayers(12)}
              disabled={loading}
              className="w-full px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-300 rounded-lg text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Users className="w-3 h-3" />}
              Fill with 12 Players
            </button>

            <button
              onClick={() => fillMatchWithPlayers(playerCount)}
              disabled={loading}
              className="w-full px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 rounded-lg text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Users className="w-3 h-3" />}
              Fill with {playerCount} Players
            </button>

            <button
              onClick={fillAndAutoLineup}
              disabled={loading}
              className="w-full px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 rounded-lg text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trophy className="w-3 h-3" />}
              Fill + Auto Lineup
            </button>
          </div>
        )}

        {/* Lifecycle Tab */}
        {activeTab === "lifecycle" && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-gray-300 mb-1 block">Check-in %</label>
              <input
                type="number"
                value={checkinPercentage}
                onChange={(e) => setCheckinPercentage(Number(e.target.value))}
                min="0"
                max="100"
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-xs"
              />
            </div>

            <button
              onClick={simulateCheckins}
              disabled={loading}
              className="w-full px-4 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 rounded-lg text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
              Simulate {checkinPercentage}% Check-ins
            </button>

            <button
              onClick={forceStartMatch}
              disabled={loading}
              className="w-full px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-300 rounded-lg text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <PlayCircle className="w-3 h-3" />}
              Force Start Match
            </button>

            <button
              onClick={forceCompleteMatch}
              disabled={loading}
              className="w-full px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded-lg text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
              Force Complete
            </button>

            <button
              onClick={forceCancelMatch}
              disabled={loading}
              className="w-full px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <AlertTriangle className="w-3 h-3" />}
              Force Cancel
            </button>
          </div>
        )}

        {/* Wallet Tab */}
        {activeTab === "wallet" && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-gray-300 mb-1 block">Top-up Amount (₵)</label>
              <input
                type="number"
                value={topupAmount}
                onChange={(e) => setTopupAmount(Number(e.target.value))}
                min="0"
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-xs"
              />
            </div>

            <button
              onClick={bulkTopupWallets}
              disabled={loading}
              className="w-full px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-300 rounded-lg text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wallet className="w-3 h-3" />}
              Bulk Top-up ₵{topupAmount}
            </button>

            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <p className="text-xs text-blue-300">
                <strong>Info:</strong> Tops up all test accounts created during testing sessions
              </p>
            </div>
          </div>
        )}

        {/* Breakdown Tab */}
        {activeTab === "breakdown" && (
          <div className="space-y-3">
            <button
              onClick={showBreakdown}
              disabled={loading}
              className="w-full px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 rounded-lg text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <BarChart3 className="w-3 h-3" />}
              Get Breakdown
            </button>

            {breakdown && (
              <div className="space-y-2 p-3 bg-white/5 border border-white/10 rounded-lg">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-gray-400">Status</p>
                    <p className="font-bold text-white">{breakdown.status}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Players</p>
                    <p className="font-bold text-white">{breakdown.participantCount}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Check-in</p>
                    <p className="font-bold text-white">{breakdown.checkedIn}/{breakdown.participantCount}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Entry Fee</p>
                    <p className="font-bold text-white">₵{breakdown.entryFee}</p>
                  </div>
                </div>
                <div className="border-t border-white/10 pt-2 mt-2">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400">Total</span>
                    <span className="font-bold text-white">₵{breakdown.totalCollected.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400">Platform (5%)</span>
                    <span className="text-red-400">-₵{breakdown.platformFee.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400">Venue (50%)</span>
                    <span className="text-green-400">+₵{breakdown.venueShare.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs border-t border-white/10 pt-1 mt-1">
                    <span className="text-gray-400">Organizer</span>
                    <span className="text-purple-300 font-bold">+₵{breakdown.organizerShare.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Full Scenarios */}
        <div className="border-t border-purple-500/20 pt-3 mt-4">
          <p className="text-xs font-bold text-gray-300 mb-2">Full Scenarios</p>
          <div className="space-y-2">
            <button
              onClick={runHappyPath}
              disabled={loading}
              className="w-full px-3 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-300 rounded-lg text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
              Happy Path
            </button>

            <button
              onClick={runAutoCancel}
              disabled={loading}
              className="w-full px-3 py-2 bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 rounded-lg text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <AlertTriangle className="w-3 h-3" />}
              Auto-Cancel
            </button>

            <button
              onClick={runTurfOwnerFlow}
              disabled={loading}
              className="w-full px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded-lg text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Target className="w-3 h-3" />}
              Turf Owner Flow
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-purple-500/20 bg-black/50 text-center text-xs text-gray-500">
        <p>Test data only • Not for production</p>
      </div>
    </div>
  );
}
