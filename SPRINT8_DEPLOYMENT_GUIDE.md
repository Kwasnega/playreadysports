# Sprint 8: Smart Features Deployment Guide

## **DEPLOYMENT CHECKLIST**

### **1. SQL MIGRATIONS (Run in Supabase SQL Editor)**

Run this migration to set up the auto-cancel stale matches pg_cron job:

**File:** `backend/supabase/migrations/20260619010000_pg_cron_auto_cancel_stale.sql`

```sql
-- Copy entire file and run in Supabase SQL editor
```

✅ **Already fixed** - syntax error removed, ready to deploy.

---

### **2. EDGE FUNCTIONS TO DEPLOY**

Deploy these via Supabase CLI:

#### **Function 1: auto-cancel-stale-matches** (NEW)
```bash
supabase functions deploy auto-cancel-stale-matches
```
- **Purpose:** Manually trigger cancellation of matches past their scheduled time
- **File:** `backend/supabase/functions/auto-cancel-stale-matches/index.ts`
- **Frequency:** Can be called manually or scheduled

#### **Function 2: match-reminders** (UPDATED)
```bash
supabase functions deploy match-reminders
```
- **Purpose:** Send reminders + low registration alerts
- **File:** `backend/supabase/functions/match-reminders/index.ts`
- **Changes:** Added 10-min low registration check
- **Frequency:** Already scheduled via pg_cron every 15 minutes

#### **All Other Functions:** No changes needed
- `complete-match` ✅
- `send-notification` ✅
- `broadcast-match` ✅
- All others remain unchanged

---

## **AUTO-CANCEL LOGIC CLARIFICATION**

There are **TWO separate auto-cancel systems** that work together:

### **System A: Auto-Cancel Underfilled Matches** (EXISTING - Before Kickoff)
- **When:** Within admin-configured window BEFORE match starts
- **Condition:** Match still not full + below minimum players
- **Example:** Match at 3 PM, 20-min window, only 2/10 players at 2:40 PM → cancel
- **RPC:** `auto_cancel_underfilled_matches()` (Supabase scheduled job)
- **Status:** Already deployed ✅

### **System B: Auto-Cancel Stale Matches** (NEW - After Kickoff) 
- **When:** Every 5 minutes via pg_cron
- **Condition:** Match past scheduled time but still marked "upcoming"
- **Example:** Match was at 3 PM, now 3:15 PM and still shows "Upcoming" → cancel
- **Purpose:** Prevents confusion of seeing past matches still listed
- **RPC/Function:** `auto-cancel-stale-matches` edge function
- **Status:** New - needs deployment

### **System C: Low Registration Alert** (NEW - Notification Only)
- **When:** 10 minutes before kickoff
- **Condition:** Check-ins below 50% threshold
- **Action:** Notify organizer ONLY (doesn't auto-cancel, lets them decide)
- **Function:** Built into `match-reminders`
- **Status:** New - needs deployment

---

## **DASHBOARD STATS FIXES**

### **Fixed Issues:**
1. ✅ **AdminRevenue.tsx** - Now checks both `status='completed'` AND `intelligent_status='ended'`
2. ✅ **VenueOwnerDashboard.tsx** - Stats now check both status types for:
   - Completed count
   - Cancelled count  
   - Revenue calculation
   - Average players/match

### **Why "Upcoming 11":**
This shows there are **11 upcoming matches** - completely normal! Not an error.
- Upcoming count includes: matches with `intelligent_status` IN ('upcoming', 'soon')
- This is correct behavior

### **Stats Display:**
Stats should now correctly show:
- **Completed:** Green card with count of finished matches
- **Live:** Blue card showing currently active matches
- **Upcoming:** Purple card showing 11 (or your count) upcoming matches
- **Cancelled:** Red card showing cancelled matches
- **Revenue:** Amber card showing total ₵ from completed matches
- **Avg/Match:** Cyan card showing average players per completed match

---

## **QUICK DEPLOYMENT STEPS**

1. **SQL First** (in Supabase Dashboard → SQL Editor):
   ```
   Run: 20260619010000_pg_cron_auto_cancel_stale.sql
   ```

2. **Functions Next** (via terminal):
   ```bash
   supabase functions deploy auto-cancel-stale-matches
   supabase functions deploy match-reminders
   ```

3. **Test in Browser:**
   - Go to Venue Owner Dashboard
   - Check stats show correct numbers
   - Stats should show Completed, Cancelled, Revenue, etc.

4. **Verify Edge Functions:**
   - Check Supabase Dashboard → Functions → see both deployed
   - Check logs for any errors

---

## **NEW NOTIFICATION TYPES**

Added to notifications system:
- `match_low_registration` - Organizer alert 10 min before
- `lineup_locked` - Player notification when lineup locked
- `match_live` - All participants when match starts  
- `match_completed` - All participants when result submitted

---

## **WHAT CHANGED IN THIS SPRINT**

✅ Auto-complete with validation (check time, check-ins, payment)
✅ Auto-cancel stale matches (past scheduled time)
✅ Low registration alert (10 min before)
✅ Lineup lock (10 min before kickoff)
✅ Status change notifications (all participants notified)
✅ Notification helper library created
✅ Dashboard stats fixed to check both status types
✅ Admin revenue query fixed
✅ Lineup permission fixed (creator-only)
✅ Mark as complete validation added

---

## **KNOWN LIMITATIONS**

1. Lineup lock is time-based (10 min countdown) - local time in browser
2. Low registration alert is notification-only (organizer decides to cancel)
3. Auto-cancel stale runs every 5 min (small delay possible)
4. pg_cron jobs require Supabase Pro plan

---

## **TROUBLESHOOTING**

**If stats still show 0:**
- Check that matches have `status='completed'` OR `intelligent_status='ended'`
- Verify matches exist in database from last 90 days
- Check date filters are correct

**If functions don't deploy:**
```bash
supabase functions deploy auto-cancel-stale-matches --no-verify-jwt
```

**If pg_cron job fails:**
- Ensure pg_cron extension is enabled in Supabase Dashboard
- Check `cron.job_run_details` table for error logs

