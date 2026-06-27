# PlayReady Sports: Deep Professionalism & Smart App Audit Plan

**Branch**: `moolre-migration`  
**Date**: 2026-06-18  
**Goal**: Transform app from "dumb UI" to "intelligent, professional, always-accurate" platform

---

## PHASE 1: DATABASE SCHEMA & BACKEND FUNCTIONS

### 1.1 New Database Fields on `matches` Table

```sql
-- Booking & Timing Intelligence
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS booking_duration_minutes INT DEFAULT 90;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS min_players_required INT DEFAULT NULL; -- NULL = use max_core_players
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS status_last_updated_at TIMESTAMPTZ DEFAULT now();

-- Auto-Lifecycle Management
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS auto_cancelled_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS auto_completed_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS final_status TEXT DEFAULT NULL; -- 'completed', 'auto_cancelled', 'user_cancelled', 'archived'

-- Caching & Performance
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS current_participants_count INT DEFAULT 0;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS is_full BOOLEAN DEFAULT FALSE;

-- Escrow & Payment Safety
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS refund_issued_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS refund_notes TEXT DEFAULT NULL;
```

### 1.2 New Tables

#### `match_status_history`
Tracks every status change for audit + replay capability:
```sql
CREATE TABLE IF NOT EXISTS public.match_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT,
  triggered_by TEXT, -- 'auto_cancel', 'auto_complete', 'user', 'admin', 'system'
  triggered_by_user_id uuid REFERENCES public.profiles(id),
  reason TEXT, -- "Insufficient players", "Booking duration expired", etc.
  created_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB -- Additional context
);

CREATE INDEX idx_match_status_history_match ON public.match_status_history(match_id);
CREATE INDEX idx_match_status_history_created ON public.match_status_history(created_at DESC);
```

#### `smart_notifications`
Enhanced notifications system for auto-actions:
```sql
CREATE TABLE IF NOT EXISTS public.smart_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  match_id uuid REFERENCES public.matches(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL, -- 'auto_cancel', 'auto_complete', 'reminder_1h', 'reminder_30m', 'payout', 'refund'
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  action_url TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '30 days'),
  UNIQUE(user_id, notification_type, match_id)
);

CREATE INDEX idx_smart_notif_user ON public.smart_notifications(user_id, is_read);
CREATE INDEX idx_smart_notif_match ON public.smart_notifications(match_id);
```

#### `match_auto_actions_log`
Audit trail for all automated actions:
```sql
CREATE TABLE IF NOT EXISTS public.match_auto_actions_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL, -- 'auto_cancel_check', 'auto_cancel_executed', 'auto_complete_executed', 'reminder_sent'
  status_before TEXT,
  status_after TEXT,
  success BOOLEAN,
  error_message TEXT,
  affected_users INT,
  metadata JSONB,
  executed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_auto_actions_match ON public.match_auto_actions_log(match_id);
CREATE INDEX idx_auto_actions_executed ON public.match_auto_actions_log(executed_at DESC);
```

### 1.3 PostgreSQL Functions & RPCs

#### `get_match_intelligent_status(match_id)`
**Core Logic**: Single source of truth for match status everywhere in app
```
RETURNS: {
  status: "upcoming" | "live" | "ended" | "cancelled" | "archived",
  display_text: "Starts in 2h 15m" | "LIVE NOW" | "Ended 45m ago",
  time_until_kickoff_minutes: INT,
  is_live: BOOLEAN,
  is_cancelled: BOOLEAN,
  is_completed: BOOLEAN,
  show_countdown: BOOLEAN,
  countdown_text: "2h 15m" | "30m" | "15m" | "5m" | "LIVE" | "ended",
  color_badge: "green" | "amber" | "red" | "gray",
  icon: "clock" | "play" | "check" | "x" | "archive",
  can_join: BOOLEAN,
  reason_if_cant_join: TEXT,
  auto_cancel_at: TIMESTAMPTZ,
  auto_complete_at: TIMESTAMPTZ,
  metadata: {
    participants: INT,
    max_players: INT,
    is_full: BOOLEAN
  }
}
```

