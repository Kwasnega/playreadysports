# 📋 Week 2 Deployment Checklist: Moolre Phase 2

**Target Date**: Monday Week 2  
**Expected Duration**: 2-3 hours  
**Team**: Backend (migrations) + DevOps (deployment) + Frontend (admin UI)

---

## ✅ Pre-Deployment Verification

### Code Quality
- [ ] All 4 edge functions follow Deno best practices
- [ ] TypeScript types are complete (no `any` except where necessary)
- [ ] Error handling covers all scenarios (network, validation, auth)
- [ ] Build passes: `npm run build`
- [ ] No lint errors in new code: `npm run lint backend/supabase/functions/moolre-*`

### Security Review
- [ ] Bearer token validation in all edge functions
- [ ] Admin-only checks present in approval endpoint
- [ ] Row locking used in RPC (FOR UPDATE)
- [ ] Input validation on amount, phone, provider
- [ ] Error messages don't leak sensitive data
- [ ] Rate limiting configured (or scheduled for Phase 2B)

### Database
- [ ] Migration file syntax is valid (no typos)
- [ ] All column additions are idempotent (IF NOT EXISTS)
- [ ] Indexes are properly created
- [ ] RPC grants are correct (authenticated + service_role)

### Documentation
- [ ] [MOOLRE_PHASE2_IMPLEMENTATION.md](./MOOLRE_PHASE2_IMPLEMENTATION.md) is complete
- [ ] [MOOLRE_PHASE2_COMPLETION_SUMMARY.md](./MOOLRE_PHASE2_COMPLETION_SUMMARY.md) is complete
- [ ] API endpoints documented
- [ ] Error codes documented
- [ ] Team has access to all docs

---

## 🗄️ Database Migration Steps

### Step 1: Backup Production (5 min)
```bash
# Supabase Dashboard: 
# Settings > Backup > Create Manual Backup
# (or via CLI)
supabase db push --dry-run  # Preview what will run
```

### Step 2: Review Migration (2 min)
```sql
-- File: backend/supabase/migrations/20260617000001_moolre_payout_rpc.sql

-- Verify it contains:
-- 1. CREATE OR REPLACE FUNCTION approve_payout_request(...)
-- 2. ALTER TABLE venue_payout_requests ADD COLUMN IF NOT EXISTS ...
-- 3. CREATE INDEX IF NOT EXISTS ...
-- 4. GRANT EXECUTE ON FUNCTION ...
```

### Step 3: Deploy Migration (5 min)
```bash
# Option A: Via Supabase CLI
supabase migration deploy 20260617000001_moolre_payout_rpc

# Option B: Via Supabase Dashboard
# SQL Editor > Run the migration file directly
```

### Step 4: Verify Migration (2 min)
```sql
-- Check RPC function exists
SELECT p.proname 
FROM pg_proc p 
WHERE p.proname = 'approve_payout_request';
-- Expected: 1 row

-- Check columns added
\d venue_payout_requests
-- Expected: moolre_reference, moolre_transaction_id, etc.

-- Check indexes created
SELECT schemaname, tablename, indexname 
FROM pg_indexes 
WHERE tablename = 'venue_payout_requests';
-- Expected: idx_venue_payout_requests_status, idx_venue_payout_requests_owner
```

---

## 🚀 Edge Function Deployment

### Step 5: Deploy moolre-payout (3 min)
```bash
supabase functions deploy moolre-payout

# Verify
curl -X POST https://<project-id>.supabase.co/functions/v1/moolre-payout \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"request_id": "test"}'
# Expected: 401 Unauthorized (OK, test request)
```

### Step 6: Deploy moolre-payout-webhook (2 min)
```bash
supabase functions deploy moolre-payout-webhook

# Verify
curl -X POST https://<project-id>.supabase.co/functions/v1/moolre-payout-webhook \
  -H "Content-Type: application/json" \
  -d '{"data": {"reference": "invalid"}}'
# Expected: 400 Invalid reference (OK, test request)
```

### Step 7: Deploy moolre-admin-payouts (3 min)
```bash
supabase functions deploy moolre-admin-payouts

# Verify
curl -X GET "https://<project-id>.supabase.co/functions/v1/moolre-admin-payouts?request_id=test" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"
# Expected: 401 Unauthorized (OK, test request)
```

