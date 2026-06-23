/**
 * TypeScript Types for Smart Match Status System
 * All types needed for intelligent match status, countdowns, and notifications
 * Sprint 3: Frontend Intelligence Layer
 */

// ============================================================
// INTELLIGENT MATCH STATUS TYPES
// ============================================================

export type IntelligentMatchStatus = 
  | 'upcoming'
  | 'soon'
  | 'live_now'
  | 'ended'
  | 'cancelled'
  | 'archived';

export type ColorBadge = 'blue' | 'amber' | 'green' | 'gray' | 'red';
export type IconType = 'clock' | 'alert' | 'play' | 'check' | 'x' | 'archive';

/**
 * Match status returned from get_intelligent_match_status RPC
 */
export interface MatchStatus {
  status: IntelligentMatchStatus;
  display_text: string;
  color: ColorBadge;
  pulse: boolean;
  icon: IconType;
  can_join: boolean;
  urgent?: boolean;
  warning?: string;
  time_until_kickoff_minutes?: number;
  current_players?: number;
  max_players?: number;
  min_required?: number;
  should_auto_cancel?: boolean;
  should_auto_complete?: boolean;
  show_refund_info?: boolean;
  show_lineup_tab?: boolean;
  show_join_warning?: boolean;
  time_remaining_minutes?: number;
  reason?: string;
  error?: string | null;
}

export interface MatchWithStatus {
  id: string;
  title: string;
  organizer_id: string;
  venue_id?: string;
  match_date: string;
  booking_duration_minutes: number;
  entry_fee: number;
  maxCorePlayers: number;
  currentParticipantsCount: number;
  status: string;
  intelligentStatus: IntelligentMatchStatus;
  autoCompletedAt?: string;
  autoCancelledAt?: string;
  cancelledReason?: string;
  refundIssuedAt?: string;
  minPlayersRequired?: number;
}

// ============================================================
// COUNTDOWN TYPES
// ============================================================

export interface CountdownTime {
  displayText: string;
  timeUntilKickoffMs: number;
  isLive: boolean;
  isPast: boolean;
  shouldPulse: boolean;
  countdownExpired: boolean;
  hours?: number;
  minutes?: number;
  seconds?: number;
}

// ============================================================
// NOTIFICATION TYPES
// ============================================================

export type NotificationType =
  | 'auto_cancel'
  | 'auto_complete'
  | 'reminder_60m'
  | 'reminder_30m'
  | 'reminder_15m'
  | 'reminder_5m'
  | 'payout'
  | 'refund'
  | 'join_alert'
  | 'dispute'
  | 'system';

export interface SmartNotification {
  id: string;
  userId: string;
  matchId?: string;
  notificationType: NotificationType;
  title: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
  isRead: boolean;
  readAt?: string;
  createdAt: string;
  expiresAt: string;
}

// ============================================================
// HOOK RETURN TYPES
// ============================================================

export interface UseMatchStatusReturn {
  data: MatchStatus | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  subscribe: () => (() => void); // Unsubscribe function
}

export interface UseMatchCountdownReturn {
  displayText: string;
  timeUntilKickoffMs: number;
  isLive: boolean;
  isPast: boolean;
  shouldPulse: boolean;
  countdownExpired: boolean;
  hours?: number;
  minutes?: number;
  seconds?: number;
}

export interface UseSmartNotificationsReturn {
  notifications: SmartNotification[];
  unreadCount: number;
  markAsRead: (id: string) => Promise<void>;
  delete: (id: string) => Promise<void>;
  subscribe: () => (() => void);
  isLoading: boolean;
  error: Error | null;
}

export interface UseMatchAutoStatusReturn {
  status: MatchStatus | null;
  countdown: UseMatchCountdownReturn;
  isLoading: boolean;
  error: Error | null;
}

// ============================================================
// CONTEXT TYPES
// ============================================================

export interface MatchStatusSubscription {
  matchId: string;
  callbacks: Set<(status: MatchStatus) => void>;
  unsubscribe: () => void;
}

export interface MatchStatusContextType {
  getStatus: (matchId: string) => MatchStatus | undefined;
  subscribe: (
    matchId: string,
    callback: (status: MatchStatus) => void
  ) => () => void; // Returns unsubscribe function
  invalidate: (matchId: string) => void;
  invalidateAll: () => void;
  isReady: boolean;
}

// ============================================================
// ADMIN SETTINGS TYPES
// ============================================================

export interface AdminAutoSettings {
  autoCancelMinutesBefore: number;
  autoCancelMinPlayers?: number;
  autoCancelEnabled: boolean;
  autoCancelIfBelowPercentFull: number;
  enableAutoCompletion: boolean;
  checkinPercentageRequired: number;
  notificationStyle: 'toast' | 'in_app' | 'email' | 'all';
  refundRetryAttempts: number;
  refundRetryDelaySeconds: number;
  payoutProcessingDelayHours: number;
  enableDisputeAlerts: boolean;
  maxAutoActionsPerHour: number;
}

// ============================================================
// PAGINATION & FILTERING
// ============================================================

export interface MatchesFilter {
  status?: IntelligentMatchStatus | IntelligentMatchStatus[];
  searchQuery?: string;
  sortBy?: 'nearest' | 'fullest' | 'newest' | 'endingSoon';
  limit?: number;
  offset?: number;
}

export interface PaginatedMatches {
  matches: MatchWithStatus[];
  total: number;
  hasMore: boolean;
}

// ============================================================
// REAL-TIME SUBSCRIPTION TYPES
// ============================================================

export interface RealtimePayload<T> {
  old: T | null;
  new: T | null;
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  eventType: string;
  schema: string;
  table: string;
  commit_timestamp: string;
}

export interface SubscriptionConfig {
  enabled: boolean;
  debounceMs?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
}