**Logic**:
```
IF cancelled_at IS NOT NULL:
  - status = "cancelled"
  - display_text = "Match Cancelled" + reason
  - can_join = FALSE
  
IF auto_cancelled_at IS NOT NULL:
  - status = "cancelled"
  - display_text = "Auto-cancelled (insufficient players)"
  - can_join = FALSE

IF auto_completed_at IS NOT NULL:
  - status = "ended"
  - display_text = "Match Ended"
  
IF now() >= kickoff_time + booking_duration_minutes:
  - status = "ended"
  - display_text = "Ended X minutes ago"
  - can_join = FALSE
  
IF now() >= kickoff_time:
  - status = "live"
  - display_text = "LIVE NOW"
  - color_badge = "red" (pulsing)
  - can_join = FALSE
  
IF now() BETWEEN (kickoff_time - 20 min) AND kickoff_time:
  - Check participants >= min_required
  - If NOT: auto_cancel + notify all
  
IF now() < kickoff_time:
  - status = "upcoming"
  - display_text = "Starts in X hours Y minutes"
  - countdown_text = human-friendly format
```

#### `check_and_auto_cancel_insufficient_players()`
**Purpose**: Scheduled job to run every 5 minutes, 20 min before each kickoff
```
FOR each match WHERE:
  - status = 'confirmed'
  - kickoff_time BETWEEN now() - 5min AND now() + 20min
  - current_participants_count < min_players_required
  
DO:
  - Set status = 'cancelled'
  - Set auto_cancelled_at = now()
  - Issue full refund via Moolre (async)
  - Insert into match_status_history
  - Create smart_notifications for all participants
  - Log action in match_auto_actions_log
```

#### `check_and_auto_complete_expired_bookings()`
**Purpose**: Scheduled job to run every 5 minutes
```
FOR each match WHERE:
  - status IN ('confirmed', 'live')
  - now() >= (kickoff_time + booking_duration_minutes)
  - NOT already auto_completed
  
DO:
  - Set status = 'completed'
  - Set auto_completed_at = now()
  - Release escrow (mark as settled)
  - Calculate payouts, update wallets (or queue for payout)
  - Insert into match_status_history
  - Create notifications
  - Log action
```

#### `get_match_display_countdown(match_id)`
**Returns**: Human-friendly countdown string
```
Examples:
- "Today 4:30 PM"
- "Tomorrow 6:00 PM"
- "Starts in 2h 15m"
- "Starts in 45m"
- "Starts in 15m"
- "Starts in 5m"
- "LIVE NOW"
- "Ended 2h 15m ago"
- "Cancelled"

Logic: Never show negative time, never show 00:00:00
```

---

## PHASE 2: FRONTEND ARCHITECTURE

### 2.1 New Custom Hooks

#### `useMatchStatus(matchId)`
```typescript
Returns: {
  status: MatchIntelligentStatus;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  subscribe: () => Unsubscribe; // Real-time updates
}

// Real-time subscription:
- Listens to match row changes
- Listens to match_status_history inserts
- Auto-updates display immediately
```

#### `useMatchCountdown(matchId)`
```typescript
Returns: {
  displayText: string;
  timeUntilKickoff: number; // milliseconds
  isLive: boolean;
  isPast: boolean;
  shouldPulse: boolean;
}

// Updates every second, stops after match is past
```

#### `useSmartNotifications(userId)`
```typescript
Returns: {
  notifications: SmartNotification[];
  unreadCount: number;
  markAsRead: (id) => Promise<void>;
  delete: (id) => Promise<void>;
  subscribe: () => Unsubscribe;
}
```

### 2.2 New Context/Providers

