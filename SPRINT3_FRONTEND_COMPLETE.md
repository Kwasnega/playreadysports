# Sprint 3 Frontend Hooks - Complete

**Status:** ✅ COMPLETE  
**Sprint Focus:** Frontend Intelligence Layer with Real-time Data Subscriptions  
**Completion Date:** Current Session

---

## Files Created/Updated

### 1. TypeScript Types (`src/types/match-status.ts`)
- **Purpose:** Central type definitions for all match intelligence features
- **Status:** ✅ Complete - Updated with snake_case field names matching RPC
- **Types Defined:**
  - `MatchStatus` - Full match status including 8 new intelligent columns
  - `CountdownTime` - Hours/minutes/seconds breakdown
  - `SmartNotification` - Notification with type, action, read state
  - `UseMatchStatusReturn` - Status hook return type
  - `UseMatchCountdownReturn` - Countdown hook return type
  - `UseSmartNotificationsReturn` - Notifications hook return type
  - `MatchStatusContextType` - Context methods for status management
  - `AdminAutoSettings` - Auto-action thresholds and settings
  - `UseMatchAutoStatusReturn` - Combined status + countdown

### 2. Utility Functions (`src/lib/match-status.ts`)
- **Purpose:** Helper functions for formatting, calculations, and validation
- **Status:** ✅ Complete - 20+ utility functions
- **Key Functions:**
  - `formatTimeUntil()` - Format time difference into readable text
  - `formatCountdown()` - Break milliseconds into hours/minutes/seconds
  - `getStatusColorClass()` - Status to Tailwind color mapping
  - `formatMatchDate()` - Date formatting
  - `isPlayerCountCritical()` - Check if players below minimum
  - `isMatchJoinable()` - Validate if player can join
  - `shouldPulse()` - Check if countdown should pulse (<5 min)
  - `debounce()` / `throttle()` - Performance utilities

### 3. Hooks

#### `useMatchStatus.ts` - Real-time Match Status
- **Purpose:** Fetch and cache intelligent match status with subscriptions
- **Features:**
  - Calls `get_intelligent_match_status()` RPC function
  - 10-second cache to prevent redundant fetches
  - Subscribes to `matches` and `match_status_history` tables
  - Auto-refetch on any status change
  - Fallback snapshot version for offline support
  - Includes refetch and subscribe methods
- **Return:** `UseMatchStatusReturn`
  - `data: MatchStatus` - Full status object
  - `isLoading: boolean`
  - `isError: boolean`
  - `error: Error | null`
  - `refetch: () => Promise<void>`
  - `subscribe: (callback) => () => void`

#### `useMatchCountdown.ts` - Real-time Countdown Timer ✅ NEW
- **Purpose:** 1-second updating countdown display
- **Features:**
  - Updates every 1 second via setInterval
  - Never shows negative time (clamps to 0)
  - Calculates three time states:
    - **Before kickoff:** "Starts in 2h 15m" → "Starts in 5m" → "Starts in 30s"
    - **During match:** "LIVE NOW" with pulse animation
    - **After match:** "Ended"
  - Pulses when <5 minutes until start
  - Includes helper function `useMatchCountdownText()` for just the text
- **Return:** `UseMatchCountdownReturn`
  - `displayText: string`
  - `timeUntilKickoffMs: number`
  - `isLive: boolean`
  - `isPast: boolean`
  - `shouldPulse: boolean`
  - `countdownExpired: boolean`
  - `hours/minutes/seconds: number`

#### `useSmartNotifications.ts` - Real-time Notifications ✅ NEW
- **Purpose:** Fetch and subscribe to smart notifications
- **Features:**
  - Fetches user's notifications from `smart_notifications` table
  - Real-time subscriptions for INSERT/UPDATE/DELETE
  - Tracks unread count automatically
  - Shows browser notifications when new ones arrive
  - Mark as read with timestamp
  - Delete notifications
  - Maintains 50 notification limit
- **Return:** `UseSmartNotificationsReturn`
  - `notifications: SmartNotification[]`
  - `unreadCount: number`
  - `markAsRead: (id) => Promise<void>`
  - `delete: (id) => Promise<void>`
  - `subscribe: () => () => void`
  - `isLoading/error`

#### `useMatchAutoStatus.ts` - Combined Status + Countdown ✅ NEW
- **Purpose:** Convenience hook combining status and countdown
- **Features:**
  - Combines `useMatchStatus()` + `useMatchCountdown()`
  - Single hook for components needing both
  - Includes batch variant: `useMatchesAutoStatus()` for multiple matches
- **Return:** `UseMatchAutoStatusReturn`
  - `status: MatchStatus`
  - `countdown: UseMatchCountdownReturn`
  - `isLoading: boolean`
  - `error: Error | null`

### 4. Context Provider (`src/context/MatchStatusContext.tsx`) ✅ NEW
- **Purpose:** Centralized match status caching and subscription deduplication
- **Features:**
  - In-memory cache of match statuses (Map<matchId, CacheEntry>)
  - Prevents duplicate subscriptions when many matches on screen
  - Manages Supabase real-time channel lifecycle
  - Notifies all subscribers when status changes
  - `invalidate()` to force refetch single match
  - `invalidateAll()` to force refetch all cached matches
