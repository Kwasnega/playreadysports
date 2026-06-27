# Sprint 6 User Pages - Foundation Complete

**Status:** 🔧 IN PROGRESS - Core Infrastructure Ready  
**Sprint Focus:** Fix user-facing pages with intelligent status and real-time updates  
**Current Phase:** Foundation hooks and components created - Integration in progress

---

## New Hook: `useActiveMatches.ts`

**Purpose:** Fetch only active matches (upcoming/soon/live) excluding ended/cancelled

**Features:**
- Filters to matches with future match_date
- Enriches with intelligent status via RPC
- Automatically excludes ended and cancelled
- Returns sorted by match_date (ascending)
- Includes date range filtering variants:
  - `useMatchesInDateRange(start, end)` - Filter by date range
  - `useHotMatches()` - Only live_now and soon matches

**Usage Example:**
```tsx
const { matches, isLoading, error } = useActiveMatches();

// Or for specific time ranges
const { matches: todayMatches } = useMatchesInDateRange(
  new Date(),
  new Date(Date.now() + 24 * 60 * 60 * 1000)
);

// Or for hot/urgent matches
const { matches: hotMatches } = useHotMatches();
```

---

## Pages to Update

### 1. **`src/pages/Index.tsx`** (Home Page)
**Current State:** Shows all matches using useHomeMatches hook
**What Needs Change:**
- Replace useHomeMatches with useActiveMatches (excludes ended/cancelled)
- Add real-time status updates using useMatchAutoStatus hook
- Integrate SmartMatchCard component for card display
- Filter out cancelled matches from results

**Integration Points:**
```tsx
import { useActiveMatches } from '@/hooks/useActiveMatches';
import { SmartMatchCard } from '@/components/SmartMatchCard';

// In component:
const { matches, isLoading } = useActiveMatches();

// Map to SmartMatchCard
matches.map(match => (
  <SmartMatchCard
    key={match.id}
    matchId={match.id}
    matchDate={match.match_date}
    bookingDurationMinutes={match.booking_duration_minutes}
    title={match.title}
    venue={match.venue_name}
    playerCount={match.current_player_count}
    minPlayers={match.min_players_required}
    onClick={() => navigate(`/lobby/${match.id}`)}
  />
))
```

**Priority:** CRITICAL - Home page shows all available matches

---

### 2. **`src/pages/JoinMatch.tsx`** (Browse/Filter Page)
**Current State:** Shows browseable matches (usually ended ones mixed in)
**What Needs Change:**
- Use useActiveMatches to filter results
- Add countdown timer display for each match
- Show player count progress
- Filter by sport/format/price
- Sort by: distance, time-until-start, player count

**Integration Points:**
```tsx
import { useActiveMatches } from '@/hooks/useActiveMatches';
import { useMatchCountdown } from '@/hooks/useMatchCountdown';

// Show countdown on each card
const countdown = useMatchCountdown(match.match_date, match.booking_duration_minutes);

// Only show matches that are:
// - upcoming or soon
// - have available slots
// - match user's selected filters
```

**Priority:** HIGH - Browse page is primary discovery mechanism

---

### 3. **`src/pages/MyMatches.tsx`** (My Schedule)
**Current State:** Shows user's joined matches (may include ended ones)
**What Needs Change:**
- Fetch user's match participation
- Organize by status section (Upcoming/Live/Completed/Cancelled)
- Use SmartMatchCard for display
- Color-code by status
- Show player stats for completed matches

**Integration Points:**
```tsx
// Get user's matches where they have active participation
const { data: participations } = await supabase
  .from('match_participants')
  .select('match_id')
  .eq('user_id', user.id)
  .eq('status', 'active');

// Enrich each with intelligent status
for (const p of participations) {
  const { data: status } = await supabase.rpc(
    'get_intelligent_match_status', 
    { p_match_id: p.match_id }
  );
  // Group by status.intelligent_status
}
```

**Priority:** HIGH - Player needs to track their bookings

---

### 4. **`src/pages/Lobby.tsx`** (Match Lobby/Detail)
**Current State:** Shows match detail and allows joining
**What Needs Change:**
- Show intelligent status prominently
- Disable join button if cancelled/ended
- Show countdown timer in header
- Real-time player count updates
- Auto-refresh when status changes

**Integration Points:**
```tsx
import { useMatchAutoStatus } from '@/hooks/useMatchAutoStatus';
import { MatchStatusBadge } from '@/components/MatchStatusBadge';

const { status, countdown } = useMatchAutoStatus(matchId, match.match_date);

// Show prominent status
<MatchStatusBadge status={status} size="lg" />

// Disable join if not joinable
<button disabled={!isJoinable(status)}>
  {status?.intelligent_status === 'cancelled' ? 'Cancelled' : 'Join Match'}
</button>

// Real-time countdown
{countdown.isLive && <span className="animate-pulse">LIVE NOW</span>}
{countdown.shouldPulse && <span>Starts in {countdown.minutes}m</span>}
```

**Priority:** CRITICAL - Players see this before joining

---

