# Test Orchestra — Complete Testing Dashboard

## Overview

**Test Orchestra** is a hidden admin testing dashboard that enables rapid end-to-end testing of the entire PlayReady Sports workflow across all user types (Player, Organizer, Turf Owner, Admin).

**Location**: Floating purple ⚡ button in bottom-right corner of admin panel (visible only when logged in as admin)

---

## Quick Start

1. **Open Admin Panel** → Log in with admin credentials
2. **Look for purple ⚡ button** (bottom-right corner)
3. **Click to open** Test Orchestra panel
4. **Enter a Match ID** in the input field
5. **Choose your test scenario** from the tabs below

---

## Features by Section

### 1. **Fill Tab** — Match Population

Quickly populate matches with test players.

#### Actions:

- **Fill with 8 Players**
  - Adds 8 test players
  - Randomly assigns teams (50/50 reds vs blues)
  - Splits payment handling (top-ups if needed)
  
- **Fill with 12 Players**
  - Adds 12 test players
  - Great for testing full lineup scenarios
  
- **Fill with N Players** (Custom)
  - Use the input field to specify exact count
  - Supports 1-100 players
  
- **Fill + Auto Lineup**
  - Fills match with players
  - **Automatically assigns positions**:
    - Goalkeeper (1)
    - Defender (2)
    - Midfielder (2)
    - Forward (1)
  - Both teams get lineup assignments
  - **Use this for testing lineup features**

#### Test Scenarios:
- ✅ Test match with partial fill (5 players)
- ✅ Test lineup auto-assignment with various player counts
- ✅ Test team balance (check if 8 players splits 4v4)
- ✅ Test payment deduction (topups should happen automatically)

---

### 2. **Lifecycle Tab** — Match State Management

Simulate the entire match lifecycle from creation to completion.

#### Actions:

- **Simulate N% Check-ins**
  - Default: 100% (all players checked in)
  - Set percentage (0-100) in input field
  - Marks players as "attendance_scanned"
  - Tests check-in validation

- **Force Start Match**
  - Simulates all players checking in (100%)
  - Updates match to "live" state
  - **Tests match transition to live**

- **Force Complete Match**
  - Marks match as "completed"
  - Awards random win/loss to each player
  - Calculates payouts:
    - **Platform fee**: 5% of total collected
    - **Organizer share**: Total - Platform fee - Venue share
  - **Returns breakdown with financial details**

- **Force Cancel Match**
  - Marks match as "cancelled"
  - Refunds all paid participants
  - **Tests refund logic and wallet restoration**

#### Financial Breakdown (on completion):
```
Total Collected: ₵X
├─ Platform Fee (5%): -₵Y
├─ Venue Share (50%): +₵Z (to venue owner)
└─ Organizer Share: +₵A (to match organizer)
```

#### Test Scenarios:
- ✅ Test 90% check-in scenario
- ✅ Test partial completion (70% attendance)
- ✅ Test auto-cancellation refunds
- ✅ Verify financial calculations
- ✅ Test wallet balance updates after completion

---

### 3. **Wallet Tab** — Player Financial Management

Manage test account finances for payment testing.

#### Actions:

- **Bulk Top-up ₵N**
  - Specify amount in input field
  - Tops up **all test accounts** created during session
  - Useful for setting up paid join scenarios
  - Default: ₵500 per test account