#### `MatchStatusContext`
```typescript
Provides: {
  getStatus: (matchId) => MatchIntelligentStatus;
  subscribe: (matchId) => Unsubscribe;
  invalidate: (matchId) => void;
}

// Centralized caching layer to prevent duplicate subscriptions
// Useful for pages showing many match cards
```

### 2.3 UI Components

#### `SmartMatchCard`
```typescript
// Single source of truth for match card rendering
Props: {
  match: Match;
  showCountdown?: boolean;
  showParticipants?: boolean;
  onClick?: () => void;
}

Features:
- Uses useMatchStatus hook
- Auto-updates status
- Smart color coding
- Countdown display
- "Can't join" indicators
- Loading skeleton state
```

#### `MatchStatusBadge`
```typescript
// Reusable status display component
Props: {
  status: string;
  displayText: string;
  isPulsing?: boolean;
  size?: "sm" | "md" | "lg";
}

Renders: Colored badge with icon + text
```

#### `CountdownTimer`
```typescript
// Reusable countdown display
Props: {
  targetTime: Date;
  onTimeReached?: () => void;
  format?: "full" | "compact" | "live";
}

Features:
- Never shows negative time
- Auto-stops at 00:00
- Pulsing when < 5 min
- "LIVE NOW" state
```

#### `SmartEmptyState`
```typescript
// Consistent empty states across app
Props: {
  type: "no_matches" | "no_lineups" | "no_notifications" | "no_results";
  action?: { label: string; onClick: () => void };
}
```

#### `SkeletonLoader`
```typescript
// Loading placeholders for all major sections
// Variants: match-card, match-list, lineup-grid, table-row, etc.
```

---

## PHASE 3: PAGES & SCREENS TO FIX

### 3.1 User-Facing Pages

**Priority HIGH:**

1. **`src/pages/Home.tsx`**
   - Fix stale match displays
   - Add real-time subscriptions
   - Show only active (upcoming/live) matches
   - Move completed/cancelled to separate tab/filter
   - Smart loading states

2. **`src/pages/Lobby.tsx`**
   - Show "Match Ended" or "Cancelled" clearly
   - Prevent joining ended matches
   - Show final status with explanations
   - Auto-refresh status every 5 sec

3. **`src/pages/BrowseMatches.tsx`**
   - Use SmartMatchCard everywhere
   - Filter: Upcoming, Live, Past, Cancelled
   - Show real-time participant counts
   - Smart sorting

4. **`src/pages/MySchedule.tsx`**
   - Real-time status updates
   - Section: "Upcoming", "Live", "Completed", "Cancelled"
   - Show countdown for upcoming
   - Show payouts for completed

5. **`src/pages/Wallet.tsx`**
   - Show pending refunds clearly
   - Show auto-cancellation refunds with explanation
   - Timestamp for when refund was issued
   - Link to match that triggered refund

6. **`src/pages/Recommendations.tsx`**
   - Real-time match updates
   - Filter out cancelled/ended matches
   - Show only joinable matches

### 3.2 Admin Panel Pages (CRITICAL)

**Priority CRITICAL** — These are currently "broken" showing stale data:

1. **`src/components/admin/AdminMatches.tsx`**
   - Fix color coding (green = live, amber = upcoming, gray = ended, red = cancelled)
   - Add real-time subscriptions
   - Show match count by status at top
   - Add "Last Updated" timestamp
   - Show participant counts
   - One-click manual cancel/complete (with audit trail)
   - Search/filter by status
   - Show auto-action metadata

2. **`src/components/admin/AdminCalendar.tsx`**
   - Calendar cells must show correct colors based on ACTUAL match state
   - Past dates should be grayed out
   - Today should highlight current live matches
   - Tooltips showing status + countdown
   - Real-time updates

3. **`src/components/admin/AdminLiveMonitor.tsx`**
   - Real-time scoreboard of all active matches
   - Show: Match ID, Status, Participants, Time Remaining, Actions
   - Sort by: Most Recent, Ending Soon, Most Full
   - Live data, never stale
   - Quick-action buttons (resolve disputes, manually complete, etc.)

