# Test Orchestra — Quick Reference Card

## 🚀 One-Minute Start

1. Open admin panel
2. Click purple ⚡ icon (bottom-right)
3. Enter Match ID
4. Choose action from tabs
5. Click button
6. Done! 🎉

---

## 📋 Action Matrix

| Goal | Tab | Action | Time |
|------|-----|--------|------|
| Add players | Fill | Fill with 8/12/N | 30s |
| Setup lineup | Fill | Fill + Auto Lineup | 45s |
| Test check-in | Lifecycle | Simulate N% Check-ins | 15s |
| Start match | Lifecycle | Force Start Match | 5s |
| Complete match | Lifecycle | Force Complete | 2s |
| Cancel match | Lifecycle | Force Cancel | 2s |
| Add money | Wallet | Bulk Top-up ₵N | 5s |
| See breakdown | Analytics | Get Breakdown | 2s |

---

## 🎯 Pre-Built Scenarios

### Happy Path (10-15s)
```
Fill (10) → Lineup → Check-in (90%) → Complete → Breakdown
```
✅ Tests: Full workflow, payouts, wallet updates

### Auto-Cancel (5s)
```
Fill (5) → Cancel → Refunds
```
✅ Tests: Cancellation, refund logic

### Turf Owner (15s)
```
Fill (10) → Lineup → Complete → Earnings breakdown
```
✅ Tests: Venue payouts, revenue tracking

---

## 💡 Common Recipes

### Test Paid Joins
1. Wallet Tab → **Bulk Top-up ₵100**
2. Fill Tab → **Fill with 8 Players**
3. Verify wallets debited

### Test Partial Attendance
1. Fill Tab → **Fill with 12 Players**
2. Lifecycle Tab → **Simulate 75% Check-ins**
3. Verify 9/12 marked attended

### Test Lineup with Small Team
1. Fill Tab → **Fill with 6 Players** (or use custom)
2. Fill Tab → **Fill + Auto Lineup**
3. Analytics Tab → **Get Breakdown** (shows lineup assignments)

---

## 🔍 Data Verification

After running any test, verify in Supabase:

```sql
-- Check participants
SELECT COUNT(*) FROM match_participants 
WHERE match_id = '[YOUR_MATCH_ID]' AND status = 'active';

-- Check wallets
SELECT balance FROM wallet_balances 
WHERE user_id = '[PLAYER_ID]';

-- Check transactions
SELECT * FROM wallet_transactions 
WHERE user_id = '[PLAYER_ID]' 
ORDER BY created_at DESC LIMIT 5;
```

---

## ⚡ Tips & Tricks

✨ **Use fill with specific numbers** for exact test scenarios
- 5 = Small match
- 8 = Standard (4v4)
- 10 = Popular (5v5)
- 12+ = Large tournament

💡 **Check percentages first** before simulating check-ins
- 50% = Half no-show (edge case)
- 90% = Realistic attendance
- 100% = Perfect attendance

🎯 **Always use Analytics tab** after completing a match
- Verify money math
- Check wallet updates
- See full breakdown

---

## ⚠️ Quick Troubleshooting

| Issue | Fix |
|-------|-----|
| "Match not found" | Check Match ID is copied exactly |
| "Players joined = 0" | Run Bulk Top-up first, then retry |
| "Lineup failed" | Try smaller player count (6-8) |
| Button greyed out | Operation still running (wait) |
| No breakdown shown | Match may not be completed |

---

## 📊 Expected Results

### After "Fill with 10"
- 10 participants created ✅
- Wallets debited ✅
- Half reds, half blues ✅
- Status: active ✅

### After "Force Complete"
- Match status: completed ✅
- Organizer wallet: +₵X ✅
- Venue wallet: +₵Y ✅
- Platform fee: -5% ✅

### After "Force Cancel"
- Match status: cancelled ✅
- All players refunded ✅
- Wallets restored ✅

---

## 🎓 Learning Path

**Beginner**:
1. Fill Match (8 players)
2. View Analytics → See participant list
3. Force Complete → View payouts

**Intermediate**:
1. Happy Path scenario
2. Verify each step in database
3. Check wallet transactions

**Advanced**:
1. Custom player count + lineup
2. Partial check-in scenarios
3. Financial calculation verification

---

## 🛠️ For QA/Testing Team

**Regression Testing Suite**:
```
1. Happy Path scenario
2. Auto-Cancel scenario  
3. Turf Owner flow
4. Partial attendance (75%)
5. All wallet operations
```

**Expected Time**: ~5 minutes
**Recommended Frequency**: Before each deployment

---

## 📱 Mobile Note

Test Orchestra works on desktop admin panel only.
On mobile: Use responsive admin view instead.

---

**Remember**: This is for development/testing only! 🔒
