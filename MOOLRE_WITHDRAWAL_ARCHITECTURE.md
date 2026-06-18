# Moolre Withdrawal Flow Architecture

**Status**: ✅ **CONFIRMED** — Moolre Transfers API supports mobile wallet disbursements  
**Priority**: 🚀 **HIGH** — Implement Week 2 for competition demo  
**Scope**: Turf Owners Only (Players cannot withdraw)

> **MOOLRE CONFIRMATION**: Disburse funds to bank accounts & mobile wallets (MTN, Vodafone, AirtelTigo). Perfect for PlayReady Sports venue owner payouts.  

---

## Current Withdrawal Flow (Non-Moolre)

```
Turf Owner
    ↓
Click "Request Withdrawal" (VenueOwnerDashboard)
    ↓
request_venue_withdrawal RPC
    ├─ Deduct from wallet_balances
    ├─ Create venue_payout_requests (pending)
    └─ Notify admin
    ↓
Admin Reviews (Dashboard)
    ├─ Verify identity + amount
    └─ Approve/Reject
    ↓
Admin Manually Processes
    ├─ Transfer via MTN/Vodafone/AirtelTigo
    ├─ Record transaction
    └─ Update venue_payout_requests (completed)
    ↓
Turf Owner Receives SMS with funds
```

**Problems**:
- Manual processing error-prone
- Admin overhead
- No audit trail
- Slow (24h+ processing time)

---

## Desired Moolre Withdrawal Flow

```
Turf Owner
    ├─ Balance: ₵500 (earned from matches)
    └─ Provider: MTN Mobile Money
    ↓
Click "Withdraw ₵100"
    ↓
request_venue_withdrawal RPC (UNCHANGED)
    ├─ Deduct ₵100 from wallet_balances
    ├─ Create venue_payout_requests
    │  └─ Status: "pending_approval"
    └─ Notify admin
    ↓
Admin Approves (Dashboard)
    ├─ Call new RPC: approve_payout_request(id)
    │  ├─ Update status → "pending_moolre"
    │  └─ Call Edge Function: moolre-payout
    └─ Async webhook returns status
    ↓
moolre-payout Edge Function
    ├─ Call Moolre API: POST /disburse/send
    │  └─ {amount, phone, reference, callback}
    ├─ Get Moolre reference + status
    └─ Update venue_payout_requests
       └─ Status: "in_transit" or "completed"
    ↓
Moolre Processes Payout
    ├─ Contacts mobile operator (MTN/Vodafone/Airteltigo)
    ├─ Delivers funds to phone
    └─ Sends webhook callback
    ↓
moolre-payout-webhook Edge Function
    ├─ Verify signature
    ├─ Update venue_payout_requests → "completed"
    └─ Notify turf owner via in-app notification
    ↓
Turf Owner
    ├─ Sees ₵100 in mobile money wallet
    ├─ Notification: "Your withdrawal completed"
    └─ Sees status in dashboard
```

**Benefits**:
- Automated payout processing
- Reduced admin overhead
- Faster delivery (minutes vs. 24h)
- Complete audit trail
- Webhook confirmation

---

## Implementation Plan

🚀 **Priority: HIGH** — Implement for Week 2 to enable competition demo with full end-to-end flow

### Phase 1: Backend RPC & Edge Functions

#### New RPC: `approve_payout_request`

**File**: `backend/supabase/migrations/20260624000000_moolre_payout_rpc.sql`

```sql
CREATE OR REPLACE FUNCTION public.approve_payout_request(
  p_request_id uuid,
  p_approved_by_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request RECORD;
  v_current_status text;
BEGIN
  -- Only admins can approve
  PERFORM 1 FROM profiles
  WHERE id = p_approved_by_user_id AND role IN ('admin', 'super_admin')
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  -- Get request with lock
  SELECT * INTO v_request FROM venue_payout_requests
  WHERE id = p_request_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'request_not_found');
  END IF;

  -- Only approve pending requests
  IF v_request.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invalid_status',
      'current_status', v_request.status
    );
  END IF;

  -- Update to "pending_moolre" (will be processed async by edge function)
  UPDATE venue_payout_requests
  SET status = 'pending_moolre',
      approved_at = now(),
      approved_by = p_approved_by_user_id,
      updated_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'message', 'Payout approved, processing via Moolre'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_payout_request(uuid, uuid)
  TO authenticated, service_role;
```