4. **`src/components/admin/AdminSettings.tsx`** (NEW/ENHANCED)
   - Setting: `auto_cancel_minutes_before_kickoff` (default: 20)
   - Setting: `auto_cancel_if_below_percent_full` (default: 0%, OFF by default)
   - Setting: `auto_cancel_min_players` (or use match.max_core_players)
   - Setting: `enable_auto_completion` (default: true)
   - Setting: `notification_style` (toast vs in-app vs email)

### 3.3 Turf Owner Dashboard

**Priority HIGH:**

1. **`TurfOwnerDashboard`** (or wherever it exists)
   - Show all matches for owner's venues
   - Real-time status for each
   - Show auto-actions that happened
   - Show revenue/payouts
   - Alerts if match is about to auto-cancel
   - "Action Needed" section

---

## PHASE 4: NOTIFICATION & MESSAGING SYSTEM

### 4.1 Smart Notification Types

**Auto-Triggered Notifications:**

1. **Auto-Cancel Notification** (20 min before kickoff if insufficient)
   ```
   Title: "Match Cancelled: Insufficient Players"
   Message: "YourMatch at VenueX has been cancelled. 
             Only 3/8 players joined. 
             Full refund of ₦5,000 has been processed."
   Action: "View Refund" → links to Wallet
   ```

2. **Auto-Complete Notification** (immediately after duration expires)
   ```
   Title: "Match Completed!"
   Message: "YourMatch at VenueX is now completed.
             Payouts will be processed within 24h."
   Action: "View Details" → Match results
   ```

3. **Reminder Notifications**
   ```
   - 1 hour before: "Match starts in 1 hour"
   - 30 min before: "Match starts in 30 minutes"
   - 15 min before: "Match starts in 15 minutes"
   - 5 min before: "Match starting VERY SOON"
   ```

4. **Player Join Notifications** (to organizer)
   ```
   Title: "Player Joined"
   Message: "John just joined. 6/8 spots filled."
   ```

5. **Match Ending Soon** (if not yet auto-completed)
   ```
   Title: "Match Ending Soon"
   Message: "Your booking ends in 5 minutes. Match will auto-complete."
   ```

### 4.2 Notification Delivery Channels

- **In-App**: smart_notifications table + real-time subscriptions
- **Toast**: Immediate alerts (join, auto-cancel, etc.)
- **Badge**: Unread count on notification icon
- **Future**: Email, SMS (if configured)

---

## PHASE 5: MATCH FLOW & LIFECYCLE

### Complete Match Lifecycle with Intelligence

```
1. CREATION (confirmed)
   - Create match record
   - Set booking_duration_minutes
   - Set min_players_required
   - Send confirmation to organizer

2. RECRUITING (upcoming)
   - Show countdown "Starts in Xh Ym"
   - Send join reminders
   - Real-time participant count display
   - Check: Is it full? Display badge

3. AUTO-CANCEL CHECK (20 min before kickoff)
   - Scheduled job runs
   - Check: participants >= min_players?
   - NO → Auto-cancel + refund all participants
   - YES → Continue

4. ACTIVE PLAY (confirmed → live → near-end)
   - Status changes to LIVE at kickoff time
   - Display "LIVE NOW" with pulsing indicator
   - Start booking duration timer

5. AUTO-COMPLETION (at kickoff_time + booking_duration_minutes)
   - Status changes to COMPLETED
   - Release escrow, process payouts
   - Show final status to all participants

6. POST-MATCH (completed)
   - Show match results, payouts
   - Allow reviews/ratings
   - Archive from main feeds
   - Move to "Completed Matches" section
```

---

## PHASE 6: PERFORMANCE & CACHING

### 6.1 Caching Strategy

