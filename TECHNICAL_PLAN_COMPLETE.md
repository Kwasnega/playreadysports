# PlayReady Sports: Complete Technical Plan for Professionalism & Smart App Audit
**Branch**: `moolre-migration`  
**Date**: 2026-06-18  
**Goal**: Transform app from "dumb UI" to "intelligent, professional, always-accurate" platform  
**Status**: PHASE 1 partially complete (database migrations created), PHASE 2-10 ready for implementation

---

## EXECUTIVE SUMMARY

This plan transforms PlayReady Sports into a truly professional app by implementing:

1. **Smart Match Intelligence System** — All matches have automatic lifecycle management
2. **Real-Time Status Sync** — No stale data ever; everything updates instantly
3. **Professional UX** — No broken states, beautiful loading/empty states, smart notifications
4. **Automated Safeguards** — Auto-cancellation, auto-completion, intelligent refunds
5. **Admin Panel Overhaul** — Real-time monitoring, accurate status colors, audit trails

---

## PART 1: DATABASE LAYER (Migrations Created ✅)

### 1.1 New Database Columns on `matches` Table ✅

The following columns have been added via migrations **20260618000000** and **20260618000001**:

```sql
-- Booking & Timing Intelligence
booking_duration_minutes INT DEFAULT 60
min_players_required INT NULL  -- If NULL, use max_core_players

-- Auto-Lifecycle Management  
auto_cancelled_at TIMESTAMPTZ
auto_completed_at TIMESTAMPTZ
cancelled_reason TEXT  -- 'auto_low_players', 'organizer_cancel', etc.
final_status TEXT  -- 'completed', 'cancelled', 'archived'

-- Status Tracking
intelligent_status intelligent_match_status  -- ENUM: upcoming, soon, live_now, ended, cancelled, archived
status_last_updated_at TIMESTAMPTZ

-- Additional Safety Features (NEW - Recommended)
last_status_check_at TIMESTAMPTZ  -- When auto-check job last ran
checkin_percentage_required INT DEFAULT 50  -- % of players who must check-in for auto-complete
is_checkin_complete BOOLEAN DEFAULT FALSE

-- Caching & Performance
current_participants_count INT DEFAULT 0
is_full BOOLEAN DEFAULT FALSE

-- Escrow & Payment Safety
refund_issued_at TIMESTAMPTZ
refund_notes TEXT
```

### 1.2 New Intelligent Match Status Enum ✅

```sql
CREATE TYPE public.intelligent_match_status AS ENUM (
  'upcoming',      -- > 20 minutes until kickoff
  'soon',          -- 20 minutes until kickoff (URGENT)
  'live_now',      -- Currently playing (within booking duration)
  'ended',         -- Past end time
  'cancelled',     -- Auto-cancelled or user-cancelled
  'archived'       -- Completed and old (for cleanup)
);
```

### 1.3 New Tables ✅

#### `match_status_history` — Audit trail for every status change
```sql
CREATE TABLE public.match_status_history (
  id uuid PRIMARY KEY,
  match_id uuid REFERENCES matches(id),
  old_status TEXT,
  new_status TEXT,
  intelligent_status_before intelligent_match_status,
  intelligent_status_after intelligent_match_status,
  triggered_by TEXT,  -- 'auto_cancel', 'auto_complete', 'user_organizer', 'admin', 'system'
  triggered_by_user_id uuid REFERENCES profiles(id),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB
);
```

#### `smart_notifications` — Enhanced notifications system
```sql
CREATE TABLE public.smart_notifications (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES profiles(id),
  match_id uuid REFERENCES matches(id),
  notification_type TEXT,  
  -- 'auto_cancel', 'auto_complete', 'reminder_60m', 'reminder_30m', 
  -- 'reminder_15m', 'reminder_5m', 'payout', 'refund', 'join_alert'
  title TEXT,
  message TEXT,
  action_url TEXT,
  action_label TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '30 days')
);
```

#### `match_auto_actions_log` — Complete audit trail for automation
```sql
CREATE TABLE public.match_auto_actions_log (
  id uuid PRIMARY KEY,
  match_id uuid REFERENCES matches(id),
  action_type TEXT,  
  -- 'auto_cancel_check', 'auto_cancel_executed', 'auto_complete_executed', 
  -- 'reminder_sent', 'refund_issued', 'payout_queued'
  status_before TEXT,
  status_after TEXT,
  intelligent_status_before intelligent_match_status,
  intelligent_status_after intelligent_match_status,
  success BOOLEAN,
  error_message TEXT,
  affected_users INT,
  metadata JSONB,
  executed_at TIMESTAMPTZ DEFAULT now()
);
```

#### `admin_auto_settings` — NEW Table for admin configuration
```sql
CREATE TABLE IF NOT EXISTS public.admin_auto_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id)
);

-- Seed with defaults:
-- auto_cancel_minutes_before: 20 (min before kickoff to check)
-- auto_cancel_min_players: NULL (use max_core_players)
-- auto_cancel_if_below_percent_full: 0 (0% = OFF)
-- enable_auto_completion: true
-- checkin_percentage_required: 50 (safety guard)
-- notification_style: 'toast'
```

