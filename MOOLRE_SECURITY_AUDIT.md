# Moolre Integration — Security Audit & Hardening Guide

**Date**: 2026-06-17  
**Status**: Pre-Launch Review  
**Competition**: Startup Funding (Week 1 Launch)  

---

## Executive Summary

The Moolre wallet integration has **solid fundamentals** but has **one unimplemented critical control**: webhook signature verification. This is acceptable for **sandbox launch** but **must be prioritized for production**.

**Risk Level**: 🟡 **MEDIUM** (Sandbox) → 🔴 **HIGH** (Production without webhook verification)

---

## Implemented Security Controls

### ✅ 1. Idempotent Payment Processing

**Control**: `complete_wallet_topup` RPC uses `FOR UPDATE` locking

```sql
SELECT * FROM wallet_transactions WHERE reference = p_reference FOR UPDATE;
IF v_tx.status = 'completed' THEN RETURN already_processed;
```

**Prevents**: 
- Double-crediting if webhook + redirect race
- Duplicate transactions from concurrent calls
- Amount tampering

**Test**: Try calling the same reference twice; second returns `already_processed: true`

---

### ✅ 2. User-to-Payment Binding

**Control**: References created and verified per signed-in user

```typescript
// moolre-init: User ID embedded in reference
const reference = `moolre_wallet_${user.id}_...`;

// wallet-topup: User ownership verified
if (pendingTx.user_id !== user.id) {
  return 403 Unauthorized;
}
```

**Prevents**:
- User A stealing User B's payment link
- Cross-user wallet injection

**Test**: Try verifying a reference with different auth token; returns 403

---

### ✅ 3. Amount Validation

**Control**: Moolre amount compared against expected DB amount

```typescript
const expectedAmount = Number(pendingTx.amount);
if (Math.abs(verified.amount - expectedAmount) > 0.01) {
  return 400 "Amount mismatch";
}
```

**Prevents**:
- Man-in-the-middle amount modification
- Incorrect payment processing

**Test**: Modify Moolre response amount; `wallet-topup` rejects with 400

---

### ✅ 4. Rate Limiting

**Control**: `checkRateLimit("moolre_init", 10, 10)` per user per 10 minutes

```typescript
// Redis-backed, prevents brute force
const allowed = await checkRateLimit(supabase, user.id, "moolre_init", 10, 10);
if (!allowed) return 429 "Rate limit exceeded";
```

**Prevents**:
- Payment link generation spam
- DOS attacks on edge functions

**Test**: Call `moolre-init` 11 times rapidly; 11th fails with 429

---

### ✅ 5. CORS & Origin Validation

**Control**: `getCorsHeaders(requestOrigin)` validates allowed origins

```typescript
const corsHeaders = getCorsHeaders(requestOrigin);
// Checks against ALLOWED_ORIGIN env var
```

**Prevents**:
- Cross-origin payment hijacking
- Webhook spoofing from unauthorized domains

**Test**: Call from different origin; includes CORS headers properly

---

### ✅ 6. Pending Payment Fast Path

**Control**: Already-completed payments skip redundant Moolre API calls

```typescript
if (pendingTx.status === "completed") {
  return 200 { success: true, alreadyProcessed: true };
}
```

**Prevents**:
- Unnecessary Moolre API calls
- Rate limiting on Moolre side

**Test**: Verify same reference twice; second request returns 200 faster

---

### ✅ 7. Secure RPC with Definer

**Control**: `SECURITY DEFINER SET search_path = public`

```sql
CREATE OR REPLACE FUNCTION complete_wallet_topup(...)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
AS $$
...
GRANT EXECUTE TO authenticated, service_role;
```

**Prevents**:
- SQL injection via search_path
- Privilege escalation

**Test**: Called only from edge functions with proper auth

---

## ⚠️ NOT Implemented (Sandbox OK, Production Critical)

### 🔴 1. Webhook Signature Verification

**Missing Control**: HMAC signature validation on webhook payload

**Current State**:
```typescript
// moolre-webhook/index.ts — accepts all webhooks
const payload = await req.json();
const reference = extractReference(payload);
// NO SIGNATURE CHECK ❌
```

**Risk**: 
- **Sandbox**: LOW (only test environment, IPs whitelisted)
- **Production**: CRITICAL (anyone can POST to webhook URL)

**Attack Vector**:
```bash
# Attacker spoof webhook
curl -X POST https://your-api.supabase.co/functions/v1/moolre-webhook \
  -d '{"externalref":"user-xyz-ref","txstatus":1}'
# Wallet credited without payment! 💥
```

**Remediation (Before Production Launch)**:

1. **Get Moolre HMAC Secret**: From Moolre dashboard
   ```bash
   MOOLRE_ACCOUNT_SECRET=your_secret_from_moolre
   ```

2. **Implement HMAC Verification**:
   ```typescript
   // backend/supabase/functions/_shared/moolre.ts
   export function verifyMoolreSignature(payload: string, signature: string): boolean {
     const secret = Deno.env.get("MOOLRE_ACCOUNT_SECRET")!;
     const hmac = await crypto.subtle.sign(
       "HMAC",
       await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA256" }, false, ["sign"]),
       new TextEncoder().encode(payload)
     );
     const computed = new TextEncoder().decode(new Uint8Array(hmac)).toString('hex');
     return computed === signature;
   }
   ```