**Frontend:**
```typescript
- useMatchStatus hook: Cache match status for 10 seconds
- useMatchCountdown: Never cache, always real-time
- MatchStatusContext: Deduplicate subscriptions
- React Query/SWR: Cache GET requests with 30s revalidate
```

**Backend:**
```sql
- materialized_view: match_with_status (includes all computed fields)
- Refresh every 1 min OR on trigger
- Indexes on: match_id, status, kickoff_time, created_at
```

### 6.2 Real-Time Subscriptions

```
- Only subscribe to changes, not polling
- Supabase realtime filters:
  - match_lineups filtered by match_id + user.id
  - matches filtered by status + organizer_id or user is participant
  - smart_notifications filtered by user_id
  - match_status_history filtered by match_id
```

---

## PHASE 7: ERROR HANDLING & EDGE CASES

### 7.1 Error Scenarios

1. **Auto-cancel fails to process refund**
   - Retry queue (3x with exponential backoff)
   - Admin alert
   - Manual refund button

2. **User tries to join cancelled match**
   - Show: "This match was cancelled"
   - Reason: "Insufficient players"
   - Button: "Browse other matches"

3. **Network failure during status update**
   - Show: "Unable to load match status"
   - Button: "Retry"
   - Fallback: Show cached status with "last updated X min ago"

4. **Organizer is offline when auto-complete happens**
   - Auto-complete proceeds anyway
   - Notification queued
   - Wallet updated regardless

### 7.2 Data Consistency

- Use database constraints (NOT NULL, CHECK, UNIQUE) aggressively
- Match status field is SINGLE SOURCE OF TRUTH
- All displays computed from status function
- No manual status updates except via RPC/trigger

---

## PHASE 8: IMPLEMENTATION ROADMAP

### Sprint 1: Database Foundation (Day 1)
- [ ] Create migration with new fields, tables, indexes
- [ ] Create PostgreSQL functions: `get_match_intelligent_status`, `get_match_display_countdown`
- [ ] Create scheduled jobs: `check_and_auto_cancel_insufficient_players`, `check_and_auto_complete_expired_bookings`
- [ ] Set up smart_notifications table + subscription

### Sprint 2: Backend Functions (Day 1-2)
- [ ] Implement auto-cancel RPC
- [ ] Implement auto-complete RPC
- [ ] Add audit logging
- [ ] Add Moolre refund API integration
- [ ] Test: Auto-cancel flow end-to-end
- [ ] Test: Auto-complete flow end-to-end

### Sprint 3: Frontend Hooks & Context (Day 2)
- [ ] `useMatchStatus` hook
- [ ] `useMatchCountdown` hook
- [ ] `useSmartNotifications` hook
- [ ] `MatchStatusContext`
- [ ] Real-time subscription setup

### Sprint 4: UI Components (Day 2-3)
- [ ] `SmartMatchCard`
- [ ] `MatchStatusBadge`
- [ ] `CountdownTimer`
- [ ] `SmartEmptyState`
- [ ] `SkeletonLoader` variants
- [ ] `NotificationCenter`

### Sprint 5: Pages - User-Facing (Day 3)
- [ ] Fix Home.tsx
- [ ] Fix Lobby.tsx (show ended state clearly)
- [ ] Fix BrowseMatches.tsx
- [ ] Fix MySchedule.tsx
- [ ] Fix Wallet.tsx (refund display)
- [ ] Fix Recommendations.tsx

### Sprint 6: Pages - Admin Panel (Day 3-4) **CRITICAL**
- [ ] Fix AdminMatches.tsx (real-time + correct colors)
- [ ] Fix AdminCalendar.tsx (status-aware coloring)
- [ ] Fix AdminLiveMonitor.tsx (true real-time)
- [ ] Enhance AdminSettings.tsx (auto-action configs)
- [ ] Add audit trail viewer

