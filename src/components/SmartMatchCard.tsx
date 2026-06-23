// ============================================================
// Component: SmartMatchCard
// Main match card using useMatchAutoStatus hook
// Sprint 4: React UI Components
// ============================================================

import React from 'react';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MatchStatusBadge } from './MatchStatusBadge';
import { CountdownTimer } from './CountdownTimer';
import { SkeletonLoader } from './SkeletonLoader';
import { MapPin, Users } from 'lucide-react';
import { useMatchAutoStatus } from '@/hooks/useMatchAutoStatus';
import { cn } from '@/lib/utils';

interface SmartMatchCardProps {
  matchId: string;
  matchDate: string | Date;
  bookingDurationMinutes?: number;
  venueTitle?: string;
  location?: string;
  playerCount?: number;
  minPlayers?: number;
  maxPlayers?: number;
  price?: number;
  onJoin?: () => void;
  onView?: () => void;
  className?: string;
  compact?: boolean;
}

/**
 * Smart match card component
 * Displays match with real-time status and countdown
 * Uses useMatchAutoStatus hook for automatic updates
 */
export function SmartMatchCard({
  matchId,
  matchDate,
  bookingDurationMinutes = 60,
  venueTitle = 'Match',
  location = 'Location',
  playerCount = 0,
  minPlayers = 8,
  maxPlayers = 22,
  price = 0,
  onJoin,
  onView,
  className = '',
  compact = false,
}: SmartMatchCardProps) {
  const { status, countdown, isLoading, error } = useMatchAutoStatus(
    matchId,
    matchDate,
    bookingDurationMinutes
  );

  if (isLoading) {
    return <SkeletonLoader variant="card" />;
  }

  if (error) {
    return (
      <Card className={cn('border-red-200 bg-red-50', className)}>
        <CardContent className="pt-6">
          <p className="text-red-600 text-sm">Failed to load match details</p>
        </CardContent>
      </Card>
    );
  }

  const isFull = playerCount >= maxPlayers;
  const isJoinable = !countdown.isPast && !isFull;

  if (compact) {
    return (
      <CompactSmartMatchCard
        status={status}
        countdown={countdown}
        venueTitle={venueTitle}
        playerCount={playerCount}
        maxPlayers={maxPlayers}
        className={className}
        onJoin={onJoin}
      />
    );
  }

  return (
    <Card className={cn('hover:shadow-lg transition-shadow', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900">{venueTitle}</h3>
            <div className="flex items-center gap-1 text-sm text-gray-600 mt-1">
              <MapPin className="w-4 h-4" />
              {location}
            </div>
          </div>
          <MatchStatusBadge status={status?.status} size="md" />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Countdown */}
        <div>
          <p className="text-xs text-gray-500 mb-2">Match Time</p>
          <CountdownTimer
            displayText={countdown.displayText}
            shouldPulse={countdown.shouldPulse}
            isLive={countdown.isLive}
            isPast={countdown.isPast}
            variant="large"
          />
        </div>

        {/* Player Count */}
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-gray-600" />
          <div className="flex-1">
            <p className="text-sm">
              <span className="font-semibold text-gray-900">{playerCount}</span>
              <span className="text-gray-600">/{maxPlayers} players</span>
            </p>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
              <div
                className={cn(
                  'h-2 rounded-full transition-all',
                  isFull ? 'bg-red-500' : 'bg-green-500'
                )}
                style={{
                  width: `${Math.min((playerCount / maxPlayers) * 100, 100)}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Price */}
        {price > 0 && (
          <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
            <span className="text-gray-600">Price per player</span>
            <span className="text-lg font-bold text-gray-900">₦{price.toLocaleString()}</span>
          </div>
        )}

        {/* Match Status Details */}
        {status && (
          <div className="text-xs text-gray-500 space-y-1">
            {status.status === 'cancelled' && status.reason && (
              <p className="text-red-600">
                <span className="font-semibold">Cancelled:</span> {status.reason}
              </p>
            )}
            {countdown.isLive && (
              <p className="text-green-600 font-semibold">Match is currently live!</p>
            )}
            {countdown.isPast && !countdown.isLive && (
              <p className="text-gray-600">This match has ended.</p>
            )}
          </div>
        )}
      </CardContent>

      <CardFooter className="gap-2 pt-3">
        {onView && (
          <Button variant="outline" className="flex-1" onClick={onView}>
            View Details
          </Button>
        )}
        {onJoin && (
          <Button
            className="flex-1"
            onClick={onJoin}
            disabled={!isJoinable}
            variant={countdown.isPast ? 'ghost' : 'default'}
          >
            {isFull ? 'Full' : countdown.isPast ? 'Ended' : 'Join Match'}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

/**
 * Compact version of SmartMatchCard (for lists)
 */
function CompactSmartMatchCard({
  status,
  countdown,
  venueTitle,
  playerCount,
  maxPlayers,
  className = '',
  onJoin,
}: {
  status: any;
  countdown: any;
  venueTitle: string;
  playerCount: number;
  maxPlayers: number;
  className?: string;
  onJoin?: () => void;
}) {
  const isFull = playerCount >= maxPlayers;

  return (
    <Card className={cn('p-4', className)}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h4 className="text-sm font-semibold text-gray-900 truncate">{venueTitle}</h4>
            <MatchStatusBadge status={status?.status} showText={false} size="sm" />
          </div>
          <p className="text-xs text-gray-600">{countdown.displayText}</p>
          <p className="text-xs text-gray-500 mt-1">
            {playerCount}/{maxPlayers} players
          </p>
        </div>

        {onJoin && (
          <Button
            size="sm"
            onClick={onJoin}
            disabled={isFull || countdown.isPast}
            variant={countdown.isPast ? 'ghost' : 'default'}
          >
            {isFull ? 'Full' : 'Join'}
          </Button>
        )}
      </div>
    </Card>
  );
}
