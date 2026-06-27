// ============================================================
// Component: AdminMatches
// Real-time match dashboard with intelligent status display
// Sprint 5: Admin Panel
// ============================================================

import { useAdminMatches } from '@/hooks/useAdminMatches';
import { MatchStatusBadge } from '@/components/MatchStatusBadge';
import { CountdownTimer } from '@/components/CountdownTimer';
import { MapPin, Users, Calendar, AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MatchStatus } from '@/types/match-status';

/**
 * Admin matches dashboard
 * Shows all matches with real-time status and counts
 */
export function AdminMatches() {
  const { matches, isLoading, error, isRefetching, refetch } = useAdminMatches();

  // Group matches by status
  const matchesByStatus = {
    upcoming: matches.filter((m) => m.intelligent_status === 'upcoming'),
    soon: matches.filter((m) => m.intelligent_status === 'soon'),
    live_now: matches.filter((m) => m.intelligent_status === 'live_now'),
    ended: matches.filter((m) => m.intelligent_status === 'ended'),
    cancelled: matches.filter((m) => m.intelligent_status === 'cancelled'),
  };

  const stats = {
    total: matches.length,
    active: matchesByStatus.soon.length + matchesByStatus.live_now.length,
    cancelled: matchesByStatus.cancelled.length,
  };

  if (error) {
    return (
      <div className="p-6 space-y-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-red-900">Error Loading Matches</h3>
            <p className="text-sm text-red-800 mt-1">{error.message}</p>
            <button
              onClick={() => refetch()}
              className="mt-3 text-sm font-medium text-red-600 hover:text-red-700"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with stats */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Matches</h2>
          <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
            <span>Total: <strong>{stats.total}</strong></span>
            <span className="text-green-600">Active: <strong>{stats.active}</strong></span>
            <span className="text-red-600">Cancelled: <strong>{stats.cancelled}</strong></span>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isRefetching || isLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw
            className={cn('w-4 h-4', isRefetching && 'animate-spin')}
          />
          Refresh
        </button>
      </div>

      {/* Loading state */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 bg-gray-100 rounded-lg animate-pulse"
            />
          ))}
        </div>
      ) : matches.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>No matches found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Live Now (first) */}
          {matchesByStatus.live_now.length > 0 && (
            <MatchStatusSection
              title="🔴 Live Now"
              matches={matchesByStatus.live_now}
              bgClass="bg-green-50 border-green-200"
            />
          )}

          {/* Soon */}
          {matchesByStatus.soon.length > 0 && (
            <MatchStatusSection
              title="⚡ Starting Soon"
              matches={matchesByStatus.soon}
              bgClass="bg-yellow-50 border-yellow-200"
            />
          )}

          {/* Upcoming */}
          {matchesByStatus.upcoming.length > 0 && (
            <MatchStatusSection
              title="📅 Upcoming"
              matches={matchesByStatus.upcoming}
              bgClass="bg-blue-50 border-blue-200"
            />
          )}

          {/* Ended */}
          {matchesByStatus.ended.length > 0 && (
            <MatchStatusSection
              title="✓ Ended"
              matches={matchesByStatus.ended}
              bgClass="bg-gray-50 border-gray-200"
            />
          )}

          {/* Cancelled */}
          {matchesByStatus.cancelled.length > 0 && (
            <MatchStatusSection
              title="✕ Cancelled"
              matches={matchesByStatus.cancelled}
              bgClass="bg-red-50 border-red-200"
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Section for matches grouped by status
 */
function MatchStatusSection({
  title,
  matches,
  bgClass,
}: {
  title: string;
  matches: MatchStatus[];
  bgClass: string;
}) {
  return (
    <div className={cn('rounded-lg border p-4', bgClass)}>
      <h3 className="font-semibold mb-3">{title}</h3>
      <div className="space-y-2">
        {matches.map((match) => (
          <MatchRow key={match.id} match={match} />
        ))}
      </div>
    </div>
  );
}

/**
 * Single match row in admin table
 */
function MatchRow({ match }: { match: MatchStatus }) {
  const playerCount = match.current_player_count || 0;
  const minPlayers = match.min_players_required || 6;

  // Get status color
  const statusColorClass = {
    upcoming: 'text-blue-600',
    soon: 'text-yellow-600',
    live_now: 'text-green-600',
    ended: 'text-gray-600',
    cancelled: 'text-red-600',
  }[match.intelligent_status || 'upcoming'];

  return (
    <div className="bg-white rounded-lg p-3 flex items-center justify-between gap-4 border">
      {/* Match Info */}
      <div className="flex-1 min-w-0">
        <h4 className="font-medium truncate">{match.title || 'Match'}</h4>
        <div className="flex items-center gap-3 mt-1 text-xs text-gray-600">
          {match.venue_name && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {match.venue_name}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {new Date(match.match_date).toLocaleString()}
          </span>
          <span className={cn('flex items-center gap-1 font-medium', statusColorClass)}>
            <Users className="w-3 h-3" />
            {playerCount}/{minPlayers}
          </span>
        </div>
      </div>

      {/* Status Badge */}
      <div className="flex-shrink-0">
        <MatchStatusBadge status={match} size="sm" />
      </div>

      {/* Countdown/Action */}
      <div className="flex-shrink-0 text-xs font-mono">
        {match.intelligent_status === 'live_now' && (
          <span className="text-green-600 font-bold">LIVE</span>
        )}
        {match.intelligent_status === 'soon' && (
          <span className="text-yellow-600">
            {Math.max(
              0,
              Math.floor(
                (new Date(match.match_date).getTime() - new Date().getTime()) / 60000
              )
            )}
            m
          </span>
        )}
        {match.intelligent_status === 'upcoming' && (
          <span className="text-blue-600">
            {Math.max(
              0,
              Math.floor(
                (new Date(match.match_date).getTime() - new Date().getTime()) / 3600000
              )
            )}
            h
          </span>
        )}
        {match.intelligent_status === 'ended' && (
          <span className="text-gray-600">Done</span>
        )}
        {match.intelligent_status === 'cancelled' && (
          <span className="text-red-600">Cancelled</span>
        )}
      </div>

      {/* Action Button */}
      <button className="flex-shrink-0 px-3 py-1 text-xs rounded-lg border border-gray-300 hover:bg-gray-50 font-medium">
        View
      </button>
    </div>
  );
}