### Sprint 7: Polish & Testing (Day 4-5)
- [ ] Test all notification flows
- [ ] Test auto-cancel with edge cases
- [ ] Test auto-complete with escrow release
- [ ] Test countdown timers (never negative)
- [ ] Test empty states on all pages
- [ ] Test real-time updates (multiple users)
- [ ] Performance testing (many matches on screen)

### Sprint 8: Deployment & Monitoring (Day 5)
- [ ] Deploy migration
- [ ] Deploy functions
- [ ] Deploy frontend changes
- [ ] Monitor auto-action jobs
- [ ] Rollout to production

---

## PHASE 9: VALIDATION CHECKLIST

### Before Merging PR:

- [ ] No hardcoded "upcoming" or stale statuses anywhere
- [ ] All match cards use SmartMatchCard or consistent status logic
- [ ] Countdown timers never show negative time
- [ ] Admin calendar colors reflect actual match state
- [ ] Auto-cancel refunds fully implemented + tested
- [ ] Auto-complete payouts fully implemented + tested
- [ ] All notifications are actionable + have clear context
- [ ] Empty states are beautiful (not blank/broken)
- [ ] Loading states (skeleton) on all major sections
- [ ] Real-time subscriptions working (test with 2+ clients)
- [ ] Cancelled/Ended matches can't be joined
- [ ] Cancelled matches show reason to user
- [ ] Old notifications auto-expire after 30 days
- [ ] Rate limiting has friendly feedback messages
- [ ] No silent failures (all errors have user feedback)
- [ ] Date/time formatting consistent everywhere
- [ ] Buttons disabled while loading
- [ ] Success/error states after actions
- [ ] Refunds show clearly in Wallet with timestamp + match link
- [ ] Admin audit trail captures all auto-actions
- [ ] Turf owner dashboard shows real-time data
- [ ] Test with slow network (3G) - check timeout handling

---

## PHASE 10: FILE STRUCTURE TO CREATE/MODIFY

### New Files to Create:
```
src/types/match-status.ts          (types for status system)
src/hooks/useMatchStatus.ts        (new hook)
src/hooks/useMatchCountdown.ts     (new hook)
src/hooks/useSmartNotifications.ts (new hook)
src/context/MatchStatusContext.tsx (new context)
src/components/ui/SmartMatchCard.tsx
src/components/ui/MatchStatusBadge.tsx
src/components/ui/CountdownTimer.tsx
src/components/ui/SmartEmptyState.tsx
src/components/ui/SkeletonLoader.tsx
src/components/ui/NotificationCenter.tsx
src/lib/match-status.ts            (utility functions)
src/lib/notifications.ts           (notification helpers)
backend/supabase/migrations/20260618_*_smart_match_system.sql
backend/supabase/functions/match-auto-cancel/
backend/supabase/functions/match-auto-complete/
```

### Files to Modify (Priority):
```
CRITICAL:
- src/components/admin/AdminMatches.tsx
- src/components/admin/AdminCalendar.tsx
- src/components/admin/AdminLiveMonitor.tsx

HIGH:
- src/pages/Home.tsx
- src/pages/Lobby.tsx
- src/pages/BrowseMatches.tsx
- src/pages/MySchedule.tsx
- src/pages/Wallet.tsx

MEDIUM:
- src/pages/Recommendations.tsx
- src/App.tsx (add MatchStatusContext provider)
- dashboard components (if TurfOwner dashboard exists)
```

---

## Key Principles

1. **Single Source of Truth**: Match status always computed from `get_match_intelligent_status` function
2. **Real-Time First**: All data that can change uses subscriptions, never polling
3. **Never Stale**: UI updates immediately when data changes
4. **User-Centric**: Every message is clear, friendly, actionable
5. **Professional**: No broken UI, no negative time, no blank screens
6. **Auditable**: Every action logged, traceable
7. **Resilient**: Graceful errors, helpful feedback, automatic retries
8. **Accessible**: Empty states, loading states, error states all designed

---

**Next Step**: Approve this plan, then I'll implement PHASE 1 (Database & Functions) first.