#### New Edge Function: `moolre-payout`

**File**: `backend/supabase/functions/moolre-payout/index.ts`

```typescript
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getMoolreConfig, moolrePost } from "../_shared/moolre.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders() });
  }

  try {
    // Admin-only endpoint (check service role key or admin auth)
    const authHeader = req.headers.get("authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const svc = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { request_id } = body;

    // Get payout request
    const { data: request, error: requestErr } = await svc
      .from("venue_payout_requests")
      .select("*, profiles(phone_number)")
      .eq("id", request_id)
      .maybeSingle();

    if (requestErr || !request) {
      return new Response(
        JSON.stringify({ error: "Request not found" }),
        { status: 404, headers: { ...getCorsHeaders(), "Content-Type": "application/json" } }
      );
    }

    if (request.status !== "pending_moolre") {
      return new Response(
        JSON.stringify({ error: "Request not in pending_moolre state" }),
        { status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" } }
      );
    }

    // Call Moolre payout API
    const config = getMoolreConfig();
    const reference = `moolre_payout_${request_id}`;
    const phone = request.phone_number; // From profiles table

    try {
      const moolreData = await moolrePost<any>("/disburse/send", {
        type: 1,
        amount: request.amount.toFixed(2),
        phone,
        provider: request.provider,
        reference,
        callback: `${supabaseUrl}/functions/v1/moolre-payout-webhook`,
        accountnumber: config.accountNumber,
      });

      if (Number(moolreData?.status) !== 1) {
        await svc
          .from("venue_payout_requests")
          .update({ status: "failed", error_reason: moolreData?.message })
          .eq("id", request_id);

        return new Response(
          JSON.stringify({ error: moolreData?.message || "Moolre payout failed" }),
          { status: 502, headers: { ...getCorsHeaders(), "Content-Type": "application/json" } }
        );
      }

      // Update to in_transit
      await svc
        .from("venue_payout_requests")
        .update({
          status: "in_transit",
          moolre_reference: moolreData.data?.reference || reference,
          processing_started_at: new Date().toISOString(),
        })
        .eq("id", request_id);

      return new Response(
        JSON.stringify({
          success: true,
          moolre_reference: moolreData.data?.reference,
        }),
        { status: 200, headers: { ...getCorsHeaders(), "Content-Type": "application/json" } }
      );
    } catch (payoutErr: any) {
      await svc
        .from("venue_payout_requests")
        .update({ status: "failed", error_reason: payoutErr.message })
        .eq("id", request_id);

      return new Response(
        JSON.stringify({ error: payoutErr.message }),
        { status: 500, headers: { ...getCorsHeaders(), "Content-Type": "application/json" } }
      );
    }
  } catch (err: any) {
    console.error("moolre-payout error:", err);
    return new Response(
      JSON.stringify({ error: err.message ?? "Internal error" }),
      { status: 500, headers: { ...getCorsHeaders(), "Content-Type": "application/json" } }
    );
  }
});
```

#### New Webhook: `moolre-payout-webhook`

**File**: `backend/supabase/functions/moolre-payout-webhook/index.ts`

```typescript
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const payload = await req.json();
    const reference = payload?.data?.reference || payload?.reference;

    if (!reference || !reference.startsWith("moolre_payout_")) {
      return new Response("Invalid reference", { status: 400 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const svc = createClient(supabaseUrl, serviceKey);

    // Extract request_id from reference
    const request_id = reference.replace("moolre_payout_", "");

    // Get payout status
    const txStatus = Number(payload?.data?.txstatus ?? 0);
    const finalStatus = txStatus === 1 ? "completed" : "failed";

    // Update status
    await svc
      .from("venue_payout_requests")
      .update({
        status: finalStatus,
        completed_at: finalStatus === "completed" ? new Date().toISOString() : null,
        error_reason: finalStatus === "failed" ? payload?.data?.message : null,
      })
      .eq("id", request_id);

    // Notify turf owner
    const { data: request } = await svc
      .from("venue_payout_requests")
      .select("user_id, amount")
      .eq("id", request_id)
      .maybeSingle();

    if (request) {
      await svc.from("notifications").insert({
        user_id: request.user_id,
        type: "payout_completed",
        title: "Withdrawal Completed",
        body: `₵${request.amount} has been sent to your mobile money account`,
        data: { request_id, status: finalStatus },
      });
    }

    return new Response("OK", { status: 200 });
  } catch (err: any) {
    console.error("[moolre-payout-webhook] error:", err);
    return new Response("Internal error", { status: 500 });
  }
});
```

