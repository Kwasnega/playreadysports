# Moolre Phase 2: Withdrawal Automation Implementation

**Status**: ✅ COMPLETE  
**Created**: Week 1 (Launch Week)  
**Target Deployment**: Week 2  
**Priority**: HIGH - Required for competition demo

---

## 📋 Overview

Phase 2 automates turf owner withdrawals using Moolre's Bulk Disbursement API. Money flows from completed matches → venue owner balance → Moolre mobile money payout → owner's wallet.

### Components Implemented

| Component | File | Status |
|-----------|------|--------|
| Payout Edge Function | `backend/supabase/functions/moolre-payout/index.ts` | ✅ Complete |
| Payout Webhook Handler | `backend/supabase/functions/moolre-payout-webhook/index.ts` | ✅ Complete |
| Approve RPC Function | `backend/supabase/migrations/20260617000001_moolre_payout_rpc.sql` | ✅ Complete |
| Admin Approval Endpoint | `backend/supabase/functions/moolre-admin-payouts/index.ts` | ✅ Complete |
| Frontend Hook | `src/hooks/useWallet.ts` | ✅ Already supports withdraw() |

---

## 🔄 Withdrawal Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ TURF OWNER REQUESTS WITHDRAWAL                                  │
└──────────┬──────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. Frontend: useWallet.withdraw(amount, phone, provider)        │
│    POST /moolre-webhook/wallet-withdraw                          │
└──────────┬──────────────────────────────────────────────────────┘
           │ Amount validated, status=pending
           ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. Backend: venue_payout_requests (status=pending)              │
│    wallet_balances.balance -= amount                            │
│    Response: pending_moolre (admin action required)             │
└──────────┬──────────────────────────────────────────────────────┘
           │
           ├─────────────────────────────────────────────────┐
           │  MANUAL PROCESS (until automation added)       │
           │                                                │
           ▼                                                │
┌─────────────────────────────────────────────────────────────────┐ │
│ 3. Admin: Approve via Dashboard / API                           │ │
│    POST /moolre-admin-payouts?request_id=<id>                   │ │
│    Calls: approve_payout_request RPC                            │ │
└──────────┬──────────────────────────────────────────────────────┘ │
           │  status=pending_moolre                              │
           │                                                      │
           ├──────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. Backend: Trigger Moolre Disbursement                         │
│    POST /disburse/send (Moolre API)                             │
│    Params: amount, phone, provider, reference                   │
│    Response: moolre_reference, transaction_id                   │
└──────────┬──────────────────────────────────────────────────────┘
           │ status=in_transit
           ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. Moolre Processing                                            │
│    ✓ Validates phone + provider                                │
│    ✓ Sends to mobile money network (MTN/Vodafone/AirtelTigo)  │
│    ✓ Sends webhook callback (txstatus=1 or 0)                 │
└──────────┬──────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. Backend: Receive Moolre Webhook                              │
│    POST /moolre-payout-webhook                                  │
│    Parses: reference, txstatus, message                         │
│    Updates: venue_payout_requests (status=completed or failed)  │
│    Notifies: Venue owner via in-app notification                │
└──────────┬──────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│ 7. Money in Owner's Mobile Wallet ✅                            │
│    ✓ Vendor receives SMS confirmation from network             │
│    ✓ Balance appears in mobile money account                    │
│    ✓ Owner can withdraw to bank or use for payments             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 File Structure

### Edge Functions

#### `moolre-payout/index.ts` (183 lines)
**Purpose**: Initiate Moolre disbursement for approved payout requests

**Key Logic**:
```typescript
1. Validate authorization + user is admin/owner
2. Get venue_payout_requests record
3. Verify status === 'pending_moolre'
4. Get owner's phone number from profiles
5. Call moolrePost("/disburse/send", {...}, "private")
   - amount: GHS amount (e.g., 50.00)
   - phone: E.164 format (+233XXX...)
   - provider: MTN | VODAFONE | AIRTELTIGO
   - reference: moolre_payout_<request_id>
   - callback: webhook URL
6. Update status → "in_transit" + store moolre_reference
7. Return moolre_reference for tracking
```

**Response**:
```json
{
  "success": true,
  "moolre_reference": "moolre_ref_...",
  "moolre_transaction_id": "txn_...",
  "status": "in_transit"
}
```

---

#### `moolre-payout-webhook/index.ts` (102 lines)
**Purpose**: Handle Moolre disbursement confirmation callbacks

**Key Logic**:
```typescript
1. Extract reference from payload
2. Validate reference format: "moolre_payout_<request_id>"
3. Parse txstatus:
   - txstatus === 1 → success
   - txstatus === 0 → failure
4. Update venue_payout_requests:
   - status: 'completed' or 'failed'
   - completed_at, error_reason
   - moolre_transaction_id
5. Notify owner via in-app notification:
   - ✅ "Withdrawal Complete: ₵X sent to your mobile money"
   - ❌ "Withdrawal Failed: [reason]"
```