---

## PART 2: BACKEND FUNCTIONS & RPC Layer (Migrations Created ✅)

### 2.1 Core Intelligence Functions ✅

#### `get_intelligent_match_status(match_id)` ✅

**Returns**: Single source of truth for match state across entire app

```jsonc
{
  "status": "upcoming" | "soon" | "live_now" | "ended" | "cancelled" | "archived",
  "intelligent_status": "upcoming" | "soon" | "live_now" | "ended" | "cancelled",
  "display_text": "Starts in 2h 15m" | "Starts in 15m" | "LIVE NOW" | "Match Ended" | "Match Cancelled",
  "color": "blue" | "amber" | "green" | "gray" | "red",
  "pulse": true | false,
  "icon": "clock" | "alert" | "play" | "check" | "x",
  "can_join": true | false,
  "urgent": true | false,
  "warning": "Only 3/8 players joined",
  "time_until_kickoff_minutes": 45,
  "current_players": 3,
  "max_players": 8,
  "min_required": 4,
  "should_auto_cancel": true | false,
  "show_refund_info": true | false,
  "show_lineup_tab": true | false,
  "error": null | "error message"
}
```

**Logic Flow:**
- If cancelled → return "cancelled" state with reason
- If completed/ended → return "ended" state
- If now past (kickoff + booking_duration) → return "ended" + flag should_auto_complete
- If during booking period → return "live_now" with pulsing badge
- If within 20 min of kickoff → return "soon" (urgent)
  - Check player count vs min_required
  - If insufficient players detected → flag should_auto_cancel
- If > 20 min away → return "upcoming" with countdown
  - If < 21 min away AND < min_required → show "at risk" warning

#### `get_match_display_countdown(match_id)` ✅

**Returns**: Human-friendly countdown string for UI display

Examples:
- `"Starts in 2h 15m"`
- `"Starts in 45m"`
- `"Starts in 15m"`
- `"Starts in 5m"`
- `"LIVE NOW"`
- `"Ended"` or `"Ended 30m ago"`
- `"Cancelled"`

**Logic**: Never show negative time, never show 00:00:00, always be human-readable.

### 2.2 Automation Functions (Scheduled Jobs) ✅

#### `auto_cancel_low_player_matches()` ✅

**Purpose**: Scheduled to run every 5 minutes  
**Scope**: Check matches 20 minutes before kickoff

```
FOR each match WHERE:
  - status IN ('upcoming', 'confirmed')
  - match_date between NOW and NOW + 20 min
  - current_participants_count < min_players_required
  
DO:
  1. Set status = 'cancelled'
  2. Set auto_cancelled_at = now()
  3. Set cancelled_reason = 'auto_low_players'
  4. Set intelligent_status = 'cancelled'
  5. Issue FULL REFUND via Moolre RPC (async, with retry logic)
  6. Insert into match_status_history
  7. Create smart_notifications for all affected participants
  8. Log action in match_auto_actions_log
  9. Send admin alert if refund fails
```

#### `auto_complete_expired_bookings()` ✅

**Purpose**: Scheduled to run every 5 minutes  
**Scope**: Complete matches past their booking end time

```
FOR each match WHERE:
  - status IN ('confirmed', 'live')
  - now() >= (match_date + booking_duration_minutes)
  - auto_completed_at IS NULL
  - (Optional) checkin_percentage >= checkin_percentage_required
  
DO:
  1. Set status = 'completed'
  2. Set auto_completed_at = now()
  3. Set intelligent_status = 'ended'
  4. Release escrow funds
  5. Queue payouts for all confirmed participants
  6. Insert into match_status_history
  7. Create smart_notifications: "Match Completed! Payouts processing..."
  8. Log action in match_auto_actions_log
```

### 2.3 New RPC Endpoints Needed ✅

```sql
-- Get settings for admin configuration
get_admin_auto_settings()  -- Returns all settings as JSON

-- Update a single setting
update_admin_auto_setting(setting_key TEXT, value TEXT)

-- Get match with full status + participant data
get_match_with_status(match_id)
  RETURNS: {match, intelligent_status, participant_count, is_full}

-- Mark match as manually completed (admin override)
admin_force_complete_match(match_id, reason TEXT)

-- Mark match as manually cancelled (admin override)
admin_force_cancel_match(match_id, reason TEXT, refund_amount DECIMAL)

-- Get all active matches for admin dashboard
get_all_matches_by_status(status TEXT, limit INT)
```

### 2.4 Edge Case Handling ✅

**Important Safety Guards:**

1. **Auto-Complete Safety** (NEW RECOMMENDATION)
   ```
   Only auto-complete if:
   - Match has at least 50% of core players who checked in via QR
   - OR admin has manually verified the match happened
   - Prevents unfair payouts for matches that didn't happen
   ```

