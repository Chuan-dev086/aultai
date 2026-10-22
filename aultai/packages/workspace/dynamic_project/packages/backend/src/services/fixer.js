import { promises as fs } from "node:fs";
import { safePath, readFile, writeFile } from "./sandbox.js";
import { isMockMode } from "./llm.js";

/**
 * @typedef {import("../models.js").FixProposal} FixProposal
 */

const MOCK_FIXES = {
  "issue-bug1-checkout-no-floor": {
    id: "fix-bug1-checkout-no-floor",
    issueId: "issue-bug1-checkout-no-floor",
    file: "shop-api/src/checkout.js",
    originalCode:
      "const total = discountableSubtotal + taxAmount + shippingAmount - voucher.value;",
    proposedCode:
      "const discount = Math.min(voucher.value, discountableSubtotal);\n  const total = Math.max(0, discountableSubtotal + taxAmount + shippingAmount - discount);",
    unifiedDiff:
      "--- a/shop-api/src/checkout.js\n+++ b/shop-api/src/checkout.js\n@@ -40,1 +40,2 @@\n-  const total = discountableSubtotal + taxAmount + shippingAmount - voucher.value;\n+  const discount = Math.min(voucher.value, discountableSubtotal);\n+  const total = Math.max(0, discountableSubtotal + taxAmount + shippingAmount - discount);",
    explanation:
      "The fixed-amount voucher is now capped at the subtotal, and the final total is floored at zero. This prevents negative order totals.",
    rationaleSteps: [
      "Cap the discount at the discountable subtotal",
      "Floor the total at 0 to prevent negative orders",
    ],
    impactedNodes: ["checkout.calculateCheckoutTotal"],
    risk: "low",
  },
  "issue-bug2-voucher-expiry-inverted": {
    id: "fix-bug2-voucher-expiry-inverted",
    issueId: "issue-bug2-voucher-expiry-inverted",
    file: "shop-api/src/vouchers.js",
    originalCode: "if (voucher.expiresAt !== null && voucher.expiresAt > now) {",
    proposedCode: "if (voucher.expiresAt !== null && voucher.expiresAt <= now) {",
    unifiedDiff:
      "--- a/shop-api/src/vouchers.js\n+++ b/shop-api/src/vouchers.js\n@@ -9,1 +9,1 @@\n-  if (voucher.expiresAt !== null && voucher.expiresAt > now) {\n+  if (voucher.expiresAt !== null && voucher.expiresAt <= now) {",
    explanation:
      "The comparison is inverted. By changing it to <=, expired vouchers are correctly rejected and valid ones are accepted.",
    rationaleSteps: ["Invert the comparison operator from > to <="],
    risk: "low",
    impactedNodes: ["vouchers.validateVoucher"],
  },
};

/**
 * Generate a fix proposal for a known issue. The curated proposals are used in
 * both mock and live mode (live AI fix generation is out of scope).
 * @param {string} issueId Issue id (e.g. "issue-bug1-checkout-no-floor").
 * @returns {Promise<FixProposal>} The fix proposal.
 * @throws {Error} When no proposal exists for the issue id.
 */
export async function generateFix(issueId) {
  const fix = MOCK_FIXES[issueId];
  if (fix === undefined) {
    const detail = isMockMode() ? "" : " (automatic fixes are only available for the two demo bugs)";
    const err = new Error(`No fix proposal available for issue: ${issueId}${detail}`);
    err.code = "UNKNOWN_ISSUE";
    throw err;
  }
  return { ...fix, rationaleSteps: [...fix.rationaleSteps], impactedNodes: [...fix.impactedNodes] };
}

/**
 * Apply a fix: verify originalCode is present, back up to file + ".bak",
 * replace it with proposedCode, and write back via sandbox.js.
 * @param {string} issueId Issue id.
 * @returns {Promise<{ applied: true, backupPath: string }>} Apply result.
 * @throws {Error} With code "PATCH_CONFLICT" when originalCode is absent.
 */
export async function applyFix(issueId) {
  const fix = await generateFix(issueId);
  const current = await readFile(fix.file);
  if (!current.includes(fix.originalCode)) {
    const err = new Error(`originalCode not found in ${fix.file}; the file may have changed`);
    err.code = "PATCH_CONFLICT";
    throw err;
  }
  await writeFile(`${fix.file}.bak`, current);
  await writeFile(fix.file, current.replace(fix.originalCode, fix.proposedCode));
  return { applied: true, backupPath: `${fix.file}.bak` };
}

/**
 * Revert a fix: copy file + ".bak" back over the file, then delete the .bak.
 * @param {string} issueId Issue id.
 * @returns {Promise<{ reverted: true }>} Revert result.
 * @throws {Error} With code "NO_BACKUP" when no .bak exists.
 */
export async function revertFix(issueId) {
  const fix = await generateFix(issueId);
  const bakAbs = await safePath(`${fix.file}.bak`);
  let backup = null;
  try {
    backup = await fs.readFile(bakAbs, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      const notFound = new Error(`No backup found for ${fix.file}; nothing to revert`);
      notFound.code = "NO_BACKUP";
      throw notFound;
    }
    throw err;
  }
  await writeFile(fix.file, backup);
  await fs.unlink(bakAbs);
  return { reverted: true };
}