**Webhook Format** (from Moolre):
```json
{
  "data": {
    "reference": "moolre_payout_<request_id>",
    "transactionid": "txn_123456",
    "txstatus": 1,
    "message": "Successful"
  }
}
```

---

### Database

#### Migration: `20260617000001_moolre_payout_rpc.sql`

**New RPC**: `approve_payout_request(p_request_id, p_approved_by_user_id)`
- Validates approver is admin
- Locks row (prevents double-approval)
- Sets status → 'pending_moolre'
- Tracks approval metadata (approved_by, approved_at)

**Columns Added** (idempotent):
```sql
moolre_reference      TEXT
moolre_transaction_id TEXT
processing_started_at TIMESTAMPTZ
completed_at          TIMESTAMPTZ
error_reason          TEXT
approved_by           UUID (FK → profiles)
approved_at           TIMESTAMPTZ
```

**Indexes Added**:
```sql
idx_venue_payout_requests_status  → Fast admin queue queries
idx_venue_payout_requests_owner   → Fast owner history queries
```

---

### API Routes

#### `GET/POST /moolre-admin-payouts?request_id=<id>`

**Authentication**: Admin-only (checks profiles.role)

**Flow**:
1. Validate request_id
2. Call `approve_payout_request` RPC
3. Call `moolre-payout` edge function
4. Return moolre_reference or error

**Success Response**:
```json
{
  "success": true,
  "message": "Payout approved and disbursement initiated",
  "moolre_reference": "moolre_ref_...",
  "status": "in_transit"
}
```

**Failure Scenarios**:
| Error | HTTP | Cause |
|-------|------|-------|
| Not admin | 403 | User lacks permission |
| Request not found | 404 | Invalid request_id |
| Not pending | 400 | Already processed/failed |
| No phone | 400 | Owner hasn't set phone |
| Moolre API failed | 502 | API error (revert to pending) |

---

## 🔐 Security

### 1. Authentication
- ✅ Edge functions validate Bearer token
- ✅ Frontend redirects to auth if token invalid
- ✅ Service role RPC execution (protected by SQL SECURITY DEFINER)

### 2. Authorization
- ✅ Only admins can approve payouts
- ✅ Only owners can request withdrawals
- ✅ Row-level security enforced on venue_payout_requests

### 3. Idempotency
- ✅ FOR UPDATE locking prevents race conditions
- ✅ Status checks prevent double-processing
- ✅ moolre_reference unique per request

### 4. Validation
- ✅ Amount ≥ ₵10
- ✅ Phone number required + E.164 format conversion
- ✅ Provider in [MTN, VODAFONE, AIRTELTIGO]
- ✅ Status transitions validated (pending → pending_moolre → in_transit → completed/failed)

### 5. Webhook Security (Phase 2B)
- ⚠️ NOT YET IMPLEMENTED: Moolre webhook signature verification
- 🔧 POST-LAUNCH: Add `verifyMoolreSignature()` using MOOLRE_ACCOUNT_SECRET
- 📝 See: [MOOLRE_SECURITY_AUDIT.md](./MOOLRE_SECURITY_AUDIT.md)

---

## 📊 Data Model

### venue_payout_requests Table

```
id                      UUID (PK)
owner_id                UUID (FK → profiles)
amount                  NUMERIC (GHS)
phone_number            TEXT
provider                TEXT (MTN | VODAFONE | AIRTELTIGO)
status                  TEXT (pending → pending_moolre → in_transit → completed/failed)
reference               TEXT
created_at              TIMESTAMPTZ
updated_at              TIMESTAMPTZ

-- Moolre Fields
moolre_reference        TEXT (unique reference from Moolre API)
moolre_transaction_id   TEXT (tracking ID from Moolre)
processing_started_at   TIMESTAMPTZ (when moolre-payout called)
completed_at            TIMESTAMPTZ (when webhook received)
error_reason            TEXT (if status=failed)

-- Audit Fields
approved_by             UUID (FK → profiles, which admin approved)
approved_at             TIMESTAMPTZ
admin_note              TEXT (optional reason for rejection)
resolved_at             TIMESTAMPTZ
```

### Status Lifecycle

```
pending
  ↓ (admin clicks approve)
pending_moolre
  ↓ (moolre-payout edge function calls API)
in_transit
  ├─ (webhook: txstatus=1)
  │  ↓
  │  completed ✅
  │
  └─ (webhook: txstatus=0)
     ↓
     failed ❌
```

---