2. **Refund Failure Handling**
   ```
   If Moolre refund fails:
   - Retry up to 3x with exponential backoff
   - Log error with full context
   - Create admin alert notification
   - Mark in match_status_history with error details
   - Player can manually claim refund from admin
   ```

3. **Double-Cancellation Prevention**
   ```
   Before auto-cancel:
   - Check if already cancelled_at IS NOT NULL
   - Skip if already processed
   ```

4. **Data Consistency**
   ```
   - Match status field is SINGLE SOURCE OF TRUTH
   - Never update status without creating status_history entry
   - Use database constraints (NOT NULL, CHECK) aggressively
   ```

---

## PART 3: FRONTEND ARCHITECTURE

### 3.1 New Hooks to Create 🔴 TODO

#### `useMatchStatus(matchId)` — Real-time intelligent match status

```typescript
interface UseMatchStatusReturn {
  data: {
    status: string;
    intelligent_status: string;
    displayText: string;
    color: string;
    pulse: boolean;
    icon: string;
    canJoin: boolean;
    urgent: boolean;
    timeUntilKickoffMinutes: number;
    currentPlayers: number;
    maxPlayers: number;
    shouldAutoCancel: boolean;
    warning?: string;
  };
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  subscribe: () => (() => void);  // Unsubscribe function
}

// Real-time subscription with Supabase:
// - Listens to matches row changes
// - Listens to match_status_history inserts
// - Auto-updates display immediately
```

**File**: `src/hooks/useMatchStatus.ts`

#### `useMatchCountdown(matchId)` — Real-time countdown timer

```typescript
interface UseMatchCountdownReturn {
  displayText: string;  // "Starts in 2h 15m", "LIVE NOW", "Ended", etc.
  timeUntilKickoffMs: number;  // milliseconds
  isLive: boolean;
  isPast: boolean;
  shouldPulse: boolean;
  countdownExpired: boolean;
}

// Updates every 1 second
// Stops after match is past kickoff + booking_duration
// Never shows negative time
```

**File**: `src/hooks/useMatchCountdown.ts`

#### `useSmartNotifications(userId)` — Smart notification management

```typescript
interface UseSmartNotificationsReturn {
  notifications: SmartNotification[];
  unreadCount: number;
  markAsRead: (id: string) => Promise<void>;
  delete: (id: string) => Promise<void>;
  subscribe: () => (() => void);
  isLoading: boolean;
}
```

**File**: `src/hooks/useSmartNotifications.ts`

#### `useMatchAutoStatus(matchId)` — Combined status + countdown (convenience hook)

```typescript
interface UseMatchAutoStatusReturn {
  status: ReturnType<useMatchStatus>['data'];
  countdown: ReturnType<useMatchCountdown>;
  isLoading: boolean;
  error: Error | null;
}

// Combines useMatchStatus + useMatchCountdown for match cards
```

**File**: `src/hooks/useMatchAutoStatus.ts`

### 3.2 Context Providers to Create 🔴 TODO

#### `MatchStatusContext` — Centralized caching for match statuses

```typescript
interface MatchStatusContextType {
  getStatus: (matchId: string) => MatchStatus | undefined;
  subscribe: (matchId: string, callback: (status: MatchStatus) => void) => () => void;
  invalidate: (matchId: string) => void;
  invalidateAll: () => void;
}

// Purpose: Prevent duplicate subscriptions when many matches on screen
// Benefits: Single subscription per match ID, shared across components
```

**File**: `src/context/MatchStatusContext.tsx`

**Usage in App.tsx**: Wrap root with `<MatchStatusProvider>`

### 3.3 New UI Components to Create 🔴 TODO

#### `SmartMatchCard` — Single source of truth for match card rendering

```typescript
interface SmartMatchCardProps {
  match: Match;
  showCountdown?: boolean;  // Default: true
  showParticipants?: boolean;  // Default: true
  showJoinButton?: boolean;  // Default: false (for browse/recommendations)
  onClick?: () => void;
  className?: string;
}

// Features:
// - Uses useMatchStatus + useMatchCountdown hooks
// - Auto-updates status every second
// - Smart color coding (blue→amber→green→gray→red)
// - Countdown display with pulsing when < 5 min
// - "Can't join" indicators with reasons
// - Loading skeleton state while fetching
// - No stale data ever
```

**File**: `src/components/ui/SmartMatchCard.tsx`

#### `MatchStatusBadge` — Reusable status display component

```typescript
interface MatchStatusBadgeProps {
  status: string;
  displayText: string;
  isPulsing?: boolean;
  size?: "sm" | "md" | "lg";
  color?: string;
  icon?: string;
}

// Renders: Colored badge with icon + text + pulsing animation
// Variants: blue, amber, green, gray, red
```

**File**: `src/components/ui/MatchStatusBadge.tsx`

#### `CountdownTimer` — Reusable countdown display

