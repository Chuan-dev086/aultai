const BASE = "/api";

/**
 * Parse a non-2xx response body into a { code, message } error and throw it.
 * @param {Response} res Fetch response with non-2xx status.
 * @param {string} endpoint Endpoint label used when the body has no message.
 * @returns {Promise<never>}
 */
async function throwApiError(res, endpoint) {
  let code = "REQUEST_FAILED";
  let message = `${endpoint} failed with status ${res.status}`;
  try {
    const body = await res.json();
    if (body !== null && typeof body === "object" && body.error !== undefined) {
      code = body.error.code ?? code;
      message = body.error.message ?? message;
    }
  } catch {
    // Keep the default message when the body is not JSON.
  }
  const err = new Error(message);
  err.code = code;
  err.status = res.status;
  throw err;
}

/**
 * Load project summary: files plus node/edge counts.
 * @returns {Promise<import("../types.js").ProjectInfo>} The project info.
 */
export async function loadProject() {
  const res = await fetch(`${BASE}/project/load`);
  if (!res.ok) {
    await throwApiError(res, "loadProject");
  }
  return res.json();
}

/**
 * Fetch the full code graph.
 * @returns {Promise<import("../types.js").GraphData>} Nodes and edges.
 */
export async function fetchGraph() {
  const res = await fetch(`${BASE}/graph`);
  if (!res.ok) {
    await throwApiError(res, "fetchGraph");
  }
  return res.json();
}

/**
 * Fetch a single node with its callers and callees.
 * @param {string} id Node id (e.g. "checkout.calculateCheckoutTotal").
 * @returns {Promise<import("../types.js").NodeDetail>} The node detail.
 */
export async function fetchNode(id) {
  const res = await fetch(`${BASE}/node/${encodeURIComponent(id)}`);
  if (!res.ok) {
    await throwApiError(res, "fetchNode");
  }
  return res.json();
}

/**
 * Run project analysis (heuristics + LLM pass).
 * @returns {Promise<import("../types.js").AnalyzeResponse>} Issues and mode.
 */
export async function analyze() {
  const res = await fetch(`${BASE}/analyze`, { method: "POST" });
  if (!res.ok) {
    await throwApiError(res, "analyze");
  }
  return res.json();
}

/**
 * Explain a single graph node.
 * @param {string} id Node id (e.g. "checkout.calculateCheckoutTotal").
 * @returns {Promise<{ explanation: string }>} The explanation.
 */
export async function explainNode(id) {
  const res = await fetch(`${BASE}/node/${encodeURIComponent(id)}/explain`, {
    method: "POST",
  });
  if (!res.ok) {
    await throwApiError(res, "explainNode");
  }
  return res.json();
}

/**
 * Generate a fix proposal for an issue (no files touched).
 * @param {string} issueId Issue id (e.g. "issue-bug1-checkout-no-floor").
 * @returns {Promise<import("../types.js").FixProposal>} The fix proposal.
 */
export async function generateFix(issueId) {
  const res = await fetch(`${BASE}/fix`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ issueId }),
  });
  if (!res.ok) {
    await throwApiError(res, "generateFix");
  }
  return res.json();
}

/**
 * Apply a fix (explicit user action; creates a .bak backup).
 * @param {string} issueId Issue id.
 * @returns {Promise<{ applied: true, backupPath: string }>} Apply result.
 */
export async function applyFix(issueId) {
  const res = await fetch(`${BASE}/fix/apply`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ issueId }),
  });
  if (!res.ok) {
    await throwApiError(res, "applyFix");
  }
  return res.json();
}

/**
 * Revert an applied fix (restores the .bak backup).
 * @param {string} issueId Issue id.
 * @returns {Promise<{ reverted: true }>} Revert result.
 */
export async function revertFix(issueId) {
  const res = await fetch(`${BASE}/fix/revert`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ issueId }),
  });
  if (!res.ok) {
    await throwApiError(res, "revertFix");
  }
  return res.json();
}

/**
 * Generate a regression test suite (mock; writes test_generated.test.js).
 * @returns {Promise<import("../types.js").GenerateTestsResponse>} Generated tests.
 */
export async function generateTests() {
  const res = await fetch(`${BASE}/tests/generate`, { method: "POST" });
  if (!res.ok) {
    await throwApiError(res, "generateTests");
  }
  return res.json();
}

/**
 * Run the shop-api Vitest suite and return per-test results.
 * @returns {Promise<import("../types.js").TestRunResult>} Test run results.
 */
export async function runTests() {
  const res = await fetch(`${BASE}/tests/run`, { method: "POST" });
  if (!res.ok) {
    await throwApiError(res, "runTests");
  }
  return res.json();
}

/**
 * Run a load test against the local backend.
 * @param {object} config
 * @param {string} [config.endpoint]
 * @param {string} [config.method]
 * @param {object} [config.payload]
 * @param {number} [config.concurrency]
 * @param {number} [config.duration]
 * @returns {Promise<import("../types.js").PerfResult>} Perf numbers.
 */
export async function runPerfTest(config) {
  const res = await fetch(`${BASE}/perf/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(config ?? {}),
  });
  if (!res.ok) {
    await throwApiError(res, "runPerfTest");
  }
  return res.json();
}

/**
 * Fetch the most recent load-test result.
 * @returns {Promise<import("../types.js").PerfResult>} Last perf numbers.
 */
export async function fetchLastPerf() {
  const res = await fetch(`${BASE}/perf/last`);
  if (!res.ok) {
    await throwApiError(res, "fetchLastPerf");
  }
  return res.json();
}
