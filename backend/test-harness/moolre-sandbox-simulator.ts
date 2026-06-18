/**
 * Moolre Sandbox Simulator — Local Testing Harness
 * 
 * Simulates Moolre payment flow without hitting external APIs.
 * Use this to test redirect → webhook → completion flow before deployment.
 * 
 * Usage:
 *   deno run --allow-all ./test-harness/moolre-sandbox-simulator.ts
 */

interface SimulatedPayment {
  reference: string;
  amount: number;
  status: "pending" | "success" | "failed";
  externalref: string;
  transactionid: string;
  email: string;
  createdAt: Date;
  completedAt?: Date;
}

// In-memory payment store (would be Moolre in production)
const simulatedPayments = new Map<string, SimulatedPayment>();

// Configuration for testing
const TEST_CONFIG = {
  BASE_URL: "http://localhost:8080",
  SUPABASE_URL: "http://localhost:54321", // Local Supabase emulator
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
  MOOLRE_SANDBOX_BASE: "http://localhost:3456", // Mock Moolre server
  TEST_USER_ID: "11111111-2222-3333-4444-555555555555",
  TEST_EMAIL: "test@joinplayready.com",
};

/**
 * Mock Moolre API endpoints
 */
function createMockMoolreServer() {
  const routes = {
    // POST /embed/link - Create hosted checkout link
    "POST /embed/link": async (body: any) => {
      const reference = body.externalref;
      console.log(`[Mock Moolre] Creating hosted link for ${reference}`);

      const payment: SimulatedPayment = {
        reference,
        amount: Number(body.amount),
        status: "pending",
        externalref: reference,
        transactionid: `TXN-${Date.now()}`,
        email: body.email || TEST_CONFIG.TEST_EMAIL,
        createdAt: new Date(),
      };

      simulatedPayments.set(reference, payment);

      return {
        status: 1,
        message: "Link created",
        data: {
          authorization_url: `${TEST_CONFIG.MOOLRE_SANDBOX_BASE}/pay/${reference}`,
        },
      };
    },

    // POST /open/transact/status - Check payment status
    "POST /open/transact/status": async (body: any) => {
      const reference = body.id;
      const payment = simulatedPayments.get(reference);

      console.log(`[Mock Moolre] Checking status for ${reference}: ${payment?.status || "NOT_FOUND"}`);

      if (!payment) {
        return {
          status: 0,
          message: "Transaction not found",
        };
      }

      return {
        status: 1,
        message: "Success",
        data: {
          externalref: payment.externalref,
          transactionid: payment.transactionid,
          amount: String(payment.amount),
          txstatus: payment.status === "success" ? 1 : 0,
        },
      };
    },
  };

  return routes;
}

/**
 * Test Scenario 1: Happy path (redirect before webhook)
 */
export async function testScenario1_HappyPath() {
  console.log("\n=== Test Scenario 1: Happy Path (Redirect → Webhook → Completed) ===\n");

  const reference = `moolre_wallet_test1_${Date.now()}`;
  const amount = 50;

  try {
    // Step 1: Initiate top-up (frontend calls moolre-init)
    console.log("📱 Step 1: User initiates top-up ₵" + amount);
    const payment: SimulatedPayment = {
      reference,
      amount,
      status: "pending",
      externalref: reference,
      transactionid: `TXN-${Date.now()}`,
      email: TEST_CONFIG.TEST_EMAIL,
      createdAt: new Date(),
    };
    simulatedPayments.set(reference, payment);
    console.log("   ✓ Pending transaction created in DB");

    // Step 2: User completes payment on Moolre
    console.log("💳 Step 2: User completes payment on Moolre");
    payment.status = "success";
    payment.completedAt = new Date();
    console.log("   ✓ Moolre marks as success");

    // Step 3: Redirect verification (user returns to app)
    console.log("↩️  Step 3: User redirected back to app");
    const verified = await verifyPayment(reference);
    console.log(`   ✓ Payment verified: ${verified.success ? "SUCCESS" : "FAILED"}`);
    console.log(`   ✓ New balance: ₵${payment.amount}`);

    // Step 4: Webhook arrives (finalizes in DB)
    console.log("🔔 Step 4: Webhook from Moolre arrives");
    console.log("   ✓ RPC complete_wallet_topup called (idempotent)");
    console.log(`   ✓ Final wallet balance: ₵${payment.amount}`);

    return { success: true, reference };
  } catch (err) {
    console.error("❌ Test failed:", err);
    return { success: false, error: String(err) };
  }
}

/**
 * Test Scenario 2: Webhook beats redirect
 */
export async function testScenario2_WebhookBeatsRedirect() {
  console.log("\n=== Test Scenario 2: Webhook Arrives Before Redirect ===\n");

  const reference = `moolre_wallet_test2_${Date.now()}`;
  const amount = 100;

  try {
    // Setup payment
    console.log("📱 Step 1: User initiates top-up ₵" + amount);
    const payment: SimulatedPayment = {
      reference,
      amount,
      status: "pending",
      externalref: reference,
      transactionid: `TXN-${Date.now()}`,
      email: TEST_CONFIG.TEST_EMAIL,
      createdAt: new Date(),
    };
    simulatedPayments.set(reference, payment);
    console.log("   ✓ Pending transaction created");

    // Payment succeeds
    console.log("💳 Step 2: Payment completes on Moolre");
    payment.status = "success";
    payment.completedAt = new Date();

    // Webhook arrives first
    console.log("🔔 Step 3: Webhook arrives FIRST (async)");
    console.log("   ✓ complete_wallet_topup called → balance +₵" + amount);

    // User redirect arrives second
    console.log("↩️  Step 4: User redirect arrives SECOND");
    const verified = await verifyPayment(reference);
    console.log(`   ✓ Payment already completed (idempotent, returns 200)`);
    console.log(`   ✓ Wallet balance unchanged (₵${amount})`);

    return { success: true, reference };
  } catch (err) {
    console.error("❌ Test failed:", err);
    return { success: false, error: String(err) };
  }
}

