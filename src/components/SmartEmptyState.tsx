// ============================================================
// Component: SmartEmptyState
// Empty state messages for various scenarios
// Sprint 4: React UI Components
// ============================================================

import React from 'react';
import { Button } from '@/components/ui/button';
import {
  InboxIcon,
  Calendar,
  Trophy,
  AlertCircle,
  Search,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type EmptyStateType =
  | 'no-matches'
  | 'no-upcoming'
  | 'no-results'
  | 'no-history'
  | 'cancelled'
  | 'error'
  | 'maintenance'
  | 'empty-schedule';

interface SmartEmptyStateProps {
  type?: EmptyStateType;
  title?: string;
  message?: string;
  icon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

/**
 * Empty state component with various scenarios
 * Shows appropriate icon, message, and action for different states
 */
export function SmartEmptyState({
  type = 'no-matches',
  title,
  message,
  icon,
  actionLabel,
  onAction,
  className = '',
}: SmartEmptyStateProps) {
  // Predefined states
  const states: Record<EmptyStateType, { title: string; message: string; icon: React.ReactNode; action?: string }> = {
    'no-matches': {
      title: 'No Matches Found',
      message: 'There are no matches available in your area. Check back soon!',
      icon: <Search className="w-16 h-16 text-gray-300" />,
      action: 'Browse All Matches',
    },
    'no-upcoming': {
      title: 'No Upcoming Matches',
      message: 'You haven\'t joined any upcoming matches yet. Browse and join one!',
      icon: <Calendar className="w-16 h-16 text-gray-300" />,
      action: 'Browse Matches',
    },
    'no-results': {
      title: 'No Results Found',
      message: 'Try adjusting your search filters or location.',
      icon: <Search className="w-16 h-16 text-gray-300" />,
    },
    'no-history': {
      title: 'No Match History',
      message: 'Your completed matches will appear here.',
      icon: <Trophy className="w-16 h-16 text-gray-300" />,
    },
    cancelled: {
      title: 'Match Cancelled',
      message: 'This match has been cancelled by the organizer.',
      icon: <AlertCircle className="w-16 h-16 text-red-300" />,
      action: 'Find Another Match',
    },
    error: {
      title: 'Something Went Wrong',
      message: 'We encountered an error loading matches. Please try again.',
      icon: <AlertCircle className="w-16 h-16 text-red-300" />,
      action: 'Retry',
    },
    maintenance: {
      title: 'Under Maintenance',
      message: 'We\'re performing scheduled maintenance. We\'ll be back soon!',
      icon: <Clock className="w-16 h-16 text-yellow-300" />,
    },
    'empty-schedule': {
      title: 'Empty Schedule',
      message: 'You haven\'t booked any matches yet. Start by joining a match!',
      icon: <InboxIcon className="w-16 h-16 text-gray-300" />,
      action: 'Browse Matches',
    },
  };

  const state = states[type];
  const displayTitle = title || state.title;
  const displayMessage = message || state.message;
  const displayIcon = icon || state.icon;
  const displayAction = actionLabel || state.action;

  return (
    <div className={cn('flex flex-col items-center justify-center py-12 px-6', className)}>
      {/* Icon */}
      <div className="mb-4">{displayIcon}</div>

      {/* Title */}
      <h3 className="text-xl font-semibold text-gray-900 mb-2 text-center">
        {displayTitle}
      </h3>

      {/* Message */}
      <p className="text-gray-600 text-center mb-6 max-w-sm">{displayMessage}</p>

      {/* Action Button */}
      {onAction && displayAction && (
        <Button onClick={onAction} size="lg">
          {displayAction}
        </Button>
      )}
    </div>
  );
}

/**
 * Empty state for when no matches are available
 */
export function NoMatchesEmpty({ onBrowse }: { onBrowse?: () => void }) {
  return (
    <SmartEmptyState
      type="no-matches"
      onAction={onBrowse}
    />
  );
}

/**
 * Empty state for no upcoming matches
 */
export function NoUpcomingEmpty({ onBrowse }: { onBrowse?: () => void }) {
  return (
    <SmartEmptyState
      type="no-upcoming"
      onAction={onBrowse}
    />
  );
}

/**
 * Empty state for search results
 */
export function NoSearchResults() {
  return <SmartEmptyState type="no-results" />;
}

/**
 * Empty state for match history
 */
export function NoMatchHistory() {
  return <SmartEmptyState type="no-history" />;
}

/**
 * Empty state for cancelled match
 */
export function MatchCancelledEmpty({ onFindAnother }: { onFindAnother?: () => void }) {
  return (
    <SmartEmptyState
      type="cancelled"
      onAction={onFindAnother}
    />
  );
}

/**
 * Empty state for errors
 */
export function ErrorEmpty({ onRetry }: { onRetry?: () => void }) {
  return (
    <SmartEmptyState
      type="error"
      onAction={onRetry}
    />
  );
}

/**
 * Empty state for maintenance
 */
export function MaintenanceEmpty() {
  return <SmartEmptyState type="maintenance" />;
}