#### Test Scenarios:
- ✅ Prepare multiple players with same balance
- ✅ Test insufficient balance error (don't topup)
- ✅ Test paid join with exact balance
- ✅ Test overspending prevention

#### Wallet Fields Affected:
```
wallet_balances:
  - user_id: (test player)
  - balance: (new amount)
  - updated_at: now()
```

---

### 4. **Analytics Tab** — Financial Breakdown

View complete financial details for any completed match.

#### Actions:

- **Get Breakdown**
  - Queries match and all participants
  - Calculates all financial shares
  - Shows check-in status
  - Displays organizer & venue info

#### Breakdown Report Includes:
```
Match Status: [upcoming|live|completed|cancelled]
Participant Count: X
Check-in Status: Y/X checked in
Entry Fee: ₵Z

Financial Summary:
├─ Total Collected: ₵A.BC
├─ Platform Fee (5%): ₵D.EF
├─ Venue Share (50%): ₵G.HI
└─ Organizer Share: ₵J.KL

Venue: [Venue Name]
Organizer: [Player Name]
```

#### Test Scenarios:
- ✅ Verify financial calculations
- ✅ Confirm all amounts sum correctly
- ✅ Check wallet updates match report
- ✅ Test with different fee percentages

---

## Full Scenario Buttons

### 🟢 **Happy Path** — Complete End-to-End Success Flow

**What it does** (in sequence):
1. Fills match with 10 players
2. Auto-assigns lineup to both teams
3. Simulates 90% check-in
4. Completes match
5. Shows financial breakdown

**Tests**:
- ✅ Complete match workflow
- ✅ Lineup creation and assignment
- ✅ Check-in functionality
- ✅ Match completion logic
- ✅ Financial payouts
- ✅ Wallet updates

**Expected Result**:
```
✅ Happy Path Complete!
📊 10 players → 12 lineups → ₵X collected
(Breakdown shown in Analytics tab)
```

**Duration**: ~15 seconds

---

### 🟠 **Auto-Cancel** — Test Cancellation & Refunds

**What it does** (in sequence):
1. Fills match with only 5 players
2. Marks match as "cancelled"
3. Refunds all participants

**Tests**:
- ✅ Auto-cancellation trigger
- ✅ Refund calculation
- ✅ Wallet restoration
- ✅ Participant status updates
- ✅ Transaction logging

**Expected Result**:
```
✅ Auto-Cancel Complete!
💸 5 players refunded ₵X total
```

**Use Cases**:
- Test insufficient participants handling
- Verify refund amounts
- Test wallet balance after cancellation

---

### 🔵 **Turf Owner Flow** — Venue Owner Perspective

**What it does** (in sequence):
1. Fills match with 10 players
2. Auto-assigns lineup
3. Completes match
4. Shows turf owner earnings breakdown

**Tests**:
- ✅ Turf owner commission calculation
- ✅ Venue earnings display
- ✅ Payout distribution
- ✅ Revenue tracking

**Expected Result**:
```
✅ Turf Owner Flow Complete!
🏟️ [Venue] earned ₵X
📊 [Organizer] earned ₵Y
```

**Use Cases**:
- Test venue owner dashboard earnings
- Verify turf commission calculations
- Test payout history accuracy

---

## Advanced Testing Scenarios

### Scenario: Test Paid Joins

**Steps**:
1. **Wallet Tab** → Set top-up to ₵100
2. Click **Bulk Top-up ₵100**
3. **Fill Tab** → Enter match ID
4. Click **Fill with 8 Players**
5. Check player wallets updated

**Verifies**:
- ✅ Payment deduction
- ✅ Wallet balance reduction
- ✅ Transaction logging
- ✅ Insufficient balance handling

---

### Scenario: Test Partial Check-in

**Steps**:
1. **Fill Tab** → **Fill + Auto Lineup**
2. **Lifecycle Tab** → Set % to 70
3. Click **Simulate 70% Check-ins**
4. Go to Lobby page for match
5. Verify check-in counts

**Verifies**:
- ✅ Partial attendance handling
- ✅ Check-in UI accuracy
- ✅ No-show tracking

---

### Scenario: Test Impersonation (Manual)

**Goal**: View match as different user type

**Currently Manual** (Feature for future):
- Login as Player A → View match lobby
- Logout
- Login as Turf Owner → View revenue dashboard
- Logout
- Login as Organizer → View match controls

**Test Orchestra Speed-up** (Upcoming):
- Will add "Impersonate Player" button
- Instantly switch between user types
- No re-login needed

---

## Database Tables Modified

Test Orchestra creates and modifies these tables:

### Created During Tests:
- `profiles` — Test user accounts
- `wallet_balances` — Test player balances
- `match_participants` — Test players in matches
- `lineups` — Position assignments

### Modified During Tests:
- `matches` — Status transitions
- `wallet_transactions` — Payouts and refunds
- `match_participants` — Check-in status, team assignments

### RLS & Permissions:
- All operations use admin credentials
- Bypasses normal RLS policies
- **Safe because tests are isolated to test accounts**

---

## Data Cleanup

### Test Accounts Created:
- Prefix: `test_`
- Naming: `test_player_[random]`, `test_organizer_[random]`, `test_turf_owner_[random]`
- **Can be manually deleted from Admin Dashboard**

### Cleanup SQL (if needed):
```sql
-- Delete all test accounts
DELETE FROM profiles WHERE username LIKE 'test_%';
DELETE FROM wallet_balances WHERE user_id IN (
  SELECT id FROM profiles WHERE username LIKE 'test_%'
);

-- Delete all test matches
DELETE FROM matches WHERE title LIKE 'Test Match%';
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `P` | Toggle Test Orchestra (with focus) |
| `Tab` | Switch between tabs |
| `Enter` | Execute default action |
| `Esc` | Close panel |

---

## Troubleshooting

### Issue: "Test operation failed"

**Common causes**:
1. ❌ **Invalid Match ID** — Copy exact ID from database
2. ❌ **Match not found** — Match may be deleted or ID is wrong
3. ❌ **Insufficient balance** — Run Bulk Top-up first
4. ❌ **RLS blocking** — Admin permissions issue

**Solution**:
- Check browser console (F12) for detailed error
- Verify Match ID in database
- Try different match

### Issue: "Players joined but shows 0"

**Possible causes**:
1. Match capacity already full
2. Payment deduction failed
3. Wallet top-up didn't work

**Debug**:
1. Check `match_participants` count: `SELECT COUNT(*) FROM match_participants WHERE match_id = 'X'`
2. Check wallet balance: `SELECT balance FROM wallet_balances WHERE user_id = 'Y'`
3. Check error logs: `SELECT * FROM wallet_transactions WHERE user_id = 'Y' ORDER BY created_at DESC`

### Issue: "Lineup assignment failed"

**Likely cause**: `lineups` table doesn't exist or RLS blocking

**Solution**:
- Run migration to ensure table exists
- Check if `lineups` table exists: `\dt lineups`

---

## Performance Notes

- **Fill with 10 players**: ~2-5 seconds
- **Auto-lineup assignment**: ~1-2 seconds
- **Check-in simulation**: ~1 second
- **Match completion**: ~2-3 seconds
- **Happy Path (full)**: ~10-15 seconds

Test Orchestra optimized for speed:
- ✅ Batch operations where possible
- ✅ Parallel inserts for players
- ✅ Async/await for non-blocking UI
- ✅ Real-time feedback with toast notifications

---

## Best Practices

✅ **DO**:
- Test one scenario at a time
- Clear data after testing
- Use realistic match configurations
- Document manual test steps
- Cross-check wallet balances

❌ **DON'T**:
- Leave test matches in production
- Share admin credentials
- Test with production user IDs
- Run tests during peak hours
- Forget to verify wallet updates

---

## Future Enhancements

Potential Test Orchestra improvements:

- [ ] Impersonation mode (switch user types instantly)
- [ ] Match duplicator (clone any existing match)
- [ ] QR code scanner simulator
- [ ] Dispute simulation
- [ ] Refund approval workflows
- [ ] Email delivery testing
- [ ] Performance benchmarking
- [ ] Automated test reporting
- [ ] Integration with CI/CD

---

## Support & Documentation

**See Also**:
- [playbook.md](../playbook.md) — Full test scenarios
- [AUDIT.md](../AUDIT.md) — Database audit details
- [IMPLEMENTATION_CHECKLIST.md](../IMPLEMENTATION_CHECKLIST.md) — Feature status

**Quick Questions**:
- Check browser console (F12) for errors
- Look at Supabase Dashboard → Functions → test-helpers for logs
- Review database tables directly in Supabase SQL Editor

---

## Summary Table

| Feature | Use Case | Time | Difficulty |
|---------|----------|------|-----------|
| Fill Match | Setup | 30s | Easy |
| Auto Lineup | Testing lineups | 45s | Easy |
| Check-ins | Attendance testing | 15s | Easy |
| Complete Match | Full workflow | 2s | Easy |
| Happy Path | E2E test | 15s | Easy |
| Turf Owner Flow | Revenue testing | 15s | Medium |
| Custom Scenario | Advanced | Varies | Hard |

---

**Happy Testing! 🚀**

*Test Orchestra is a development tool only. Never use in production.*