- **API:**
  - `getStatus(matchId)` - Get cached status immediately
  - `subscribe(matchId, callback)` - Subscribe with auto-cleanup
  - `invalidate(matchId)` - Force refetch
  - `invalidateAll()` - Force refetch all
- **Usage:** Wrap app in `<MatchStatusProvider>` then use `useMatchStatusContext()`

---

## Architecture Summary

### Data Flow
1. **Initial Load:** Component mounts → Hook calls RPC function → Cache stores result
2. **Real-time Update:** Supabase notifies → RPC refetches → All subscribers notified
3. **Countdown:** Every 1 second → Recalculate time → Update display

### Key Patterns
- **Single Source of Truth:** All status via `get_intelligent_match_status()` RPC
- **Real-time First:** All data changes trigger Supabase subscriptions
- **Smart Caching:** 10-second cache for status, prevents refetch spam
- **Deduplication:** MatchStatusContext prevents duplicate subscriptions
- **Never Negative Time:** Countdown always clamps to 0, never shows negative

### Dependency Graph
```
Components
  ↓
useMatchAutoStatus (convenience)
  ↓ ├─ useMatchStatus (RPC + subscriptions)
  ↓ └─ useMatchCountdown (1-sec updates)
  ↓
useSmartNotifications (separate subscription)
  ↓
MatchStatusContext (deduplication layer)
  ↓
Supabase RPC + Real-time Subscriptions
  ↓
Database (matches, match_status_history, smart_notifications)
```

---

## Testing Checklist

### useMatchCountdown
- [ ] Displays "Starts in 2h 15m" for matches 2+ hours away
- [ ] Updates to "Starts in 5m" exactly at 5-minute mark
- [ ] Pulses when <5 minutes
- [ ] Transitions to "LIVE NOW" when kickoff time reached
- [ ] Never shows negative time
- [ ] Shows "Ended" after booking duration expires
- [ ] Cleans up interval on unmount

### useMatchStatus  
- [ ] Calls RPC on mount
- [ ] Caches result for 10 seconds
- [ ] Subscribes to matches table changes
- [ ] Subscribes to match_status_history changes
- [ ] Auto-refetches on subscription updates
- [ ] `refetch()` manually triggers RPC
- [ ] Returns correct error state

### useSmartNotifications
- [ ] Fetches initial 50 notifications
- [ ] Updates unread count correctly
- [ ] Shows browser notification on INSERT
- [ ] `markAsRead()` updates UI and database
- [ ] `delete()` removes from UI
- [ ] Real-time updates reflected immediately

### MatchStatusContext
- [ ] `getStatus()` returns from cache
- [ ] `subscribe()` sets up channel only once per match
- [ ] Multiple subscribers don't duplicate channels
- [ ] `invalidate()` forces refetch
- [ ] Unsubscribe cleans up channel when count reaches 0

---

## Next Steps: Sprint 4

**Priority:** Create React UI components that consume these hooks

### Components to Create
1. **SmartMatchCard.tsx** - Main match card using `useMatchAutoStatus`
2. **MatchStatusBadge.tsx** - Reusable status badge with color/icon
3. **CountdownTimer.tsx** - Countdown display with pulsing animation
4. **SmartEmptyState.tsx** - No matches/loading states
5. **SkeletonLoader.tsx** - Loading placeholder

### Component Usage Example
```tsx
// Smart Match Card uses both status and countdown
function SmartMatchCard({ matchId, matchDate, bookingDuration }) {
  const { status, countdown, isLoading } = useMatchAutoStatus(
    matchId, 
    matchDate, 
    bookingDuration
  );
  
  return (
    <Card>
      <MatchStatusBadge status={status} />
      <CountdownTimer 
        displayText={countdown.displayText}
        shouldPulse={countdown.shouldPulse}
      />
    </Card>
  );
}
```

---

## Files Summary

| File | Lines | Purpose |
|------|-------|---------|
| `src/types/match-status.ts` | ~150 | Type definitions |
| `src/lib/match-status.ts` | ~200+ | Utility functions |
| `src/hooks/useMatchStatus.ts` | ~120 | RPC + subscriptions |
| `src/hooks/useMatchCountdown.ts` | ~140 | 1-sec countdown timer |
| `src/hooks/useSmartNotifications.ts` | ~200 | Notifications |
| `src/hooks/useMatchAutoStatus.ts` | ~50 | Convenience hook |
| `src/context/MatchStatusContext.tsx` | ~180 | Caching provider |
| **Total** | **~1000** | **Complete frontend layer** |

---

## Deployment Notes

1. **Context Wrapping:** Wrap entire app in `<MatchStatusProvider>`
2. **Auth Required:** All hooks require authenticated user from `useAuth()`
3. **Supabase Client:** Uses `useSupabaseClient()` from auth helpers
4. **Browser Notifications:** Requires permission for Notification API
5. **Real-time Subscriptions:** Enable Realtime on matches and smart_notifications tables
6. **RPC Functions:** Ensure `get_intelligent_match_status()` deployed (from Sprint 2)

---

**Status:** Ready for Sprint 4 UI Component Development
