// ============================================================
// Sprint 6 Implementation: Fix User Pages
// User-Facing Pages with Intelligent Match Status & Real-Time Countdowns
// ============================================================

## Files to Update in Sprint 6

### Priority 1: Fix Countdown/Status Display

#### **Lobby.tsx** (Most Critical - Live Match Page)
**Changes:**
- Replace `useCountdown` with `useMatchCountdown` 
- Use `useMatchAutoStatus` to get both status and countdown
- Replace `match.status === 'completed'` checks with `status.intelligent_status === 'ended'`
- Update voting modal trigger: check for `ended` status, not `completed`
- Update time gate for check-in: use `status_last_updated_at` + configurable window

**Key Logic to Update:**
```typescript
// OLD
const { h, m, s, totalSec, isLive, kickoffPassed } = useCountdown(targetDate, match?.status);
if (match.status === 'completed') {
  // Show voting modal
}

// NEW
const { status, countdown } = useMatchAutoStatus(match?.id, match?.match_date, match?.booking_duration_minutes);
if (status?.intelligent_status === 'ended') {
  // Show voting modal
}

// Display countdown
<CountdownTimer 
  displayText={countdown.displayText}
  shouldPulse={countdown.shouldPulse}
/>
```

#### **MyMatches.tsx** (Schedule Page)
**Changes:**
- Use `useMatchAutoStatus` for each match in the list
- Replace tab filtering (upcoming | live | completed | cancelled) with:
  - Upcoming: `upcoming` or `soon`
  - Live: `live_now`
  - Completed: `ended`
  - Cancelled: `cancelled`
- Remove status === 'full' → 'upcoming' mapping (no longer needed with intelligent status)
- Add real-time countdown to each match card

**Key Logic to Update:**
```typescript
// OLD
const tabs = ['upcoming', 'live', 'completed', 'cancelled'];
const filtered = matches.filter(m => {
  const effective = m.status === 'full' ? 'upcoming' : m.status;
  return effective === activeTab;
});

// NEW
const tabs = ['upcoming', 'live', 'completed', 'cancelled'];
const filtered = matches.filter(m => {
  if (activeTab === 'upcoming') return ['upcoming', 'soon'].includes(m.intelligent_status);
  if (activeTab === 'live') return m.intelligent_status === 'live_now';
  if (activeTab === 'completed') return m.intelligent_status === 'ended';
  if (activeTab === 'cancelled') return m.intelligent_status === 'cancelled';
});
```

#### **Index.tsx** (Home Feed)
**Changes:**
- Update status filter to show only `upcoming` and `soon` matches (not `ended`, `cancelled`, `archived`)
- Use `useMatchAutoStatus` for each match in recommendations
- Replace static time display with real countdown
- Filter out matches with `intelligent_status` of `ended`, `cancelled`, or `archived`

**Key Logic to Update:**
```typescript
// OLD
const liveMatches = matches.filter(m => m.status !== "live");

// NEW - Only show active/upcoming matches
const activeMatches = matches.filter(m => {
  const status = m.intelligent_status;
  return !['ended', 'cancelled', 'archived'].includes(status);
});
```

#### **JoinMatch.tsx** (Browse Matches)
**Changes:**
- Filter out `ended`, `cancelled`, `archived` matches from browse
- Add real countdown to each match card
- Use `useMatchAutoStatus` to get countdown for "starts in" display
- Add status badge showing intelligent_status

**Key Logic to Update:**
```typescript
// NEW - Filter out finished matches
const browseableMatches = matches.filter(m => {
  return !['ended', 'cancelled', 'archived'].includes(m.intelligent_status);
});
```

### Priority 2: Refund/Transaction Display

#### **Wallet.tsx** (Payment History)
**Changes:**
- Query `admin_actions_audit` table for refund reasons/evidence
- Show refund reason when displaying transaction with type `refund`
- Add status badge for pending vs completed refunds
- Join with `notification_delivery_log` to show if user was notified

**Key Logic to Update:**
```typescript
// NEW - Fetch refund reasons
const getRefundReason = async (matchId: string) => {
  const { data } = await supabase
    .from('admin_actions_audit')
    .select('action_type, reason, evidence')
    .eq('match_id', matchId)
    .eq('action_type', 'auto_complete_refund')
    .order('created_at', { ascending: false })
    .limit(1);
  return data?.[0];
};

// Display with reason
{transaction.type === 'refund' && (
  <div className="text-xs text-muted-foreground">
    {refundReason?.reason} {refundReason?.evidence && `(${refundReason.evidence})`}
  </div>
)}
```

