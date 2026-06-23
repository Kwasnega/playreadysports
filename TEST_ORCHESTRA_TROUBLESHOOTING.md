# Test Orchestra — Troubleshooting & Debugging Guide

## Quick Problem Solver

### "Button Not Visible"
**❌ Problem**: Purple ⚡ button not showing in admin panel

**Diagnosis**:
1. Are you logged in? → Check top-right avatar
2. Are you an admin? → Check `user_roles` table: `SELECT * FROM user_roles WHERE user_id = '[your_id]'`
3. Is AdminLayout rendering? → Check browser console (F12)

**Fix**:
```sql
-- Verify admin role
SELECT id, role FROM profiles WHERE id = '[your_user_id]';

-- If not admin, update:
UPDATE profiles SET role = 'admin' WHERE id = '[your_user_id]';
```

---

### "Match Not Found" Error
**❌ Problem**: Operation fails with "Match not found"

**Common Causes**:
1. ❌ Wrong match ID copied
2. ❌ Match was deleted
3. ❌ Match belongs to different Supabase project
4. ❌ ID not in UUID format

**Diagnosis**:
```sql
-- Verify match exists
SELECT id, title, status FROM matches WHERE id = '[your_id]';

-- If nothing, try searching by title:
SELECT id, title FROM matches WHERE title LIKE '%YourSearch%' LIMIT 5;

-- Check all matches:
SELECT id, title, status, created_at FROM matches 
ORDER BY created_at DESC LIMIT 10;
```

**Fix**:
- Copy exact ID from `SELECT id FROM matches` output
- Paste into Test Orchestra Match ID field
- Try again

---

### "Players Joined = 0" (Nothing Happened)
**❌ Problem**: Filled match but participants not created

**Root Causes**:
1. **Insufficient wallet balance** → Entry fee exceeds wallet
2. **Match capacity full** → No spots available
3. **RLS blocking** → Permission denied
4. **Network error** → Edge function timeout

**Diagnosis**:
```sql
-- 1. Check match entry fee
SELECT id, title, entry_fee, max_core_players FROM matches WHERE id = '[id]';

-- 2. Check existing participants
SELECT COUNT(*) as participant_count FROM match_participants 
WHERE match_id = '[id]' AND status = 'active';

-- 3. Check if wallet exists
SELECT * FROM wallet_balances 
WHERE user_id IN (SELECT id FROM profiles WHERE username LIKE 'test_%');

-- 4. Check recent transactions
SELECT * FROM wallet_transactions 
WHERE created_at > now() - interval '5 minutes'
ORDER BY created_at DESC LIMIT 10;
```

**Fix** (Step by Step):
1. Go to **Wallet Tab**
2. Set amount to ₵500
3. Click **Bulk Top-up ₵500**
4. Wait for toast confirmation
5. Go back to **Fill Tab**
6. Try again with fewer players (start with 5)

---

### "Lineup Assignment Failed"
**❌ Problem**: "Fill + Auto Lineup" completes fill but skips lineup

**Root Causes**:
1. `lineups` table missing or wrong schema
2. RLS policy blocking inserts
3. Player count doesn't match position slots
4. Participant IDs not found

**Diagnosis**:
```sql
-- 1. Check if lineups table exists
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables 
  WHERE table_name = 'lineups'
);

-- 2. Check lineups schema
\d lineups  -- Shows table structure

-- 3. Try manual insert
INSERT INTO lineups (match_id, player_id, team, position) 
VALUES ('[match_id]', '[player_id]', 'reds', 'goalkeeper');

-- 4. Check RLS policies
SELECT * FROM pg_policies WHERE tablename = 'lineups';
```

**Fix**:
```sql
-- Create lineups table if missing
CREATE TABLE IF NOT EXISTS public.lineups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team text NOT NULL,
  position text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE lineups ENABLE ROW LEVEL SECURITY;

-- Allow service role (admin operations)
CREATE POLICY "Service role can manage lineups"
  ON lineups
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Grant permissions
GRANT ALL ON lineups TO service_role;
```

Then retry in Test Orchestra.

---

### "Wallet Shows 0 After Top-up"
**❌ Problem**: Bulk Top-up completes but wallet still empty

**Root Causes**:
1. Test accounts weren't created yet
2. Top-up ran but didn't find test_* users
3. Different Supabase project
4. Query filtered wrong accounts

**Diagnosis**:
```sql
-- 1. Count test accounts
SELECT COUNT(*) FROM profiles WHERE username LIKE 'test_%';

-- 2. Check their wallets
SELECT u.username, w.balance FROM profiles u
LEFT JOIN wallet_balances w ON u.id = w.user_id
WHERE u.username LIKE 'test_%';

-- 3. Check top-up transaction
SELECT * FROM wallet_transactions 
WHERE user_id IN (SELECT id FROM profiles WHERE username LIKE 'test_%')
ORDER BY created_at DESC LIMIT 10;
```

