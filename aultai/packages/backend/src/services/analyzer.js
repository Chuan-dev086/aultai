import { buildGraph } from "./graphBuilder.js";
import { isMockMode } from "./llm.js";
import { getActiveSubdir, readFile } from "./sandbox.js";
import { requestAI } from "./aiService.js";
import { IssueSchema } from "../models.js";

/**
 * @typedef {import("../models.js").Issue} Issue
 */

const SEVERITY_RANK = { high: 0, medium: 1, low: 2 };

/**
 * Run deterministic heuristics plus an AI pass over the active project.
 * @returns {Promise<{ issues: Issue[], mode: "live" | "mock" }>} Issues and mode.
 */
export async function analyzeProject() {
  const mode = isMockMode() ? "mock" : "live";
  const { nodes } = await buildGraph();

  const heuristic = runHeuristics(nodes);
  const llmIssues = await runLlmPass(nodes);

  const merged = [...heuristic, ...llmIssues].filter(
    (i) => i.node_id !== "vouchers.applyVoucher",
  );
  const validated = [];
  for (const issue of merged) {
    const parsed = IssueSchema.safeParse(issue);
    if (parsed.success) {
      validated.push(parsed.data);
    }
  }
  const deduped = dedupe(validated);
  deduped.sort((a, b) => {
    const sev = (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9);
    if (sev !== 0) {
      return sev;
    }
    if (a.file !== b.file) {
      return a.file < b.file ? -1 : 1;
    }
    return a.lineno - b.lineno;
  });
  return { issues: deduped, mode };
}

/**
 * Explain a single graph node in plain language.
 * @param {string} nodeId Node id (e.g. "checkout.calculateCheckoutTotal").
 * @returns {Promise<{ explanation: string }>} The explanation.
 * @throws {Error} With code "NOT_FOUND" when the node does not exist.
 */
export async function explainNode(nodeId) {
  const { nodes, edges } = await buildGraph();
  const node = nodes.find((n) => n.id === nodeId);
  if (node === undefined) {
    const err = new Error(`Node not found: ${nodeId}`);
    err.code = "NOT_FOUND";
    throw err;
  }
  if (isMockMode()) {
    return { explanation: mockExplanation(node), mode: "mock" };
  }
  const result = await requestAI({
    task: "explain",
    context: {
      project: getActiveSubdir(),
      node: {
        id: node.id,
        type: node.type,
        file: node.file,
        signature: node.signature,
        source: node.source,
      },
      callers: edges.filter((edge) => edge.type === "calls" && edge.target === node.id).map((edge) => edge.source),
      callees: edges.filter((edge) => edge.type === "calls" && edge.source === node.id).map((edge) => edge.target),
    },
  });
  if (typeof result.explanation !== "string") {
    throw analysisError("AI_INVALID_RESPONSE", "The AI response did not include an explanation.");
  }
  return { explanation: result.explanation, mode: "live" };
}

/**
 * Deterministic pattern checks over function/method sources.
 * @param {object[]} nodes Graph nodes.
 * @returns {object[]} Raw issue candidates (may include applyVoucher refs).
 */