```typescript
interface CountdownTimerProps {
  targetTime: Date;
  onTimeReached?: () => void;
  format?: "full" | "compact" | "live";  // "2h 15m" | "135m" | "LIVE NOW"
  pulseWhenClose?: boolean;  // Pulse when < 5 min
  className?: string;
}

// Features:
// - Never shows negative time
// - Auto-stops at 00:00
// - Pulsing when close
// - "LIVE NOW" state at kickoff
// - Updates every second
```

**File**: `src/components/ui/CountdownTimer.tsx`

#### `SmartEmptyState` — Consistent empty states across app

```typescript
interface SmartEmptyStateProps {
  type: "no_matches" | "no_lineups" | "no_notifications" | "no_results" | "match_ended" | "match_cancelled";
  title?: string;
  message?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  icon?: string;
}

// Variants:
// - "no_matches": "No matches available. Create one or browse others."
// - "no_lineups": "No lineups yet. Match will start automatically."
// - "match_ended": "This match has ended. View results below."
// - "match_cancelled": "This match was cancelled. [Show reason]"
```

**File**: `src/components/ui/SmartEmptyState.tsx`

#### `SkeletonLoader` — Loading placeholders for all major sections

```typescript
interface SkeletonLoaderProps {
  variant: "match-card" | "match-list" | "lineup-grid" | "table-row" | "notification" | "custom";
  count?: number;
}

// Variants:
// - match-card: Single match card placeholder
// - match-list: 3-4 match cards in a row
// - lineup-grid: 2 columns of 4-8 player slots
// - table-row: Admin table row with multiple cells
// - notification: Notification item in list
```

**File**: `src/components/ui/SkeletonLoader.tsx`

#### `NotificationCenter` — Smart notifications UI

```typescript
interface NotificationCenterProps {
  maxVisible?: number;  // Default: 5 in drawer, 1 as toast
}

// Features:
// - Expandable drawer showing all notifications
// - Toast notifications for urgent alerts (auto-cancel, auto-complete)
// - Mark as read functionality
// - Auto-dismiss after 10 seconds
// - Sound for critical notifications (optional)
// - Unread badge on bell icon
```

**File**: `src/components/ui/NotificationCenter.tsx`

---

## PART 4: PAGES & SCREENS TO FIX 🔴 TODO

### 4.1 Critical Pages (Admin Panel) — PRIORITY 1

#### `src/components/admin/AdminMatches.tsx` — Real-time match monitoring

**Current Issues:**
- Color coding stuck (matches stay green forever)
- Stale participant counts
- No real-time updates
- No ability to see auto-action history

**Fixes Required:**
1. Use `useMatchStatus` hook for each match
2. Add real-time Supabase subscriptions
3. Fix color coding: green=live, amber=upcoming/soon, gray=ended, red=cancelled
4. Add match count summary at top (4 Upcoming, 2 Live, 8 Ended, 1 Cancelled)
5. Add "Last Updated" timestamp with refresh button
6. Show participant counts live
7. Add one-click admin actions (manual cancel, manual complete) with audit trail
8. Show auto-action metadata (why it was auto-cancelled, etc.)
9. Add search/filter by status
10. Implement loading states and error boundaries

**Components to use:** SmartMatchCard, MatchStatusBadge, SkeletonLoader, SmartEmptyState

#### `src/components/admin/AdminCalendar.tsx` — Real-time calendar view

**Current Issues:**
- Calendar cells show wrong colors
- Past dates not grayed out
- No indication of live matches
- Tooltips show stale data

**Fixes Required:**
1. For each date's matches, call `get_intelligent_match_status`
2. Color code calendar cells based on ACTUAL match state:
   - Green = has live matches
   - Amber = has upcoming/soon matches  
   - Gray = all matches ended
   - Red = has cancelled matches
3. Gray out past dates where all matches completed/cancelled
4. Highlight today with current live matches
5. Show match count per date
6. On hover: Show tooltip with all matches for that day + their statuses
7. Implement real-time updates using Supabase subscriptions
8. Add click to see detailed view of day's matches

#### `src/components/admin/AdminLiveMonitor.tsx` — Real-time scoreboard of active matches

**Current Issues:**
- Doesn't exist or shows stale data
- No real-time refresh

**New Implementation Required:**
1. Fetch all matches with status IN ('live', 'soon', 'upcoming')
2. Display in scoreboard format:
   ```
   | Match ID | Venue | Players | Time Remaining | Actions |
   |----------|-------|---------|-----------------|---------|
   | ABC-123  | X FC  | 8/8     | 15m remaining   | [Details] |
   ```
3. Sort by: Most Recent Kickoff, Ending Soon, Most Full
4. Real-time updates every 5 seconds
5. Quick-action buttons:
   - View Match Details
   - Resolve Dispute
   - Manually Complete
   - Manually Cancel
   - View Lineup
   - Send Notification
6. Color-code rows by status (green=live, amber=soon, blue=upcoming)

