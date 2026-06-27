// ============================================================
// Component: AdminLiveMonitor
// Real-time scoreboard of active matches
// Sprint 5: Admin Panel
// ============================================================

import { useEffect, useState } from 'react';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { Activity, AlertCircle, Users, MapPin, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MatchStatus } from '@/types/match-status';

interface LiveMatchData extends MatchStatus {
  playerCountProgression?: Array<{ timestamp: Date; count: number }>;
  lastUpdate?: Date;
}

/**
 * Live match monitor
 * Shows real-time activity of currently active matches
 */
export function AdminLiveMonitor() {
  const supabase = useSupabaseClient();
  const [liveMatches, setLiveMatches] = useState<LiveMatchData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch live matches
   */
  useEffect(() => {
    if (!supabase) return;

    const fetchLiveMatches = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Fetch all matches
        const { data: matchesData, error: fetchError } = await supabase
          .from('matches')
          .select('*')
          .gt('match_date', new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()) // Last 3 hours
          .lt('match_date', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()); // Next 24 hours

        if (fetchError) throw fetchError;

        if (!matchesData) return;

        // Get intelligent status for matches
        const enriched: LiveMatchData[] = [];

        for (const match of matchesData) {
          try {
            const { data: statusData } = await supabase.rpc('get_intelligent_match_status', {
              p_match_id: match.id,
            });

            if (statusData) {
              enriched.push({
                ...match,
                ...statusData,
                lastUpdate: new Date(),
              });
            }
          } catch (err) {
            console.error(`Error enriching match ${match.id}:`, err);
          }
        }

        // Filter to only live and soon matches
        const active = enriched.filter(
          (m) => m.intelligent_status === 'live_now' || m.intelligent_status === 'soon'
        );

        setLiveMatches(active);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load live matches');
      } finally {
        setIsLoading(false);
      }
    };

    fetchLiveMatches();

    // Refresh every 30 seconds
    const interval = setInterval(fetchLiveMatches, 30000);

    return () => clearInterval(interval);
  }, [supabase]);

  // Stats
  const stats = {
    totalActive: liveMatches.length,
    live: liveMatches.filter((m) => m.intelligent_status === 'live_now').length,
    soon: liveMatches.filter((m) => m.intelligent_status === 'soon').length,
    totalPlayers: liveMatches.reduce((sum, m) => sum + (m.current_player_count || 0), 0),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Activity className="w-6 h-6 text-red-600 animate-pulse" />
          <h2 className="text-2xl font-bold">Live Monitor</h2>
        </div>
        <p className="text-gray-600 mt-1">Real-time activity across active matches</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard
          label="Active Matches"
          value={stats.totalActive}
          subtext={`${stats.live} live, ${stats.soon} soon`}
          icon={<Activity className="w-5 h-5" />}
        />
        <StatCard
          label="Players Online"
          value={stats.totalPlayers}
          subtext="across all matches"
          icon={<Users className="w-5 h-5" />}
        />
        <StatCard
          label="Average Players"
          value={
            stats.totalActive > 0
              ? Math.round(stats.totalPlayers / stats.totalActive)
              : 0
          }
          subtext="per match"
          icon={<Trophy className="w-5 h-5" />}
        />
        <StatCard
          label="Matches This Week"
          value="-"
          subtext="Coming soon"
          icon={<AlertCircle className="w-5 h-5" />}
        />
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-red-900">Error Loading Live Data</h3>
            <p className="text-sm text-red-800">{error}</p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : liveMatches.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
          <Activity className="w-12 h-12 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-600 font-medium">No active matches right now</p>
          <p className="text-gray-500 text-sm">Check back soon for live matches</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Live Now (first) */}
          {liveMatches
            .filter((m) => m.intelligent_status === 'live_now')
            .map((match) => (
              <LiveMatchCard key={match.id} match={match} />
            ))}

          {/* Starting Soon */}
          {liveMatches
            .filter((m) => m.intelligent_status === 'soon')
            .map((match) => (
              <LiveMatchCard key={match.id} match={match} />
            ))}
        </div>
      )}
    </div>
  );
}

/**
 * Stat card component
 */
function StatCard({
  label,
  value,
  subtext,
  icon,
}: {
  label: string;
  value: number | string;
  subtext: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          <p className="text-xs text-gray-500 mt-1">{subtext}</p>
        </div>
        <div className="text-gray-400">{icon}</div>
      </div>
    </div>
  );
}

/**
 * Live match card with real-time updates
 */
function LiveMatchCard({ match }: { match: LiveMatchData }) {
  const isLive = match.intelligent_status === 'live_now';
  const playerCount = match.current_player_count || 0;
  const minPlayers = match.min_players_required || 6;

  const timeUntilEnd = new Date(
    new Date(match.match_date).getTime() + (match.booking_duration_minutes || 60) * 60 * 1000
  ).getTime() - new Date().getTime();

  const timeUntilStart =
    new Date(match.match_date).getTime() - new Date().getTime();

  let timeDisplay = '';
  if (isLive && timeUntilEnd > 0) {
    const mins = Math.floor(timeUntilEnd / 60000);
    timeDisplay = `${mins} min left`;
  } else if (!isLive && timeUntilStart > 0) {
    const mins = Math.floor(timeUntilStart / 60000);
    timeDisplay = `Starts in ${mins} min`;
  }

  return (
    <div
      className={cn(
        'rounded-lg border p-4 transition-all',
        isLive
          ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-300 shadow-lg shadow-green-500/10'
          : 'bg-yellow-50 border-yellow-300'
      )}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Match Info */}
        <div>
          <h3 className="font-bold text-lg">{match.title || 'Match'}</h3>
          {match.venue_name && (
            <p className="text-sm text-gray-600 flex items-center gap-1 mt-1">
              <MapPin className="w-4 h-4" />
              {match.venue_name}
            </p>
          )}
          <div className="mt-2">
            {isLive ? (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-600 text-white text-xs font-bold">
                <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                LIVE NOW
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-600 text-white text-xs font-bold">
                Starting Soon
              </span>
            )}
          </div>
        </div>

        {/* Player Count */}
        <div className="flex flex-col justify-center">
          <p className="text-sm text-gray-600">Player Activity</p>
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              <span className="text-2xl font-bold">{playerCount}</span>
              <span className="text-sm text-gray-600">/ {minPlayers}</span>
            </div>
            <div className="w-full bg-gray-300 rounded-full h-2">
              <div
                className={cn(
                  'h-2 rounded-full transition-all',
                  playerCount >= minPlayers ? 'bg-green-500' : 'bg-yellow-500'
                )}
                style={{ width: `${Math.min(100, (playerCount / minPlayers) * 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Time & Actions */}
        <div className="flex flex-col justify-between">
          <div>
            <p className="text-sm text-gray-600">Time</p>
            <p className="text-lg font-bold mt-1">{timeDisplay}</p>
          </div>
          <div className="flex gap-2">
            <button className="flex-1 px-3 py-2 rounded-lg bg-white border border-gray-300 hover:bg-gray-50 text-sm font-medium">
              View
            </button>
            <button className="flex-1 px-3 py-2 rounded-lg bg-white border border-gray-300 hover:bg-gray-50 text-sm font-medium">
              Actions
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