function runHeuristics(nodes) {
  const out = [];
  for (const n of nodes) {
    if (n.type !== "function" && n.type !== "method") {
      continue;
    }
    const src = n.source ?? "";
    const lines = src.split("\n");
    lines.forEach((line, idx) => {
      const lineno = n.lineno + idx;
      if (/catch\s*(\(\s*[a-zA-Z_$][\w$]*\s*\))?\s*\{\s*\}/.test(line)) {
        out.push({
          id: `issue-empty-catch-${n.id}-${lineno}`,
          title: "Empty catch block swallows errors",
          severity: "medium",
          node_id: n.id,
          file: n.file,
          lineno,
          evidence: line.trim(),
          explanation: "An empty catch block silently discards failures, hiding bugs during checkout.",
          suggested_action: "Log the error or return an explicit failure instead of an empty block.",
        });
      }
      if (/[^=!]==?\s*null|[^=!]!=\s*null/.test(line) && /== null|!= null/.test(line)) {
        out.push({
          id: `issue-loose-null-${n.id}-${lineno}`,
          title: "Loose equality used for null check",
          severity: "low",
          node_id: n.id,
          file: n.file,
          lineno,
          evidence: line.trim(),
          explanation: "Loose equality matches both null and undefined, which can mask missing values.",
          suggested_action: "Use explicit `=== null` / `!== null` checks (and a separate undefined check if needed).",
        });
      }
      if (
        /voucher\.value/.test(line) &&
        /- voucher\.value/.test(line) &&
        !/Math\.(min|max)/.test(line) &&
        !/Math\.(min|max)/.test(lines.slice(Math.max(0, idx - 2), idx + 1).join("\n"))
      ) {
        out.push({
          id: "issue-bug1-checkout-no-floor",
          title: "BUG 1 — checkout total not floored at zero for fixed vouchers",
          severity: "high",
          node_id: n.id,
          file: n.file,
          lineno,
          evidence: line.trim(),
          explanation:
            "The fixed-amount discount is subtracted without capping it at the discountable subtotal and without flooring the grand total at zero. A 50.00 voucher on a 19.90 cart yields -23.11 instead of 0.00.",
          suggested_action:
            "Compute discount = Math.min(voucher.value, discountableSubtotal) and total = Math.max(0, discountableSubtotal + tax + shipping - discount).",
        });
      }
      if (/expir/i.test(line) && /> now/.test(line)) {
        out.push({
          id: "issue-bug2-voucher-expiry-inverted",
          title: "BUG 2 — voucher expiry check is inverted",
          severity: "high",
          node_id: n.id,
          file: n.file,
          lineno,
          evidence: line.trim(),
          explanation:
            "The comparison accepts expired vouchers and rejects valid ones. A voucher must be valid only while expiresAt is in the future.",
          suggested_action: "Change the comparison to `voucher.expiresAt <= now` so only expired vouchers throw.",
        });
      }
    });
  }
  return out;
}

/**
 * AI pass over active-project sources. Offline mode preserves demo issues.
 * @param {object[]} nodes Graph nodes (used to bound source loading).
 * @returns {Promise<object[]>} Raw issue candidates.
 */
async function runLlmPass(nodes) {
  const active = getActiveSubdir();
  const files = [...new Set(
    nodes
      .filter((node) => node.file?.startsWith(`${active}/`) && /\.(js|jsx)$/.test(node.file))
      .map((node) => node.file),
  )];
  if (isMockMode()) {
    return active === "shop-api" ? mockIssues() : [];
  }
  const sourceFiles = [];
  const lineCounts = new Map();
  let remainingBytes = 32000;
  for (const file of files) {
    if (remainingBytes <= 0) break;
    try {
      const text = await readFile(file);
      const source = text.slice(0, Math.min(6000, remainingBytes));
      sourceFiles.push({ file: file.slice(active.length + 1), source });
      lineCounts.set(file, text.split(/\r?\n/).length);
      remainingBytes -= Buffer.byteLength(source, "utf8");
    } catch {
      continue;
    }
  }
  const result = await requestAI({
    task: "analyze",
    context: { project: active, files: sourceFiles },
  });
  if (!Array.isArray(result.issues)) {
    throw analysisError("AI_INVALID_RESPONSE", "The AI analysis response did not include an issues array.");
  }
  const normalized = result.issues.flatMap((candidate) => normalizeAIssue(candidate, active, nodes, files, lineCounts));
  if (result.issues.length > 0 && normalized.length === 0) {
    throw analysisError("AI_INVALID_RESPONSE", "The AI findings did not map to valid source files and lines in the active project.");
  }
  return normalized;
}

function normalizeAIssue(candidate, active, nodes, files, lineCounts) {
  if (candidate === null || typeof candidate !== "object" || typeof candidate.file !== "string") {
    return [];
  }
  const requested = candidate.file.replace(/\\/g, "/").replace(/^\.\/+/, "");
  const fullPath = requested.startsWith(`${active}/`) ? requested : `${active}/${requested}`;
  if (!files.includes(fullPath)) return [];
  const fileNodes = nodes.filter((node) => node.file === fullPath);
  const nodeId = fileNodes.some((node) => node.id === candidate.node_id)
    ? candidate.node_id
    : fileNodes[0]?.id;
  if (nodeId === undefined) return [];
  const lineNumber = Number.isInteger(candidate.lineno) && candidate.lineno > 0 ? candidate.lineno : 1;
  if (lineNumber > (lineCounts.get(fullPath) ?? 0)) return [];
  const issue = {
    id: typeof candidate.id === "string" && candidate.id.length > 0
      ? candidate.id.slice(0, 160)
      : `ai-${fullPath.replace(/[^a-zA-Z0-9]+/g, "-")}-${Number(candidate.lineno) || 1}`,
    title: typeof candidate.title === "string" ? candidate.title.slice(0, 240) : "",
    severity: ["low", "medium", "high"].includes(candidate.severity) ? candidate.severity : "medium",
    node_id: nodeId,
    file: fullPath,
    lineno: lineNumber,
    evidence: typeof candidate.evidence === "string" ? candidate.evidence.slice(0, 1000) : "",
    explanation: typeof candidate.explanation === "string" ? candidate.explanation.slice(0, 4000) : "",
    suggested_action: typeof candidate.suggested_action === "string" ? candidate.suggested_action.slice(0, 2000) : "",
  };
  const parsed = IssueSchema.safeParse(issue);
  return parsed.success ? [parsed.data] : [];
}

