import { promises as fs } from "node:fs";
import { getActiveSubdir, safePath, readFile, writeFile } from "./sandbox.js";
import { isMockMode } from "./llm.js";
import { analyzeProject } from "./analyzer.js";
import { requestAI } from "./aiService.js";

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
const generatedFixes = new Map();
const pendingFixes = new Map();
const FIX_RESPONSE_ATTEMPTS = 2;

/**
 * Generate a fix proposal without modifying project code.
 * @param {string} issueId Issue id (e.g. "issue-bug1-checkout-no-floor").
 * @returns {Promise<FixProposal>} The fix proposal.
 * @throws {Error} When the issue is unknown, the provider fails, or the patch is invalid.
 */
export async function generateFix(issueId, suppliedIssue = null, retry = false) {
  if (isMockMode()) {
    if (getActiveSubdir() !== "shop-api") {
      const err = new Error("Configure an AI provider and API key to generate fixes for uploaded projects.");
      err.code = "AI_PROVIDER_NOT_CONFIGURED";
      throw err;
    }
    const fix = MOCK_FIXES[issueId];
    if (fix === undefined) {
      const err = new Error(`Unknown issue: ${issueId}`);
      err.code = "UNKNOWN_ISSUE";
      throw err;
    }
    return {
      ...fix,
      rationaleSteps: [...fix.rationaleSteps],
      impactedNodes: [...fix.impactedNodes],
      sourceVerified: true,
      warning: null,
    };
  }
  const cacheKey = `${getActiveSubdir()}:${issueId}`;
  if (retry) {
    generatedFixes.delete(cacheKey);
  }
  const cached = generatedFixes.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  if (!retry && pendingFixes.has(cacheKey)) {
    return pendingFixes.get(cacheKey);
  }
  const pending = generateLiveFix(issueId, suppliedIssue, cacheKey);
  pendingFixes.set(cacheKey, pending);
  try {
    return await pending;
  } finally {
    if (pendingFixes.get(cacheKey) === pending) {
      pendingFixes.delete(cacheKey);
    }
  }
}

async function generateLiveFix(issueId, suppliedIssue, cacheKey) {
  const analyzed = suppliedIssue === null ? await analyzeProject() : null;
  const issue = suppliedIssue ?? analyzed.issues.find((candidate) => candidate.id === issueId);
  if (issue === undefined || issue.id !== issueId || issue.file?.startsWith(`${getActiveSubdir()}/`) !== true) {
    const err = new Error(`Issue not found in the active project: ${issueId}`);
    err.code = "UNKNOWN_ISSUE";
    throw err;
  }
  const source = await readFile(issue.file);
  let result;
  let sourceVerified = false;
  let validationFeedback = null;
  for (let attempt = 1; attempt <= FIX_RESPONSE_ATTEMPTS; attempt += 1) {
    try {
      result = await requestAI({
        task: "fix",
        context: {
          project: getActiveSubdir(),
          file: issue.file,
          source,
          issue: {
            title: issue.title,
            severity: issue.severity,
            evidence: issue.evidence,
            explanation: issue.explanation,
            suggested_action: issue.suggested_action,
          },
          ...(validationFeedback === null ? {} : { validationFeedback }),
        },
      });
    } catch (err) {
      if (err.code !== "AI_INVALID_RESPONSE" || attempt === FIX_RESPONSE_ATTEMPTS) {
        throw err;
      }
      validationFeedback = "Your previous response did not contain all required fix fields. Return the complete JSON object exactly in the requested schema.";
      console.warn(`[ai] ${JSON.stringify({ event: "fix_response_retry", issueId, attempt, reason: "invalid_response_shape" })}`);
      continue;
    }
    sourceVerified = countOccurrences(source, result.originalCode) === 1;
    if (sourceVerified || attempt === FIX_RESPONSE_ATTEMPTS) {
      break;
    }
    validationFeedback = "The originalCode from your previous response was not an exact unique substring of the supplied source. Copy an exact contiguous source snippet verbatim, including punctuation and whitespace, and make the proposedCode replace only that snippet.";
    console.warn(`[ai] ${JSON.stringify({ event: "fix_response_retry", issueId, attempt, reason: "source_mismatch" })}`);
  }
  const proposal = {
    id: `fix-${issue.id}`,
    issueId: issue.id,
    file: issue.file,
    originalCode: result.originalCode,
    proposedCode: result.proposedCode,
    unifiedDiff: makeDiff(issue.file, result.originalCode, result.proposedCode),
    explanation: result.explanation.trim().length === 0 ? issue.explanation : result.explanation,
    rationaleSteps: result.rationaleSteps.filter((step) => typeof step === "string"),
    impactedNodes: [issue.node_id],
    risk: ["low", "medium", "high"].includes(result.risk) ? result.risk : "medium",
    sourceVerified,
    warning: sourceVerified
      ? null
      : "The AI's originalCode did not exactly and uniquely match the current file after retrying. Review only; applying this proposal is disabled.",
  };
  generatedFixes.set(cacheKey, proposal);
  if (!sourceVerified) {
    console.warn(`[ai] ${JSON.stringify({ event: "fix_proposal_unverified", issueId })}`);
  }
  return proposal;
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
  if (!fix.sourceVerified) {
    const err = new Error("This proposal is unverified because its original code does not match the current file. It cannot be applied.");
    err.code = "PATCH_CONFLICT";
    throw err;
  }
  const current = await readFile(fix.file);
  const first = current.indexOf(fix.originalCode);
  if (first === -1 || first !== current.lastIndexOf(fix.originalCode)) {
    const err = new Error(`The proposed code in ${fix.file} is missing or ambiguous; the file may have changed`);
    err.code = "PATCH_CONFLICT";
    throw err;
  }

  const backupAbs = await safePath(`${fix.file}.bak`);
  try {
    await fs.stat(backupAbs);
    const err = new Error(`A backup already exists for ${fix.file}; revert or preserve it before applying another fix`);
    err.code = "PATCH_CONFLICT";
    throw err;
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  await writeFile(`${fix.file}.bak`, current);
  const updated = current.slice(0, first) + fix.proposedCode + current.slice(first + fix.originalCode.length);
  await writeFile(fix.file, updated);
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

function countOccurrences(source, search) {
  if (typeof search !== "string" || search.length === 0) {
    return 0;
  }
  let count = 0;
  let offset = 0;
  while ((offset = source.indexOf(search, offset)) !== -1) {
    count += 1;
    offset += search.length;
  }
  return count;
}

function makeDiff(file, originalCode, proposedCode) {
  return [
    `--- a/${file}`,
    `+++ b/${file}`,
    "@@",
    ...originalCode.split(/\r?\n/).map((line) => `-${line}`),
    ...proposedCode.split(/\r?\n/).map((line) => `+${line}`),
  ].join("\n");
}