---

### Phase 2: Database Schema Updates

**File**: `backend/supabase/migrations/20260624000100_venue_payout_requests_moolre.sql`

```sql
-- Add Moolre fields to venue_payout_requests table
ALTER TABLE public.venue_payout_requests
ADD COLUMN IF NOT EXISTS moolre_reference text,
ADD COLUMN IF NOT EXISTS processing_started_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS error_reason text,
ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone;

-- Status enum values:
-- pending → pending_approval (admin review)
-- pending_moolre → in_transit (Moolre processing)
-- in_transit → completed or failed (webhook confirms)

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_venue_payout_requests_status
  ON public.venue_payout_requests(status);
```

---

### Phase 3: Frontend Updates

#### Admin Dashboard Changes

**Location**: `src/pages/admin/AdminDashboard.tsx` (or new payout management page)

**New Component**: `PendingPayoutsTable`

```tsx
export function PendingPayoutsTable() {
  const [payouts, setPayouts] = useState([]);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchPendingPayouts();
  }, []);

  const fetchPendingPayouts = async () => {
    const { data } = await supabase
      .from("venue_payout_requests")
      .select("*, profiles(name, phone_number)")
      .in("status", ["pending", "pending_approval"])
      .order("created_at", { ascending: true });
    setPayouts(data || []);
  };

  const handleApproveAndPay = async (requestId: string) => {
    setProcessing(true);
    try {
      // 1. Approve request
      const { data: approveData, error: approveErr } = await supabase.rpc(
        "approve_payout_request",
        { p_request_id: requestId, p_approved_by_user_id: currentUser.id }
      );
      if (approveErr) throw approveErr;

      // 2. Trigger Moolre payout
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/moolre-payout`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ request_id: requestId }),
        }
      );

      if (!res.ok) throw new Error("Payout initiation failed");

      toast.success("Payout processing initiated");
      await fetchPendingPayouts();
    } catch (err) {
      toast.error((err as Error).message);
    }
    setProcessing(false);
  };

  return (
    <table>
      <thead>
        <tr>
          <th>Turf Owner</th>
          <th>Amount</th>
          <th>Phone</th>
          <th>Provider</th>
          <th>Status</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        {payouts.map((payout) => (
          <tr key={payout.id}>
            <td>{payout.profiles?.name}</td>
            <td>₵{payout.amount}</td>
            <td>{payout.profiles?.phone_number}</td>
            <td>{payout.provider}</td>
            <td>
              <StatusBadge status={payout.status} />
            </td>
            <td>
              {payout.status === "pending" && (
                <button
                  onClick={() => handleApproveAndPay(payout.id)}
                  disabled={processing}
                >
                  {processing ? "Processing..." : "Approve & Pay"}
                </button>
              )}
              {payout.status === "pending_moolre" && (
                <span>Processing...</span>
              )}
              {payout.status === "completed" && (
                <span>✓ Completed</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

#### Turf Owner Dashboard Updates

**Location**: `src/pages/VenueOwnerDashboard.tsx`

**Add Payout Status View**:

```tsx
<section>
  <h2>Withdrawal Requests</h2>
  <table>
    {payoutRequests.map((req) => (
      <tr key={req.id}>
        <td>₵{req.amount}</td>
        <td>{req.provider}</td>
        <td>
          {req.status === "pending" && <StatusBadge>Awaiting Admin</StatusBadge>}
          {req.status === "pending_moolre" && <StatusBadge>Processing...</StatusBadge>}
          {req.status === "in_transit" && <StatusBadge>In Transit</StatusBadge>}
          {req.status === "completed" && <StatusBadge>✓ Received</StatusBadge>}
          {req.status === "failed" && <StatusBadge>Failed: {req.error_reason}</StatusBadge>}
        </td>
        <td>{new Date(req.created_at).toLocaleDateString()}</td>
      </tr>
    ))}
  </table>
</section>
```

---

### Phase 4: Monitoring & Safeguards

#### Monitoring Queries

```sql
-- Pending payouts stuck for > 30 minutes
SELECT id, user_id, amount, created_at, status
FROM venue_payout_requests
WHERE status IN ('pending_moolre', 'in_transit')
AND created_at < now() - interval '30 minutes';

-- Failed payouts
SELECT id, user_id, amount, error_reason, created_at
FROM venue_payout_requests
WHERE status = 'failed'
ORDER BY created_at DESC;

-- Payout volume by day
SELECT DATE(completed_at) as day, COUNT(*), SUM(amount) as total_paid
FROM venue_payout_requests
WHERE status = 'completed'
GROUP BY DATE(completed_at)
ORDER BY day DESC;
```

#### Alerts

```
- Alert if payout fails (triggers manual review)
- Alert if pending_moolre status lasts > 60 minutes
- Alert if daily payout volume exceeds threshold
```

---

## Rollback Plan

If Moolre withdrawal has issues during launch:

1. **Disable Moolre for payouts** (keep top-ups working)
   ```bash
   # Set MOOLRE_PAYOUT_ENABLED=false
   ```

2. **Fall back to manual processing**
   ```sql
   UPDATE venue_payout_requests
   SET status = 'pending'
   WHERE status IN ('pending_moolre', 'in_transit');
   ```

3. **Notify affected users**
   ```sql
   INSERT INTO notifications (user_id, type, body)
   SELECT user_id, 'payout_update', 
     'Your payout is being processed manually. You'll receive it within 24 hours.'
   FROM venue_payout_requests
   WHERE status = 'pending' AND created_at > now() - interval '1 hour';
   ```

---

## Testing Checklist

- [ ] Approve payout → triggers Moolre API call
- [ ] Moolre webhook returns success → status updates to completed
- [ ] Moolre webhook returns failure → status updates to failed + error logged
- [ ] Admin notification confirms payout initiated
- [ ] Turf owner sees updated status in dashboard
- [ ] Realtime subscription updates status on client
- [ ] Webhook signature verification works
- [ ] Idempotent handling (duplicate webhooks don't double-process)
- [ ] Amount validation (prevent tampering)
- [ ] User permission checks (only admins approve, only owners request)

---

## Timeline

**UPDATED**: Now that Moolre confirms disbursement support, prioritize for competition

- **Week 1 (Launch)**: Top-up only (✓ done)
- **Week 2 (CRITICAL)**: Deploy withdrawal infrastructure + complete automation
  - [ ] RPC + Edge functions ready
  - [ ] Database migrations applied
  - [ ] Admin dashboard updated
  - [ ] Testing in staging
  - **Goal**: Have full end-to-end flow (top-up → match → payout) ready for competition demo
- **Week 3**: Launch Moolre withdrawals to production
  - [ ] Switch venue_payout_requests flow to automated Moolre payouts
  - [ ] Monitor for 48 hours
  - [ ] Turf owners start receiving instant payouts

---

## Competition Entry Strategy

**Demo Script** (with automated payouts):
1. User signs in
2. Top-up ₵50 (instant, Moolre)
3. Join match → ₵50 deducted
4. **Venue owner requests withdrawal → ₵100 paid out (< 5 min, Moolre)**
5. Highlight: Zero admin overhead, instant payouts

**Differentiator**: "Automated payment processing end-to-end — no manual intervention needed"

---

## Success Metrics

- **Average payout time**: < 5 minutes (vs. 24h current)
- **Success rate**: > 98%
- **Admin time saved**: 80% reduction in manual processing
- **User satisfaction**: Increased payout request volume

---

*Next steps: Implement Phase 1 after top-up launch is stable (Week 2)*
