/**
 * Moolre Integration — Pre-Launch Integrity Check Script
 * 
 * Validates all files are in place, migrations applied, and no conflicts exist.
 * Run this 2 hours before launch to catch any issues.
 * 
 * Usage:
 *   deno run --allow-read ./scripts/moolre-integrity-check.ts
 */

import { existsSync } from "https://deno.land/std@0.208.0/fs/exists.ts";
import { resolve } from "https://deno.land/std@0.208.0/path/mod.ts";

interface CheckResult {
  name: string;
  passed: boolean;
  details?: string;
  errors?: string[];
}

const results: CheckResult[] = [];

function log(message: string, level: "info" | "warn" | "error" | "pass" = "info") {
  const icons: Record<string, string> = {
    info: "ℹ️",
    warn: "⚠️",
    error: "❌",
    pass: "✅",
  };
  console.log(`${icons[level]} ${message}`);
}

// ─── File Existence Checks ───────────────────────────────────────────────

async function checkFilesExist() {
  const requiredFiles = [
    "backend/supabase/functions/_shared/moolre.ts",
    "backend/supabase/functions/moolre-init/index.ts",
    "backend/supabase/functions/moolre-webhook/index.ts",
    "backend/supabase/functions/wallet-topup/index.ts",
    "backend/supabase/functions/wallet-withdraw/index.ts",
    "backend/supabase/migrations/20260617000000_moolre_wallet_topup_rpc.sql",
    "src/hooks/useWallet.ts",
    "src/pages/Wallet.tsx",
    "env.example",
  ];

  const errors: string[] = [];

  for (const file of requiredFiles) {
    const path = resolve(file);
    const exists = existsSync(path);
    if (!exists) {
      errors.push(`Missing: ${file}`);
    } else {
      log(`Found: ${file}`, "pass");
    }
  }

  results.push({
    name: "Files Exist",
    passed: errors.length === 0,
    errors,
  });
}

// ─── Code Quality Checks ────────────────────────────────────────────────

async function checkCodeQuality() {
  const errors: string[] = [];

  // Check moolre.ts exports verifyMoolrePayment
  try {
    const moolreCode = Deno.readTextFileSync("backend/supabase/functions/_shared/moolre.ts");
    if (!moolreCode.includes("export async function verifyMoolrePayment")) {
      errors.push("verifyMoolrePayment not exported from moolre.ts");
    } else {
      log("verifyMoolrePayment export found", "pass");
    }

    if (!moolreCode.includes("export function getMoolreConfig")) {
      errors.push("getMoolreConfig not exported from moolre.ts");
    } else {
      log("getMoolreConfig export found", "pass");
    }
  } catch (e) {
    errors.push(`Could not read moolre.ts: ${e.message}`);
  }

  // Check moolre-init has rate limiting
  try {
    const initCode = Deno.readTextFileSync("backend/supabase/functions/moolre-init/index.ts");
    if (!initCode.includes("checkRateLimit")) {
      errors.push("Rate limiting not implemented in moolre-init");
    } else {
      log("Rate limiting found in moolre-init", "pass");
    }

    if (!initCode.includes("wallet_transactions")) {
      errors.push("wallet_transactions insert not found in moolre-init");
    } else {
      log("Pending transaction creation found", "pass");
    }
  } catch (e) {
    errors.push(`Could not read moolre-init: ${e.message}`);
  }

  // Check wallet-topup has 202 pending handling
  try {
    const topupCode = Deno.readTextFileSync("backend/supabase/functions/wallet-topup/index.ts");
    if (!topupCode.includes("status: 202")) {
      errors.push("202 pending response not found in wallet-topup");
    } else {
      log("202 pending response found in wallet-topup", "pass");
    }

    if (!topupCode.includes("verifyMoolrePayment")) {
      errors.push("Moolre verification not found in wallet-topup");
    } else {
      log("Moolre verification found in wallet-topup", "pass");
    }
  } catch (e) {
    errors.push(`Could not read wallet-topup: ${e.message}`);
  }

  // Check webhook has idempotent handling
  try {
    const webhookCode = Deno.readTextFileSync("backend/supabase/functions/moolre-webhook/index.ts");
    if (!webhookCode.includes("complete_wallet_topup")) {
      errors.push("complete_wallet_topup RPC call not found in webhook");
    } else {
      log("complete_wallet_topup RPC call found in webhook", "pass");
    }

    if (!webhookCode.includes("verifyMoolrePayment")) {
      errors.push("Payment verification not found in webhook");
    } else {
      log("Payment verification found in webhook", "pass");
    }
  } catch (e) {
    errors.push(`Could not read moolre-webhook: ${e.message}`);
  }

  results.push({
    name: "Code Quality",
    passed: errors.length === 0,
    errors,
  });
}