**Fix**:
1. **Create test players first**: Use Fill action to create players
2. **Then bulk top-up**: Test accounts will exist
3. **Verify**: Check query above

Alternative (manual):
```sql
-- Manually top-up all test accounts
UPDATE wallet_balances SET balance = 500
WHERE user_id IN (
  SELECT id FROM profiles WHERE username LIKE 'test_%'
);
```

---

### "Force Complete Shows 0 Payouts"
**❌ Problem**: Match completed but no financial breakdown

**Root Causes**:
1. Match has no entry fee (free match)
2. Participants not paid (payment_status != 'paid')
3. Completion failed silently
4. Breakdown query filtered wrong data

**Diagnosis**:
```sql
-- 1. Check match entry fee
SELECT entry_fee FROM matches WHERE id = '[id]';

-- 2. Count paid participants
SELECT COUNT(*) FROM match_participants 
WHERE match_id = '[id]' AND payment_status = 'paid';

-- 3. Check match status after completion
SELECT status, completed_at FROM matches WHERE id = '[id]';

-- 4. Check organizer wallet
SELECT balance FROM wallet_balances 
WHERE user_id = (SELECT organizer_id FROM matches WHERE id = '[id]');
```

**Fixes**:

For **zero entry fee** (free match):
- Entry fee is correct (free matches show ₵0 payouts)
- This is expected behavior

For **unpaid participants**:
```sql
-- Update all participants to paid
UPDATE match_participants 
SET payment_status = 'paid' 
WHERE match_id = '[id]' AND status = 'active';

-- Then retry Force Complete
```

For **failed completion**:
```sql
-- Check error logs
SELECT * FROM match_participants WHERE match_id = '[id]';
-- Verify at least 1 paid participant exists

-- Manually set to completed
UPDATE matches SET status = 'completed' WHERE id = '[id]';
```

---

### "Check-in Simulation Shows Wrong Percentage"
**❌ Problem**: Set 75% but shows 100% checked in

**Root Causes**:
1. Percentage input not saved
2. UI showing different value than submitted
3. Query counting wrong records

**Diagnosis**:
```sql
-- Check actual check-in count
SELECT 
  COUNT(*) as total,
  COUNT(CASE WHEN attendance_scanned = true THEN 1 END) as checked_in
FROM match_participants 
WHERE match_id = '[id]';

-- Calculate percentage
SELECT 
  ROUND(100.0 * COUNT(CASE WHEN attendance_scanned = true THEN 1 END) / COUNT(*)) as percentage
FROM match_participants 
WHERE match_id = '[id]';
```

**Fix**:
1. Make sure percentage slider is updated (not just typed)
2. Click "Simulate N% Check-ins" button
3. Wait for completion toast
4. Verify in Analytics tab

---

### "Analytics Breakdown Not Loading"
**❌ Problem**: Get Breakdown returns empty or error

**Root Causes**:
1. Match ID empty or invalid
2. Match has no participants
3. Match data incomplete
4. Query timeout

**Diagnosis**:
```sql
-- 1. Verify match exists
SELECT * FROM matches WHERE id = '[id]';

-- 2. Check participants
SELECT COUNT(*) FROM match_participants WHERE match_id = '[id]';

-- 3. Check venue relationship
SELECT v.name FROM venues v 
JOIN matches m ON m.venue_id = v.id 
WHERE m.id = '[id]';
```

**Fix**:
1. Ensure Match ID is filled in
2. Ensure match exists (check above query)
3. Try with different match ID
4. If persistent, check browser console (F12) for detailed error

---

### "Edge Function Timeout"
**❌ Problem**: Operation takes too long or shows timeout

**Root Causes**:
1. Too many players (100+) overloads function
2. Database slow
3. Network latency
4. Supabase function timeout (30s limit)

**Diagnosis**:
```bash
# Check Supabase function logs
# 1. Go to: https://supabase.com/dashboard/project/[project_id]/functions
# 2. Click: test-helpers
# 3. View Logs tab for errors
```

**Fixes**:
1. **Reduce player count**: Try 10 instead of 50
2. **Check Supabase status**: https://status.supabase.com/
3. **Wait and retry**: Try after a few seconds
4. **Check internet**: Ensure stable connection

**For development** (run locally):
```bash
# Test edge function locally
npx supabase functions serve --env-file .env.local

# Then call: http://localhost:54321/functions/v1/test-helpers
```

---

### "Test Accounts Not Cleaned Up"
**❌ Problem**: Too many test_* accounts accumulating

**Root Causes**:
1. Manual cleanup never run
2. Don't know how to delete safely
3. Worried about data loss

**Safe Cleanup** (Step by Step):