## 🧪 Testing

### Manual Test Checklist (Week 2)

**Setup**:
- [ ] Deploy migrations (adds columns + indexes + RPC)
- [ ] Deploy edge functions (moolre-payout, moolre-payout-webhook, moolre-admin-payouts)
- [ ] Configure env vars: MOOLRE_PRIVATE_KEY, MOOLRE_VAS_KEY
- [ ] Use Moolre Sandbox for testing

**Test Cases**:

| Test | Steps | Expected | Status |
|------|-------|----------|--------|
| **Happy Path** | 1. Turf owner requests ₵50 withdrawal 2. Admin approves 3. Moolre sends webhook | Amount appears in owner's wallet | 🔵 Ready |
| **Already Completed** | 1. Webhook processed 2. Try to approve same request | Reject with "already_resolved" | 🔵 Ready |
| **Network Error** | 1. Admin approves 2. Moolre API fails | Status reverts to pending, error logged | 🔵 Ready |
| **Invalid Phone** | 1. Owner has no phone 2. Admin tries to approve | Error: "No phone number on file" | 🔵 Ready |
| **Wrong Provider** | 1. Request has invalid provider 2. Admin approves | Moolre rejects, status → failed | 🔵 Ready |
| **Insufficient Balance** | 1. Attempt ₵1000 with ₵100 balance | Rejected by wallet-withdraw RPC | 🔵 Ready |
| **Webhook Timeout** | 1. Admin approves 2. No webhook for 5 min | Status stays "in_transit", owner sees "Processing..." | 🔵 Ready |

**Sandbox Credentials**:
```
MOOLRE_ENV=sandbox
MOOLRE_BASE_URL=https://sandbox.moolre.com
MOOLRE_PRIVATE_KEY=<sandbox-private-key>
MOOLRE_VAS_KEY=<sandbox-vas-key>
```

---

## 🚀 Deployment Steps

### Week 2 (Phase 2 Launch)

**1. Database Migration** (5 min)
```bash
# Supabase: Run migration SQL
supabase migration deploy 20260617000001_moolre_payout_rpc
```

**2. Deploy Edge Functions** (10 min)
```bash
supabase functions deploy moolre-payout
supabase functions deploy moolre-payout-webhook
supabase functions deploy moolre-admin-payouts
```

**3. Environment Config** (5 min)
```bash
MOOLRE_PRIVATE_KEY=<prod-key>      # For disbursements
MOOLRE_VAS_KEY=<prod-vas-key>      # For webhooks (optional)
MOOLRE_ACCOUNT_SECRET=<secret>     # For webhook verification
```

**4. Admin Dashboard Integration** (TBD)
- Create admin panel to view pending payout requests
- Add "Approve" button → calls moolre-admin-payouts
- Show status in real-time (via Supabase subscription)

**5. Smoke Test** (10 min)
- [ ] Turf owner requests ₵50 (sandbox balance ≥ ₵50)
- [ ] Admin approves via dashboard
- [ ] Verify status → in_transit
- [ ] Wait for webhook or manual check on Moolre dashboard
- [ ] Verify status → completed

---

## 🔄 Next Steps (Post-Launch)

### Phase 2B: Security Hardening (Week 3)
- [ ] Implement Moolre webhook signature verification
- [ ] Add rate limiting for disbursement requests (e.g., max 5 per day per owner)
- [ ] Create audit log for all approvals + disbursements

### Phase 2C: Admin Automation (Week 4)
- [ ] Auto-approve payouts above threshold (e.g., ≥ ₵500)
- [ ] Bulk approval UI (approve multiple requests at once)
- [ ] Export payout history to CSV for accounting

### Phase 3: Advanced Features (Post-Competition)
- [ ] Recurring payouts (auto-settle weekly)
- [ ] Scheduled payouts (owner selects day/time)
- [ ] Multiple provider support (AirtelTigo, Vodafone)
- [ ] Payout history analytics for turf owners

---

## 📞 Support

**Troubleshooting**:
- Webhook not received? → Check Moolre dashboard for callback logs
- Phone number rejected? → Ensure E.164 format (+233XXX...)
- Permission denied? → Verify user role is admin/super_admin in profiles

**Documentation**:
- Top-up flow: [MOOLRE_SECURITY_AUDIT.md](./MOOLRE_SECURITY_AUDIT.md)
- Testing guide: [MOOLRE_TESTING_DEPLOYMENT.md](./MOOLRE_TESTING_DEPLOYMENT.md)
- Quick ref: [MOOLRE_QUICK_REFERENCE.md](./MOOLRE_QUICK_REFERENCE.md)

---

**Version**: 1.0 | **Last Updated**: Week 1 Launch | **Status**: Ready for Week 2 Deployment