3. **Update webhook handler**:
   ```typescript
   // moolre-webhook/index.ts
   const signature = req.headers.get("X-Moolre-Signature");
   if (!signature || !verifyMoolreSignature(rawBody, signature)) {
     return new Response("Unauthorized", { status: 401 });
   }
   ```

4. **Add to deployment checklist** (before live):
   - [ ] Deploy updated `moolre.ts` with signature verification
   - [ ] Deploy updated `moolre-webhook/index.ts` with checks
   - [ ] Set `MOOLRE_ACCOUNT_SECRET` in Supabase secrets
   - [ ] Test webhook with valid signature only

**Timeline**: Implement before **production launch**

---

### 🟡 2. Request Signing (Moolre → Us)

**Missing Control**: Signing outbound requests to Moolre API

**Current State**:
```typescript
// moolre.ts — uses API keys but no request signing
headers: {
  "X-API-USER": config.apiUser,
  "X-API-PUBKEY": config.publicKey,  // Public key, not a signature
  "X-API-KEY": config.privateKey,     // Private key, not a signature
}
```

**Risk**: LOW (Moolre validates via API keys; standard practice)

**Status**: OK for now; implement if Moolre requires later

---

### 🟡 3. Timeout Protection

**Missing Control**: Explicit timeout on Moolre API calls

**Current State**:
```typescript
// Uses Deno default fetch timeout (~30s)
const res = await fetch(`${config.baseUrl}${path}`, { ... });
```

**Risk**: LOW (Deno default reasonable, but no circuit breaker)

**Optional Enhancement** (Post-Launch):
```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 10_000); // 10s
const res = await fetch(url, { signal: controller.signal });
```

---

### 🟡 4. Webhook Delivery Guarantees

**Missing Control**: Retry logic if webhook fails

**Current State**: Moolre retries; we accept async (eventually consistent)

**Risk**: LOW (OK for wallet top-ups; players can verify manually)

**Status**: Acceptable; monitor webhook failures

---

## Deployment Gating Criteria

### ✅ Required for Sandbox Launch (Next Week)

- [x] Idempotent payment processing (FOR UPDATE)
- [x] User-to-payment binding
- [x] Amount validation
- [x] Rate limiting
- [x] CORS headers
- [x] Pending payment fast path
- [x] Database migration tested
- [x] Edge functions deployed
- [x] Wallet UI integration
- [ ] **Webhook signature verification** ⚠️ (For sandbox OK, but implement ASAP)

### 🔴 Required Before Production (After Competition)

- [ ] Webhook signature verification (HMAC)
- [ ] Supabase IP whitelist for webhook
- [ ] Production Moolre secrets configured
- [ ] Load testing (1000+ concurrent top-ups)
- [ ] Incident runbook prepared
- [ ] Monitoring + alerting configured

---

## Testing Signature Verification (Before Production)

```bash
# 1. Generate test signature
deno run --allow-all scripts/generate-moolre-signature.ts > test_signature.txt

# 2. Test webhook with valid signature
curl -X POST http://localhost:54321/functions/v1/moolre-webhook \
  -H "X-Moolre-Signature: $(cat test_signature.txt)" \
  -d '{"data":{"externalref":"test_ref",...}}'
# Should return 200

# 3. Test with invalid signature
curl -X POST http://localhost:54321/functions/v1/moolre-webhook \
  -H "X-Moolre-Signature: invalid_signature" \
  -d '{"data":{"externalref":"test_ref",...}}'
# Should return 401
```

---

## Monitoring & Alerting

### Key Alerts (Set Before Launch)

```bash
# Alert if webhook signature failures spike
# (indicates attack attempt or Moolre API misconfiguration)

# Alert if orphaned pending transactions
# (indicates webhook delivery failures)

# Alert if rate limit exhaustion
# (indicates malicious activity or legitimate user surge)
```

---

## Summary: Ready? ✅ or ⏸️?

### Sandbox Launch (Next Week): ✅ GO

**All core security controls implemented**. Webhook verification not yet in place, but acceptable for sandbox with monitoring.

**Launch Approval**: Yes, proceed with:
- [ ] Close this audit review
- [ ] Confirm team trained on deployment steps
- [ ] Have on-call team ready for 48 hours post-launch

### Production Launch (Post-Competition): ⏸️ HOLD

**Until**:
- [ ] Webhook signature verification implemented & tested
- [ ] Supabase IP whitelist configured
- [ ] Production secrets secured
- [ ] Load test completed

---

## Appendix: Future Enhancements

1. **Withdrawal Support**: Wire up Moolre payout API
2. **Dispute Handling**: Refund flow for failed payments
3. **Ledger Reconciliation**: Batch validation of Moolre vs. DB
4. **PCI Compliance**: If handling sensitive payment data later
5. **Fraud Detection**: Machine learning on top-up patterns

---

**Questions? Contact**: [DevOps Lead]  
**Last Review**: 2026-06-17  
**Next Review**: 2026-06-24 (Post-Launch)