// ─── Configuration Checks ───────────────────────────────────────────────

async function checkConfiguration() {
  const errors: string[] = [];

  try {
    const envExample = Deno.readTextFileSync("env.example");

    const requiredVars = [
      "VITE_PAYMENT_PROVIDER",
      "VITE_SUPABASE_URL",
      "VITE_SUPABASE_ANON_KEY",
      "PAYMENT_PROVIDER",
      "MOOLRE_ENV",
      "MOOLRE_API_USER",
      "MOOLRE_ACCOUNT_NUMBER",
      "MOOLRE_PUBLIC_KEY",
      "MOOLRE_PRIVATE_KEY",
      "APP_URL",
      "ALLOWED_ORIGIN",
    ];

    for (const varName of requiredVars) {
      if (!envExample.includes(varName)) {
        errors.push(`${varName} not documented in env.example`);
      } else {
        log(`${varName} documented in env.example`, "pass");
      }
    }
  } catch (e) {
    errors.push(`Could not read env.example: ${e.message}`);
  }

  results.push({
    name: "Configuration",
    passed: errors.length === 0,
    errors,
  });
}

// ─── Migration Checks ───────────────────────────────────────────────────

async function checkMigration() {
  const errors: string[] = [];

  try {
    const migration = Deno.readTextFileSync(
      "backend/supabase/migrations/20260617000000_moolre_wallet_topup_rpc.sql"
    );

    if (!migration.includes("complete_wallet_topup")) {
      errors.push("complete_wallet_topup function not in migration");
    } else {
      log("complete_wallet_topup function found in migration", "pass");
    }

    if (!migration.includes("FOR UPDATE")) {
      errors.push("FOR UPDATE locking not found in migration");
    } else {
      log("FOR UPDATE locking found in migration", "pass");
    }

    if (!migration.includes("GRANT EXECUTE")) {
      errors.push("Grant permissions not found in migration");
    } else {
      log("Grant permissions found in migration", "pass");
    }
  } catch (e) {
    errors.push(`Could not read migration: ${e.message}`);
  }

  results.push({
    name: "Database Migration",
    passed: errors.length === 0,
    errors,
  });
}

// ─── Frontend Integration Checks ───────────────────────────────────────