**File**: `src/components/admin/AdminLiveMonitor.tsx` (Create new)

#### `src/components/admin/AdminSettings.tsx` — Enhanced admin configuration

**Current Issues:**
- May not have auto-action settings
- No safety guard configurations

**Fixes/Additions Required:**
1. Add settings section: "Automated Match Management"
   - `auto_cancel_minutes_before_kickoff` (default: 20)
   - `auto_cancel_if_below_percent_full` (default: 0%, OFF)
   - `auto_cancel_min_players` (or default to max_core_players)
   - `enable_auto_completion` (default: true)
   - `checkin_percentage_required` (default: 50%)
   - `notification_style` (toast vs in-app vs email)
2. Add settings section: "Notification Preferences"
   - Default notification channels
   - Test notification button
3. Add settings section: "Refund & Payment"
   - Moolre API credentials (masked)
   - Default refund delay
   - Retry settings
4. All changes logged with user_id and timestamp
5. Add audit log viewer: "Settings Change History"

### 4.2 User-Facing Pages — PRIORITY 2

#### `src/pages/Lobby.tsx` — Match lobby with real-time status

**Current Issues:**
- Shows old match state if accessed after match ended
- Broken UI when match is cancelled
- Stale participant list

**Fixes Required:**
1. Use `useMatchAutoStatus` hook to always show current state
2. Add header section showing:
   - Match status badge (with countdown if upcoming)
   - Venue name + address
   - Player count + max capacity
   - Booking duration countdown (if live)
3. If match is cancelled:
   - Show "Match Cancelled" with clear reason
   - Show refund status if applicable
   - Button: "Browse Other Matches"
4. If match is ended:
   - Show "Match Ended" with final result/lineup
   - Show payout status
   - Button: "Browse Other Matches"
5. If match is upcoming/soon/live:
   - Show normal lobby experience
   - Real-time participant list
   - Lineup tabs (if live)
   - Join button (only if can_join = true)
6. Prevent joining if status = cancelled, ended, or full

#### `src/pages/Index.tsx` (Home) — Real-time home feed

**Current Issues:**
- Matches stay in "upcoming" forever
- No distinction between active and completed matches
- Stale counts

**Fixes Required:**
1. Show only active matches (upcoming, soon, live)
2. Use SmartMatchCard for all match displays
3. Separate tabs/filters:
   - "Active" (upcoming + soon + live)
   - "Live Now" (only live)
   - "Past" (completed + cancelled)
4. Add smart sorting:
   - Sort by: Time to Kickoff (soonest first)
   - Then by: Participant count (most full first)
5. Show countdown timer on each card
6. Add filter: Skip cancelled matches by default
7. Implement real-time subscriptions
8. Show "Last Updated: 2 minutes ago" at top
9. Add refresh button
10. If no active matches: Show SmartEmptyState

#### `src/pages/JoinMatch.tsx` (Browse Matches) — Match discovery

**Current Issues:**
- Shows ended/cancelled matches in browse list
- Stale participant counts
- No countdown timers

**Fixes Required:**
1. Filter matches: Only show upcoming, soon, live (hide ended/cancelled)
2. Use SmartMatchCard for all displays
3. Add columns to table:
   - Match name
   - Venue
   - Time (with countdown)
   - Players (current/max)
   - Entry Fee
   - Join Button
4. Real-time participant count updates
5. Sort by:
   - Soonest first
   - Skill level match
   - Distance (if location provided)
6. Status indicators: Countdown badge, Full badge, LIVE badge (pulsing)
7. "Join" button only enabled if can_join = true
8. Show reason why can't join (if applicable)

#### `src/pages/MyMatches.tsx` (My Matches / Schedule) — User's match history

**Current Issues:**
- Mix of upcoming, live, completed, cancelled in one list
- No clear organization
- Stale status displays

**Fixes Required:**
1. Organize into clear sections:
   - "Upcoming" (with countdown)
   - "Live Now" (with time remaining)
   - "Completed" (with results)
   - "Cancelled" (with reason + refund status)
2. For each section, use SmartMatchCard with appropriate details:
   - Upcoming: Show countdown, can edit/leave
   - Live: Show time remaining, lineup link
   - Completed: Show final result, payout status, rating prompt
   - Cancelled: Show reason, refund status
3. Real-time updates via subscriptions
4. Add filters: Show All, Upcoming Only, Completed Only
5. If no upcoming matches: Show SmartEmptyState with "Create Match" button

#### `src/pages/Wallet.tsx` — Earnings and refunds

**Current Issues:**
- Refunds not clearly shown
- Auto-cancellation refunds may be hidden
- No clarity on when money will arrive

**Fixes Required:**
1. Add section: "Pending Refunds" (if any)
   - Show reason for refund (auto-cancel, manual cancel, dispute)
   - Show match link
   - Show refund date issued
   - Show status (pending, completed)
2. Add section: "Pending Payouts" (if any)
   - Show all matches awaiting payout
   - Show estimated payout date
   - Show match details link