---

## ⚙️ Environment Configuration

### Step 8: Set Environment Variables (5 min)

**Supabase Dashboard** > Settings > API

Add these to `.env.local` (frontend) and Supabase Secrets (backend):

```bash
# Moolre Sandbox (for testing)
MOOLRE_ENV=sandbox
MOOLRE_BASE_URL=https://sandbox.moolre.com

# Keys from Moolre Dashboard
MOOLRE_API_USER=your_api_user
MOOLRE_ACCOUNT_NUMBER=your_account_number
MOOLRE_PUBLIC_KEY=your_public_key        # For payments
MOOLRE_PRIVATE_KEY=your_private_key      # For disbursements
MOOLRE_VAS_KEY=your_vas_key              # For advanced features

# Webhook verification (Phase 2B)
MOOLRE_ACCOUNT_SECRET=your_webhook_secret
```

**Deploy to Supabase**:
```bash
# Via CLI
supabase secrets set MOOLRE_PRIVATE_KEY=xxx
supabase secrets set MOOLRE_VAS_KEY=xxx

# Verify
supabase secrets list
```

---

## 🧪 Manual Testing (Sandbox)

### Test 1: Create Test Request (5 min)

```sql
-- Insert test payout request
INSERT INTO venue_payout_requests (
  id, owner_id, amount, phone_number, provider, status, reference
) VALUES (
  gen_random_uuid(),
  'test-owner-id',
  50.00,
  '+233XXXXXXXXX',
  'MTN',
  'pending'
);

-- Copy the ID for next steps
```

### Test 2: Approve Request (3 min)

```bash
# Call admin endpoint
curl -X POST https://<project-id>.supabase.co/functions/v1/moolre-admin-payouts \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"request_id": "copied-id-from-test-1"}'

# Expected response:
# {
#   "success": true,
#   "message": "Payout approved and disbursement initiated",
#   "moolre_reference": "moolre_ref_...",
#   "status": "in_transit"
# }
```

### Test 3: Verify Status Changed (2 min)

```sql
-- Check venue_payout_requests
SELECT id, status, moolre_reference, processing_started_at
FROM venue_payout_requests
WHERE id = 'test-id';

-- Expected:
-- status = 'in_transit'
-- moolre_reference = 'moolre_ref_...'
-- processing_started_at = now()
```

### Test 4: Simulate Webhook (3 min)

```bash
# Call webhook with success response
curl -X POST https://<project-id>.supabase.co/functions/v1/moolre-payout-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "reference": "moolre_payout_<test-id>",
      "transactionid": "txn_123456",
      "txstatus": 1,
      "message": "Successful"
    }
  }'

# Expected: HTTP 200 OK
```

### Test 5: Verify Completion (2 min)

```sql
-- Check final status
SELECT id, status, completed_at, moolre_transaction_id
FROM venue_payout_requests
WHERE id = 'test-id';

-- Expected:
-- status = 'completed'
-- completed_at = now()
-- moolre_transaction_id = 'txn_123456'

-- Check notification created
SELECT type, title, body
FROM notifications
WHERE user_id = 'test-owner-id'
ORDER BY created_at DESC
LIMIT 1;

-- Expected:
-- type = 'payout_completed'
-- title = 'Your Withdrawal is Complete!'
```

---

## 👨‍💼 Admin Dashboard Integration

### Step 9: Add Admin Approval UI (TBD - DevOps responsibility)

**Requirements** (for frontend developer):

1. **Payout Queue View**
   - Table showing venue_payout_requests with status='pending'
   - Columns: owner name, amount, phone, provider, created_at, actions
   - Filter by status (pending, pending_moolre, in_transit, completed, failed)
   - Sort by created_at (newest first)

2. **Approve Button**
   ```typescript
   const handleApprove = async (requestId: string) => {
     const response = await fetch(
       `/moolre-admin-payouts?request_id=${requestId}`,
       {
         method: 'POST',
         headers: { Authorization: `Bearer ${token}` }
       }
     );
     // Show toast: success or error
     // Refresh table
   };
   ```