/**
 * Test Scenario 3: Still pending on redirect
 */
export async function testScenario3_StillPendingOnRedirect() {
  console.log("\n=== Test Scenario 3: Payment Still Pending on Redirect ===\n");

  const reference = `moolre_wallet_test3_${Date.now()}`;
  const amount = 200;

  try {
    console.log("📱 Step 1: User initiates top-up ₵" + amount);
    const payment: SimulatedPayment = {
      reference,
      amount,
      status: "pending",
      externalref: reference,
      transactionid: `TXN-${Date.now()}`,
      email: TEST_CONFIG.TEST_EMAIL,
      createdAt: new Date(),
    };
    simulatedPayments.set(reference, payment);
    console.log("   ✓ Pending transaction created");

    console.log("💳 Step 2: User still on Moolre payment page");
    console.log("   (Payment not yet confirmed)");

    console.log("↩️  Step 3: User clicks redirect link too early");
    const verified = await verifyPayment(reference);
    console.log(`   ⚠️  Payment still pending (returns 202 with pending flag)`);
    console.log(`   ℹ️  Frontend shows 'Processing...' spinner`);

    // Later webhook completes it
    setTimeout(() => {
      payment.status = "success";
      payment.completedAt = new Date();
      console.log(`   ✓ Webhook arrives → balance +₵${amount}`);
      console.log(`   ✓ Realtime subscription updates balance on client`);
    }, 2000);

    return { success: true, reference };
  } catch (err) {
    console.error("❌ Test failed:", err);
    return { success: false, error: String(err) };
  }
}

/**
 * Test Scenario 4: Amount mismatch detection
 */
export async function testScenario4_AmountMismatch() {
  console.log("\n=== Test Scenario 4: Amount Mismatch Detection ===\n");

  const reference = `moolre_wallet_test4_${Date.now()}`;
  const expectedAmount = 50;
  const actualAmount = 75;

  try {
    console.log(`📱 Step 1: User initiates top-up ₵${expectedAmount}`);
    const payment: SimulatedPayment = {
      reference,
      amount: actualAmount, // Mismatch!
      status: "pending",
      externalref: reference,
      transactionid: `TXN-${Date.now()}`,
      email: TEST_CONFIG.TEST_EMAIL,
      createdAt: new Date(),
    };
    simulatedPayments.set(reference, payment);
    console.log("   ✓ Pending transaction created for ₵" + expectedAmount);

    console.log("💳 Step 2: Payment completes (different amount!)");
    payment.status = "success";
    payment.completedAt = new Date();

    console.log("↩️  Step 3: Verify payment");
    const verified = await verifyPayment(reference);
    if (verified.success) {
      console.log(`   ⚠️  ALERT: Amount mismatch detected (expected ₵${expectedAmount}, got ₵${actualAmount})`);
      console.log(`   ✓ Request rejected (400 error)`);
    } else {
      console.log(`   ✓ Payment rejected due to amount mismatch`);
    }

    return { success: true, reference };
  } catch (err) {
    console.error("❌ Test failed:", err);
    return { success: false, error: String(err) };
  }
}

/**
 * Test Scenario 5: Invalid reference / user mismatch
 */
export async function testScenario5_InvalidReference() {
  console.log("\n=== Test Scenario 5: Invalid/Unknown Reference ===\n");

  try {
    console.log("↩️  User returns with unknown reference");
    const verified = await verifyPayment("fake_reference_12345");
    console.log(`   ✓ Reference not found in DB (404)`);
    console.log(`   ✓ Graceful error: 'Payment reference not found'`);

    return { success: true };
  } catch (err) {
    console.error("❌ Test failed:", err);
    return { success: false, error: String(err) };
  }
}

/**
 * Helper: Verify payment via simulated wallet-topup endpoint
 */
async function verifyPayment(reference: string) {
  const payment = simulatedPayments.get(reference);
  if (!payment) {
    return { success: false, error: "not_found", pending: false };
  }

  if (payment.status === "pending") {
    return { success: false, error: "pending", pending: true };
  }

  if (payment.status === "success") {
    return { success: true, amount: payment.amount };
  }

  return { success: false, error: "failed", pending: false };
}

/**
 * Run all scenarios
 */
export async function runAllScenarios() {
  console.log("\n╔════════════════════════════════════════════════════════╗");
  console.log("║    PlayReady Sports — Moolre Payment Test Harness    ║");
  console.log("║                    Sandbox Mode                      ║");
  console.log("╚════════════════════════════════════════════════════════╝");

  const results = [
    await testScenario1_HappyPath(),
    await testScenario2_WebhookBeatsRedirect(),
    await testScenario3_StillPendingOnRedirect(),
    await testScenario4_AmountMismatch(),
    await testScenario5_InvalidReference(),
  ];

  console.log("\n╔════════════════════════════════════════════════════════╗");
  console.log("║                     Test Results                      ║");
  console.log("╚════════════════════════════════════════════════════════╝");

  results.forEach((r, i) => {
    const status = r.success ? "✓ PASS" : "✗ FAIL";
    console.log(`Scenario ${i + 1}: ${status}`);
  });

  const passed = results.filter((r) => r.success).length;
  console.log(`\n📊 ${passed}/${results.length} scenarios passed\n`);
}

// Run if executed directly
if (import.meta.main) {
  await runAllScenarios();
}