---

## Implementation Order

1. **Update Lobby.tsx** - Uses `useMatchAutoStatus` instead of separate hooks
2. **Update MyMatches.tsx** - Organize by intelligent_status, add countdowns  
3. **Update Index.tsx** - Real-time feed filtering
4. **Update JoinMatch.tsx** - Browse page filtering
5. **Update Wallet.tsx** - Show refund reasons from audit table

---

## New Status Value Mapping

**Replace all status checks with intelligent_status enum:**

| Old Value | New Value | UI Treatment |
|-----------|-----------|--------------|
| `upcoming` | `upcoming` | Amber badge, "Starts in X" |
| `upcoming` (when full) | `soon` | Amber badge (urgent), "Starts in X" |
| `live` | `live_now` | Green badge, pulsing, "LIVE NOW" |
| `completed` | `ended` | Gray badge, "Ended" |
| `cancelled` | `cancelled` | Red badge, crossed-out info |
| *(new)* | `archived` | Hidden from most views, only in schedule history |

---

## Component Usage Examples

### Example 1: Updating Lobby.tsx Countdown
```typescript
import { useMatchAutoStatus } from '@/hooks/useMatchAutoStatus';
import { CountdownTimer } from '@/components/ui/CountdownTimer';

export function LobbyPage() {
  const { status, countdown } = useMatchAutoStatus(
    match?.id,
    match?.match_date,
    match?.booking_duration_minutes
  );

  return (
    <div>
      <CountdownTimer 
        displayText={countdown.displayText}
        shouldPulse={countdown.shouldPulse}
      />
      {countdown.isLive && <div>MATCH IS LIVE</div>}
      {countdown.isPast && <div>MATCH HAS ENDED</div>}
    </div>
  );
}
```

### Example 2: Updating MyMatches.tsx Status Filter
```typescript
const getTabMatches = (tab: string) => {
  return matches.filter(m => {
    const status = m.intelligent_status;
    switch (tab) {
      case 'upcoming':
        return status === 'upcoming' || status === 'soon';
      case 'live':
        return status === 'live_now';
      case 'completed':
        return status === 'ended';
      case 'cancelled':
        return status === 'cancelled';
      default:
        return false;
    }
  });
};
```

### Example 3: Updating Index.tsx Filter
```typescript
// Only show active/upcoming matches (hide ended/cancelled/archived)
const visibleMatches = matches.filter(m => {
  const status = m.intelligent_status;
  const isActive = !['ended', 'cancelled', 'archived'].includes(status);
  const isInFuture = new Date(m.match_date) > new Date();
  return isActive && isInFuture;
});
```

---

## Database Queries to Update

### Lobby: Voting Modal Trigger
Replace: `match.status === 'completed'`
With: `match.intelligent_status === 'ended'` OR `match.auto_completed_at IS NOT NULL`

### MyMatches: Tab Filtering
Replace: Query by status field
With: Query by intelligent_status enum with values: `upcoming`, `soon`, `live_now`, `ended`, `cancelled`, `archived`

### Index: Feed Filtering  
Replace: `.neq('status', 'live')`
With: `.not('intelligent_status', 'in', ['ended', 'cancelled', 'archived'])`

### JoinMatch: Browse Filtering
Replace: No explicit filtering (implicit)
With: `.not('intelligent_status', 'in', ['ended', 'cancelled', 'archived'])`

### Wallet: Refund Reasons
Join with: `admin_actions_audit` on `match_id` where `action_type` = 'auto_complete_refund'

---

## Testing Checklist

- [ ] Lobby: Countdown displays "LIVE NOW" during match
- [ ] Lobby: Voting modal appears only when match ends
- [ ] MyMatches: Matches organized by correct intelligent_status tabs
- [ ] MyMatches: Countdowns update every second
- [ ] Index: Home feed shows only active/upcoming matches
- [ ] Index: Ended matches not visible in feed
- [ ] JoinMatch: Browse page filters out ended/cancelled matches
- [ ] JoinMatch: Each match shows countdown
- [ ] Wallet: Refund transactions show reason from audit table

---

**Status:** Ready for implementation
**Estimated Time:** 2-3 hours for all 5 pages
**Next Steps:** Follow implementation order above, test each page