3. Add section: "Completed Transactions"
   - Filter: All, Payouts, Refunds, Deposits
   - Show timestamp, amount, reason, status
4. Add toast notifications when refund is issued
5. Add email notification option

#### `src/pages/Schedule.tsx` — Calendar view of matches

**Current Issues:**
- Calendar may show stale events
- No indication of live/ended matches

**Fixes Required:**
1. Use calendar library to show matches
2. Color code dates:
   - Blue = has upcoming/soon matches
   - Green = has live matches
   - Gray = all matches ended/completed
   - Red = has cancelled matches
3. On click: Show detail view of that day's matches
4. Use SmartMatchCard in detail view
5. Real-time updates
6. Legend showing what colors mean

### 4.3 Turf Owner Pages — PRIORITY 2

#### `src/pages/VenueOwnerDashboard.tsx` — Venue management

**Current Issues:**
- Matches may show stale status
- No alerts for auto-cancellation risks

**Fixes Required:**
1. Add "Action Needed" section at top:
   - Matches at risk of auto-cancellation (< min_players, < 20 min away)
   - Matches about to auto-complete (< 10 min remaining)
2. Show all matches for owner's venues with real-time status
3. For each match:
   - Show current participant count
   - Show countdown/time remaining
   - Show status badge
   - Show manual actions (cancel, complete, send announcement)
4. Tab view:
   - Today's matches
   - Upcoming
   - Completed
   - Cancelled
5. Real-time updates
6. Add notifications bell with quick alerts

#### `src/pages/TurfOwner.tsx` — Turf owner profile/stats

**Current Issues:**
- Stats may be based on incomplete data

**Fixes Required:**
1. Only count wins/losses from TRULY completed matches (status='completed')
2. Show revenue only from completed payouts
3. Show pending revenue from auto-complete-eligible matches
4. Auto-generate weekly/monthly reports

---

## PART 5: NOTIFICATION & MESSAGING SYSTEM 🔴 TODO

### 5.1 Smart Notification Types

**Auto-Triggered Notifications:**

1. **Auto-Cancel Notification**
   ```
   Title: "Match Cancelled: Insufficient Players"
   Message: "Your Match at VenueX has been cancelled. 
             Only 3/8 players joined. 
             Full refund of ₦5,000 has been processed."
   Action: "View Refund" → links to Wallet
   ```

2. **Auto-Complete Notification**
   ```
   Title: "Match Completed!"
   Message: "Your Match at VenueX is now completed.
             Payouts will be processed within 24h."
   Action: "View Details" → Match results
   ```

3. **Reminder Notifications** (scheduled via Supabase edge function)
   ```
   - 60 min before: "Match starts in 1 hour"
   - 30 min before: "Match starts in 30 minutes"
   - 15 min before: "Match starts in 15 minutes"
   - 5 min before: "Match starting VERY SOON"
   ```

4. **Player Join Notifications** (to organizer)
   ```
   Title: "Player Joined"
   Message: "John just joined. 6/8 spots filled."
   ```

5. **At-Risk Warnings** (when < 20 min and insufficient players)
   ```
   Title: "Match at Risk"
   Message: "Only 2/4 players. Match will auto-cancel in 20 minutes."
   Action: "Share/Invite" → help recruit players
   ```

6. **Payout Ready Notification**
   ```
   Title: "Payout Ready!"
   Message: "You earned ₦15,000 from completed matches.
             Funds will arrive within 24 hours."
   Action: "View Wallet"
   ```

### 5.2 Notification Delivery Implementation

**File**: `src/lib/notifications.ts`

```typescript
// Helper functions for creating notifications
export async function createAutoNotification(
  userId: string,
  type: 'auto_cancel' | 'auto_complete' | 'reminder' | 'payout',
  matchId: string,
  data?: any
): Promise<SmartNotification>

// For real-time delivery:
// Use Supabase subscriptions to listen to smart_notifications table
// Display toasts for urgent notifications
// Show badge count on NotificationCenter
```

**Channels:**
- **In-App**: Persistent notifications in NotificationCenter
- **Toast**: Immediate alerts for urgent actions
- **Badge**: Unread count on notification bell
- **Future**: Email, SMS (if user opts in)

---

## PART 6: DATA CONSISTENCY & ACCURACY

### 6.1 Source of Truth

```
RULE: match.status is NEVER manually set except via RPC
RULE: All status queries use get_intelligent_match_status RPC
RULE: UI always calls get_intelligent_match_status, never uses direct match.status
RULE: Every status change creates match_status_history entry
RULE: Audit trail captures all changes with user_id and reason
```

### 6.2 Stats Accuracy

**Only count as "win" if:**
- match.status = 'completed'
- auto_completed_at IS NOT NULL OR match_date + booking_duration < now()
- AND user.match_participants.status = 'confirmed'

**Only count revenue if:**
- match.status = 'completed'
- transaction.status = 'completed'
- transaction.type = 'payout'

---