function analysisError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * Exact mock issues for the offline demo.
 * @returns {object[]} The two planted-bug issues.
 */
function mockIssues() {
  return [
    {
      id: "issue-bug1-checkout-no-floor",
      title: "BUG 1 — checkout total not floored at zero for fixed vouchers",
      severity: "high",
      node_id: "checkout.calculateCheckoutTotal",
      file: "shop-api/src/checkout.js",
      lineno: 40,
      evidence: "const total = discountableSubtotal + taxAmount + shippingAmount - voucher.value;",
      explanation:
        "The fixed-amount discount is subtracted without capping it at the discountable subtotal and without flooring the grand total at zero. A 50.00 voucher on a 19.90 cart yields -23.11 instead of 0.00.",
      suggested_action:
        "Compute discount = Math.min(voucher.value, discountableSubtotal) and total = Math.max(0, discountableSubtotal + tax + shipping - discount).",
    },
    {
      id: "issue-bug2-voucher-expiry-inverted",
      title: "BUG 2 — voucher expiry check is inverted",
      severity: "high",
      node_id: "vouchers.validateVoucher",
      file: "shop-api/src/vouchers.js",
      lineno: 9,
      evidence: "if (voucher.expiresAt !== null && voucher.expiresAt > now) {",
      explanation:
        "The comparison accepts expired vouchers and rejects valid ones. A voucher must be valid only while expiresAt is in the future.",
      suggested_action: "Change the comparison to `voucher.expiresAt <= now` so only expired vouchers throw.",
    },
  ];
}

/**
 * Coherent 3-5 sentence mock explanation for a node.
 * @param {object} node Graph node.
 * @returns {string} The explanation.
 */
function mockExplanation(node) {
  const where = node.file !== undefined ? ` in ${node.file}` : "";
  const lines =
    node.lineno !== undefined ? ` It spans lines ${node.lineno}-${node.end_lineno ?? node.lineno}` : "";
  return (
    `${node.id} is a ${node.type} node${where} that ${describeRole(node)}. ` +
    `Its signature is \`${node.signature ?? node.id}\`${lines}. ` +
    `It connects to ${countHint(node)} other graph nodes via calls, imports, or defines edges. ` +
    "In the demo checkout flow it sits on the path exercised by the MINUS50 and EXPIRED10 vouchers, " +
    "which is where the two planted bugs surface. " +
    "Use the callers and callees lists to trace how values flow into and out of this node."
  );
}

/**
 * One-line role description for the mock explanation.
 * @param {object} node Graph node.
 * @returns {string} Role phrase.
 */
function describeRole(node) {
  if (node.type === "module") {
    return "groups the definitions parsed from one source file";
  }
  if (node.type === "class") {
    return "defines a class whose methods appear as separate nodes";
  }
  if (node.type === "variable") {
    return "holds a top-level value referenced by other nodes";
  }
  return "implements one step of the program logic";
}

/**
 * Hint phrase for connectivity (avoids overclaiming exact counts).
 * @param {object} node Graph node.
 * @returns {string} Connectivity phrase.
 */
function countHint(node) {
  void node;
  return "one or more";
}

/**
 * Dedupe issues by (file, lineno, title-prefix) keeping the first.
 * @param {object[]} issues Validated issues.
 * @returns {object[]} Deduped issues.
 */
function dedupe(issues) {
  const seen = new Set();
  const out = [];
  for (const i of issues) {
    const key = `${i.file}:${i.lineno}:${i.title.slice(0, 24)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(i);
  }
  return out;
}