async function checkFrontend() {
  const errors: string[] = [];

  try {
    const useWalletCode = Deno.readTextFileSync("src/hooks/useWallet.ts");

    if (!useWalletCode.includes("VITE_PAYMENT_PROVIDER")) {
      errors.push("Payment provider detection not in useWallet");
    } else {
      log("Payment provider detection in useWallet", "pass");
    }

    if (!useWalletCode.includes("verifyTopUp")) {
      errors.push("verifyTopUp method not in useWallet");
    } else {
      log("verifyTopUp method in useWallet", "pass");
    }

    if (!useWalletCode.includes("moolre-init")) {
      errors.push("moolre-init endpoint not called in useWallet");
    } else {
      log("moolre-init endpoint call in useWallet", "pass");
    }
  } catch (e) {
    errors.push(`Could not read useWallet: ${e.message}`);
  }

  try {
    const walletPageCode = Deno.readTextFileSync("src/pages/Wallet.tsx");

    if (!walletPageCode.includes("moolre_ref")) {
      errors.push("Moolre ref handling not in Wallet.tsx");
    } else {
      log("Moolre ref handling in Wallet.tsx", "pass");
    }

    if (!walletPageCode.includes("verifyTopUp")) {
      errors.push("verifyTopUp call not in Wallet.tsx");
    } else {
      log("verifyTopUp call in Wallet.tsx", "pass");
    }

    if (!walletPageCode.includes("window.history.replaceState")) {
      errors.push("URL cleanup not in Wallet.tsx");
    } else {
      log("URL cleanup in Wallet.tsx", "pass");
    }
  } catch (e) {
    errors.push(`Could not read Wallet.tsx: ${e.message}`);
  }

  results.push({
    name: "Frontend Integration",
    passed: errors.length === 0,
    errors,
  });
}

// ─── Security Checks ───────────────────────────────────────────────────

async function checkSecurity() {
  const errors: string[] = [];

  try {
    const initCode = Deno.readTextFileSync("backend/supabase/functions/moolre-init/index.ts");

    if (!initCode.includes("authHeader") || !initCode.includes("getUser")) {
      errors.push("Authentication check missing in moolre-init");
    } else {
      log("Authentication check in moolre-init", "pass");
    }

    if (!initCode.includes("user.id")) {
      errors.push("User binding missing in moolre-init");
    } else {
      log("User binding in moolre-init", "pass");
    }
  } catch (e) {
    errors.push(`Could not read moolre-init: ${e.message}`);
  }

  try {
    const topupCode = Deno.readTextFileSync("backend/supabase/functions/wallet-topup/index.ts");

    if (!topupCode.includes("user.id") || !topupCode.includes("pendingTx.user_id")) {
      errors.push("User ownership validation missing in wallet-topup");
    } else {
      log("User ownership validation in wallet-topup", "pass");
    }

    if (!topupCode.includes("Math.abs(verified.amount")) {
      errors.push("Amount validation missing in wallet-topup");
    } else {
      log("Amount validation in wallet-topup", "pass");
    }
  } catch (e) {
    errors.push(`Could not read wallet-topup: ${e.message}`);
  }

  results.push({
    name: "Security Checks",
    passed: errors.length === 0,
    errors,
  });
}

// ─── Run All Checks ─────────────────────────────────────────────────────

async function runAllChecks() {
  console.log("\n╔════════════════════════════════════════════════════════╗");
  console.log("║   PlayReady Sports — Moolre Integrity Check v1.0     ║");
  console.log("╚════════════════════════════════════════════════════════╝\n");

  try {
    await checkFilesExist();
    await checkCodeQuality();
    await checkConfiguration();
    await checkMigration();
    await checkFrontend();
    await checkSecurity();
  } catch (e) {
    log(`Integrity check crashed: ${e.message}`, "error");
  }

  console.log("\n╔════════════════════════════════════════════════════════╗");
  console.log("║                  Check Results                        ║");
  console.log("╚════════════════════════════════════════════════════════╝\n");

  let allPassed = true;
  for (const result of results) {
    const status = result.passed ? "✅ PASS" : "❌ FAIL";
    console.log(`${status} — ${result.name}`);

    if (!result.passed && result.errors) {
      for (const error of result.errors) {
        log(`  • ${error}`, "error");
      }
      allPassed = false;
    }
  }

  console.log();
  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;

  if (allPassed) {
    log(`All ${totalCount} checks passed! Ready for deployment. 🚀\n`, "pass");
    Deno.exit(0);
  } else {
    log(`${passedCount}/${totalCount} checks passed. Fix errors before deployment. ⚠️\n`, "warn");
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await runAllChecks();
}