## PART 7: IMPLEMENTATION ROADMAP

### Sprint 1: Database & Functions (DONE ✅)
- [x] Create migration with new fields, tables, indexes
- [x] Create PostgreSQL functions: `get_intelligent_match_status`, `get_match_display_countdown`
- [x] Create scheduled jobs: `auto_cancel_low_player_matches`, `auto_complete_expired_bookings`
- [x] Set up smart_notifications table + subscription
- [x] Create audit logging tables

### Sprint 2: Backend RPCs & Automation (TODAY) 🔴 TODO
- [ ] Add remaining RPC endpoints (get_admin_auto_settings, update_admin_auto_setting, etc.)
- [ ] Implement 50% check-in safety guard for auto-complete
- [ ] Add admin_auto_settings table + seeding
- [ ] Add Moolre refund integration with retry logic
- [ ] Add admin force-complete/force-cancel RPCs with audit
- [ ] Test: Auto-cancel flow end-to-end
- [ ] Test: Auto-complete flow end-to-end
- [ ] Test: Refund failure + retry

### Sprint 3: Frontend Hooks & Context (TODAY) 🔴 TODO
- [ ] Create `useMatchStatus` hook
- [ ] Create `useMatchCountdown` hook
- [ ] Create `useSmartNotifications` hook
- [ ] Create `useMatchAutoStatus` hook
- [ ] Create `MatchStatusContext` + Provider
- [ ] Real-time subscription setup + tests

### Sprint 4: UI Components (TOMORROW) 🔴 TODO
- [ ] Create `SmartMatchCard`
- [ ] Create `MatchStatusBadge`
- [ ] Create `CountdownTimer`
- [ ] Create `SmartEmptyState`
- [ ] Create `SkeletonLoader` variants
- [ ] Create `NotificationCenter`
- [ ] Unit tests for all components

### Sprint 5: Admin Panel Pages (TOMORROW) 🔴 TODO
- [ ] Fix `AdminMatches.tsx` (real-time + correct colors)
- [ ] Fix `AdminCalendar.tsx` (status-aware coloring)
- [ ] Create `AdminLiveMonitor.tsx` (true real-time scoreboard)
- [ ] Enhance `AdminSettings.tsx` (auto-action configs)
- [ ] Add audit trail viewer
- [ ] Integration tests with real data

### Sprint 6: User-Facing Pages (THURSDAY) 🔴 TODO
- [ ] Fix `Lobby.tsx` (show ended state clearly)
- [ ] Fix `Index.tsx` (home feed with real-time + filters)
- [ ] Fix `JoinMatch.tsx` (browse with countdowns + full indicator)
- [ ] Fix `MyMatches.tsx` (organized by status)
- [ ] Fix `Wallet.tsx` (refund display + pending payouts)
- [ ] Fix `Schedule.tsx` (calendar view with status colors)

### Sprint 7: Turf Owner Pages (THURSDAY) 🔴 TODO
- [ ] Fix `VenueOwnerDashboard.tsx` (action needed alerts + real-time)
- [ ] Fix `TurfOwner.tsx` (stats only from completed matches)
- [ ] Add auto-generated reports

### Sprint 8: Notification System (FRIDAY) 🔴 TODO
- [ ] Implement all notification types
- [ ] Set up in-app notifications + toast delivery
- [ ] Add notification icons + animations
- [ ] Test notification subscriptions

### Sprint 9: Polish & Testing (FRIDAY) 🔴 TODO
- [ ] Test all status flows (upcoming → soon → live → ended → completed)
- [ ] Test auto-cancel with edge cases (network failure, time zone issues)
- [ ] Test auto-complete with escrow release
- [ ] Test countdown timers (never negative)
- [ ] Test all empty states on all pages
- [ ] Test real-time updates (multiple users in different states)
- [ ] Performance testing (many matches on screen)
- [ ] Accessibility audit (screen readers, keyboard nav)

### Sprint 10: Deployment & Monitoring (NEXT MONDAY) 🔴 TODO
- [ ] Deploy migration to production database
- [ ] Deploy backend functions + scheduled jobs
- [ ] Deploy frontend changes
- [ ] Monitor auto-action jobs (logs, errors, timing)
- [ ] Monitor notification delivery
- [ ] Setup alerts for critical failures
- [ ] Gradual rollout (10% → 50% → 100%)

---

## PART 8: VALIDATION CHECKLIST

Before merging PR, verify:

- [ ] No hardcoded "upcoming" statuses anywhere
- [ ] All match cards use SmartMatchCard or consistent status logic
- [ ] Countdown timers never show negative time
- [ ] Admin calendar colors reflect actual match state
- [ ] Auto-cancel refunds fully implemented + tested
- [ ] Auto-complete payouts fully implemented + tested
- [ ] 50% check-in safety guard prevents incomplete payouts
- [ ] All notifications are actionable + have clear context
- [ ] Empty states are beautiful on all pages
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
- [ ] Test on mobile (iOS + Android)
- [ ] Performance testing (>100 matches on screen)
- [ ] All 20+ things from requirements implemented ✅