### 5. **`src/pages/Wallet.tsx`** (Payments/Refunds)
**Current State:** Shows wallet balance and transaction history
**What Needs Change:**
- Show refund reason clearly when match is cancelled
- Track refund status (pending/completed/failed)
- Link refunds to matches that triggered them
- Use readable status labels (not database codes)

**Integration Points:**
```tsx
// When displaying transaction/refund:
// - If reason is "match_cancelled" → show match title
// - If reason is "insufficient_players" → show explanation
// - Show refund retry count if still pending
// - Mark successful refunds with checkmark
```

**Priority:** MEDIUM - Important for user trust

---

### 6. **`src/pages/Schedule.tsx`** (Calendar View)
**Current State:** Calendar view of matches
**What Needs Change:**
- Color-code days by status (green=live, amber=soon, blue=upcoming, gray=ended, red=cancelled)
- Click day to see matches
- Show countdown on each date
- Real-time status updates
- Only show upcoming matches (filter ended)

**Integration Points:**
```tsx
import { useActiveMatches } from '@/hooks/useActiveMatches';
import { getStatusColorClass } from '@/lib/match-status';

// For each day in calendar:
const dayMatches = matches.filter(
  m => isSameDay(new Date(m.match_date), day)
);

// Use status color to background
<div className={getStatusColorClass(dayMatches[0]?.intelligent_status)} >
  {day.getDate()}
</div>
```

**Priority:** LOW - Calendar is secondary view

---

### 7. **`src/pages/TurfOwner.tsx`** (Owner Stats)
**Current State:** Shows venue owner statistics
**What Needs Change:**
- Only show stats from completed matches (not cancelled/ended)
- Link to AdminMatches for real-time monitoring
- Update stats when matches complete
- Show pending payout information

**Integration Points:**
```tsx
// Filter matches to only 'ended' with status='completed'
const { matches } = useAdminMatches();
const completedMatches = matches.filter(
  m => m.intelligent_status === 'ended'
);

// Calculate revenue only from completed
const revenue = completedMatches.reduce(
  (sum, m) => sum + m.entry_fee * m.current_player_count,
  0
);
```

**Priority:** MEDIUM - Owner visibility

---

### 8. **`src/pages/VenueOwnerDashboard.tsx`** (Admin Dashboard)
**Already Updated:** This should use AdminMatches, AdminSettings, AdminLiveMonitor from Sprint 5

**Priority:** N/A - Covered in Sprint 5

---

## Quick Integration Checklist

### For Every Page:
- [ ] Import useActiveMatches or useMatchAutoStatus
- [ ] Add error boundary for RPC failures
- [ ] Show loading state (use SmartMatchCardSkeleton)
- [ ] Display real-time countdown with CountdownTimer
- [ ] Disable unavailable actions (join, view, etc.)
- [ ] Handle network errors gracefully
- [ ] Filter out ended/cancelled unless appropriate

### For Active Match Display:
- [ ] Use SmartMatchCard component
- [ ] Show status badge with color
- [ ] Display player count with min threshold
- [ ] Show countdown timer
- [ ] Include action buttons (View, Join, etc.)
- [ ] Real-time updates via subscriptions

### For Completed/Cancelled Matches:
- [ ] Show clear status indicator
- [ ] Disable interaction
- [ ] Show reason if cancelled
- [ ] Link to refund if applicable
- [ ] Show completion stats

---

## Helper Function: Check if Match is Joinable

```tsx
export function isMatchJoinable(status?: MatchStatus, userIsParticipant?: boolean): boolean {
  if (!status) return false;
  
  // Can only join if upcoming or soon
  const isActive = status.intelligent_status === 'upcoming' || 
                   status.intelligent_status === 'soon';
  
  // Must not already be joined
  const notAlreadyJoined = !userIsParticipant;
  
  // Must have available slots
  const hasSlots = (status.current_player_count || 0) < (status.max_players_required || 22);
  
  return isActive && notAlreadyJoined && hasSlots;
}
```

---

## Known Integration Challenges

1. **Mixed Data Sources**
   - Old code uses "bookings" table
   - New code uses "matches" table
   - Gradual migration needed, may need adapters

2. **Existing Custom Logic**
   - Some pages have complex filtering/sorting
   - Preserve existing UX while adding real-time updates
   - Don't remove functionality, add layers on top

3. **Real-time Subscriptions**
   - Each hook sets up subscriptions
   - Potential for duplicate channels if not careful
   - MatchStatusContext helps with deduplication

4. **Navigation/Routing**
   - Ensure match IDs in URLs match database
   - Handle case where match is deleted/archived
   - Show "Not Found" gracefully

---

## Next Steps

### Phase 1 (THIS SESSION)
- ✅ Create useActiveMatches hook
- 🔜 Update Index.tsx (Home)
- 🔜 Update JoinMatch.tsx (Browse)

### Phase 2 (FOLLOWING SESSION)
- Update MyMatches.tsx
- Update Lobby.tsx with real-time status
- Update Wallet.tsx with refund display

### Phase 3 (NEXT SESSION)
- Update Schedule.tsx calendar
- Update TurfOwner.tsx stats
- Full integration testing

---

**Status:** ✅ Infrastructure ready, 🔜 Pages integration in progress