```sql
-- STEP 1: Backup test data (optional)
COPY (SELECT * FROM profiles WHERE username LIKE 'test_%') 
TO PROGRAM 'cat > /tmp/test_profiles_backup.csv';

-- STEP 2: Delete test wallets
DELETE FROM wallet_balances 
WHERE user_id IN (SELECT id FROM profiles WHERE username LIKE 'test_%');

-- STEP 3: Delete test profiles
DELETE FROM profiles WHERE username LIKE 'test_%';

-- STEP 4: Delete orphaned auth users (if needed)
-- NOTE: This must be done in Supabase Auth UI, not SQL

-- VERIFY: Check count
SELECT COUNT(*) FROM profiles WHERE username LIKE 'test_%';
-- Should show: 0
```

---

### "Performance Issues / Slow Operations"
**❌ Problem**: Fill, Complete, or other actions taking >10 seconds

**Diagnosis**:
```sql
-- Check table sizes
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;

-- Check slow queries
-- 1. Go to Supabase Dashboard
-- 2. SQL Editor → Performance
-- 3. Look for slow queries
```

**Fixes**:
1. **Add missing indexes**:
```sql
CREATE INDEX idx_match_participants_match_id 
ON match_participants(match_id);

CREATE INDEX idx_wallet_user 
ON wallet_balances(user_id);
```

2. **Reduce batch size**: Fill with 10 instead of 100

3. **Check database health**:
   - Supabase Dashboard → Database → Monitoring
   - Check CPU, Memory, Connections

---

### Browser Console Errors

**How to View**:
1. Press `F12` in browser
2. Click "Console" tab
3. Look for red error messages

**Common Errors**:

```javascript
// Error: "Cannot read properties of null"
// Fix: Make sure Match ID is entered and valid

// Error: "CORS error"
// Fix: Check edge function deployment (should be deployed)

// Error: "Unauthorized" or 403
// Fix: Check admin role: SELECT role FROM profiles WHERE id = auth.uid();

// Error: "Network error" or timeout
// Fix: Check internet connection, Supabase status
```

---

## Debug Checklist

When something goes wrong, run through this:

- [ ] Check browser console (F12) for errors
- [ ] Verify you're logged in as admin
- [ ] Verify Match ID is correct
- [ ] Verify match exists in database
- [ ] Verify test accounts created (if needed)
- [ ] Verify wallets have balance
- [ ] Check Supabase function logs
- [ ] Try with smaller numbers (5 players, 50%)
- [ ] Check database directly with SQL queries
- [ ] Check Supabase status page
- [ ] Try refreshing admin panel
- [ ] Try different browser/incognito window
- [ ] Contact support with specific error

---

## Advanced Debugging

### Enable SQL Logging

```sql
-- Check all recent operations
SELECT * FROM wallet_transactions 
WHERE created_at > now() - interval '1 hour'
ORDER BY created_at DESC;

SELECT * FROM audit.record_all_audit_logs 
WHERE event = 'UPDATE' AND table_name = 'wallet_balances'
ORDER BY action_tstamp DESC LIMIT 20;
```

### Monitor Live Operations

```bash
# Watch wallet_transactions in real-time
# In Supabase SQL Editor, run repeatedly:
SELECT COUNT(*) FROM wallet_transactions WHERE created_at > now() - interval '1 minute';

# Should increase as tests run
```

### Test Edge Function Directly

```bash
# Test via curl
curl -X POST https://[project].supabase.co/functions/v1/test-helpers \
  -H "Authorization: Bearer [anon_key]" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "fill-match",
    "matchId": "[match_id]",
    "count": 5
  }'

# Expected response:
# {
#   "success": true,
#   "data": {
#     "joined": 5,
#     "failed": 0,
#     "totalSpent": 50
#   }
# }
```

---

## Support Resources

**Files to Review**:
- 📄 [TEST_ORCHESTRA_GUIDE.md](TEST_ORCHESTRA_GUIDE.md) — Full documentation
- 📄 [TEST_ORCHESTRA_QUICK_REF.md](TEST_ORCHESTRA_QUICK_REF.md) — Quick reference
- 📄 [TEST_ORCHESTRA_SUMMARY.md](TEST_ORCHESTRA_SUMMARY.md) — Implementation details

**Code Files**:
- 💻 [src/components/admin/TestOrchestra.tsx](src/components/admin/TestOrchestra.tsx)
- ⚙️ [backend/supabase/functions/test-helpers/index.ts](backend/supabase/functions/test-helpers/index.ts)

**Database Queries**:
- SQL commands in this guide can be run in Supabase SQL Editor
- Safe for testing/debugging (no production impact)

---

## When to Escalate

Contact the development team if:

1. ❌ Edge function shows 500+ error repeatedly
2. ❌ Database query impossible (permission denied)
3. ❌ Supabase service appears down
4. ❌ Test data corrupted in unexpected way
5. ❌ Consistent timeout issues (>30s)

**Provide**:
- Screenshot of error
- Match ID that failed
- Steps to reproduce
- Browser console log (F12)
- Supabase function logs

---

**Last Updated**: June 20, 2026  
**Troubleshooting Guide**: Version 1.0

🔧 **Happy Debugging!**