---

## PART 9: KEY PRINCIPLES

1. **Single Source of Truth** — All match status computed from `get_intelligent_match_status` RPC
2. **Real-Time First** — All data that can change uses subscriptions, never polling
3. **Never Stale** — UI updates immediately when data changes
4. **User-Centric** — Every message is clear, friendly, actionable
5. **Professional** — No broken UI, no negative time, no blank screens
6. **Auditable** — Every action logged, fully traceable
7. **Resilient** — Graceful errors, helpful feedback, automatic retries
8. **Accessible** — Beautiful empty/loading/error states everywhere
9. **Safe** — 50% check-in requirement, refund retries, double-cancellation prevention
10. **Smart** — Auto-actions don't feel automatic; they feel intelligent

---

## PART 10: FILE STRUCTURE

### New Files to Create

```
src/types/match-status.ts
src/types/smart-notification.ts
src/hooks/useMatchStatus.ts ⚠️
src/hooks/useMatchCountdown.ts ⚠️
src/hooks/useSmartNotifications.ts ⚠️
src/hooks/useMatchAutoStatus.ts ⚠️
src/context/MatchStatusContext.tsx ⚠️
src/components/ui/SmartMatchCard.tsx ⚠️
src/components/ui/MatchStatusBadge.tsx ⚠️
src/components/ui/CountdownTimer.tsx ⚠️
src/components/ui/SmartEmptyState.tsx ⚠️
src/components/ui/SkeletonLoader.tsx ⚠️
src/components/ui/NotificationCenter.tsx ⚠️
src/lib/match-status.ts
src/lib/notifications.ts ⚠️
src/components/admin/AdminLiveMonitor.tsx ⚠️
backend/supabase/migrations/20260618000002_admin_auto_settings.sql
```

### Files to Modify (Priority)

```
CRITICAL (Admin Panel):
src/components/admin/AdminMatches.tsx ⚠️
src/components/admin/AdminCalendar.tsx ⚠️
src/components/admin/AdminSettings.tsx ⚠️

HIGH (User Pages):
src/pages/Lobby.tsx ⚠️
src/pages/Index.tsx ⚠️
src/pages/JoinMatch.tsx ⚠️
src/pages/MyMatches.tsx ⚠️
src/pages/Wallet.tsx ⚠️
src/pages/Schedule.tsx ⚠️

HIGH (Turf Owner):
src/pages/VenueOwnerDashboard.tsx ⚠️
src/pages/TurfOwner.tsx ⚠️

MEDIUM:
src/App.tsx (add MatchStatusProvider)
src/components/ui/index.ts (export new components)
```

**Legend**: ✅ = Done, 🔴 = TODO, ⚠️ = Requires changes

---

## NOTES FOR DEVELOPERS

### Real-Time Subscriptions Pattern

```typescript
// In any component that needs live updates:
const { data, subscribe } = useMatchStatus(matchId);

useEffect(() => {
  const unsubscribe = subscribe();
  return unsubscribe;  // Cleanup on unmount
}, [matchId]);

// Use `data` in render, it updates automatically
```

### Testing Auto-Actions

```typescript
// To test auto-cancel (without waiting 20 min):
// 1. Create match with match_date = now() + 21 minutes
// 2. Add 1 player (need 4, so insufficient)
// 3. Manually trigger: await supabase.rpc('auto_cancel_low_player_matches')
// 4. Verify: match.status = 'cancelled', refund created, notification sent

// To test auto-complete:
// 1. Create match with match_date = now() - 5 minutes
// 2. Manually trigger: await supabase.rpc('auto_complete_expired_bookings')
// 3. Verify: match.status = 'completed', payout queued, notification sent
```

### Debugging Stale Data

```typescript
// If you see stale data anywhere:
// 1. Check: Are you calling get_intelligent_match_status or just match.status?
// 2. Check: Are you subscribed to realtime changes?
// 3. Check: Is MatchStatusContext being used to deduplicate subscriptions?
// 4. Check: Did you add a new page? Wrap with <MatchStatusProvider>?
```

---

## SUMMARY

**This plan transforms PlayReady Sports from a "dumb UI with stale data" to an "intelligent, alive, professional platform" by:**

1. ✅ Creating smart match intelligence engine (database layer done)
2. 🔴 Implementing automated lifecycle management (functions done, RPCs pending)
3. 🔴 Building real-time hooks + components (all to be created)
4. 🔴 Fixing all pages to use smart status (admin panel critical)
5. 🔴 Implementing beautiful notifications system
6. 🔴 Adding professional empty/loading/error states everywhere

**Total implementation time**: 5-7 days (sprints 2-10)
**Starting point**: Database migrations + functions ✅
**Current status**: Ready to begin frontend implementation 🚀

---

**Next Step**: Review this plan, approve changes, then begin Sprint 2 (Backend RPCs) immediately.