3. **Real-time Status Updates**
   ```typescript
   const channel = supabase.channel('venue_payouts')
     .on('postgres_changes',
       { event: '*', schema: 'public', table: 'venue_payout_requests' },
       (payload) => setRows([...rows, payload.new])
     )
     .subscribe();
   ```

4. **Display Moolre Reference**
   - Show `moolre_reference` for in_transit/completed requests
   - Allow admin to click → view on Moolre dashboard

### Estimated Time: 2-3 hours (frontend developer)

---

## 🔍 Sanity Checks

### Before Go-Live

- [ ] **Build passes**: `npm run build` (no TypeScript errors)
- [ ] **All functions deployed**: `supabase functions list` (shows 3 new functions)
- [ ] **Environment vars set**: `supabase secrets list` (shows MOOLRE_PRIVATE_KEY)
- [ ] **Database migration applied**: `\d venue_payout_requests` (shows new columns)
- [ ] **RPC function callable**: `SELECT approve_payout_request(...)` (returns JSON)
- [ ] **Admin UI ready**: Dashboard shows "Pending Payouts" section
- [ ] **Webhook URL accessible**: `GET /moolre-payout-webhook` (returns 405, not 404)
- [ ] **Moolre sandbox connected**: Test API call succeeds (or shows Moolre error, not 500)

### Post-Deployment Monitoring (First 24h)

- [ ] **Monitor logs**: `supabase functions list --verbose`
  - No "permission denied" errors
  - No "column not found" errors
  - No "RPC not found" errors

- [ ] **Check database**: `SELECT COUNT(*) FROM venue_payout_requests WHERE status = 'in_transit'`
  - Should have real requests in transit

- [ ] **Monitor Moolre webhooks**:
  - Check Moolre dashboard for outgoing webhooks
  - Verify callbacks are being received
  - Check webhook logs in Supabase

- [ ] **Test error scenarios**:
  - [ ] Request with no phone (should fail gracefully)
  - [ ] Approve already-completed request (should reject)
  - [ ] Network timeout during Moolre call (should revert to pending)

---

## 🚨 Rollback Plan

If deployment fails:

### Quick Rollback (< 5 min)
```bash
# Disable edge functions (if broken)
supabase functions delete moolre-payout
supabase functions delete moolre-payout-webhook
supabase functions delete moolre-admin-payouts

# Fallback: Use old wallet-withdraw flow (just returns "pending")
# Users can still request withdrawals, just won't auto-process
```

### Full Rollback (if migration fails)
```bash
# Revert migration
supabase migration undo 20260617000001_moolre_payout_rpc

# Note: Supabase backups are automatic, can restore if needed
```

---

## ✨ Success Criteria

- [ ] All 3 edge functions deployed and responding
- [ ] Migration applied successfully (columns + RPC + indexes)
- [ ] Manual test scenario (approve → disbursement) completes
- [ ] Admin dashboard shows pending payouts
- [ ] No errors in production logs for 24 hours
- [ ] At least 1 real payout processed end-to-end
- [ ] Owner receives notification + money in wallet

---

## 📞 Support Contacts

| Role | Contact | Availability |
|------|---------|--------------|
| Backend Lead | [Your name] | 9am-5pm |
| DevOps | [Your name] | On-call |
| Moolre Support | support@moolre.com | Business hours |
| Supabase Support | support@supabase.io | 24/7 |

---

## 📝 Post-Deployment Tasks

**Day 1 (Immediately after deployment)**:
- [ ] Monitor for errors (first 2 hours)
- [ ] Document any issues + fixes
- [ ] Brief team on what changed

**Week 2 (Throughout the week)**:
- [ ] Gather feedback from first beta users
- [ ] Monitor withdrawal processing times
- [ ] Check for webhook timeouts or failures
- [ ] Plan Phase 2B (webhook signature verification)

**Week 3 (Post-competition)**:
- [ ] Implement webhook signature verification
- [ ] Add rate limiting
- [ ] Performance optimization if needed

---

**Status**: Ready for Week 2 Deployment ✅  
**Prepared by**: Codex (Phase 1 + Phase 2)  
**Review by**: [DevOps Lead]  
**Approved by**: [Engineering Manager]
