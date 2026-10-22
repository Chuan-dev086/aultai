const BASE = "/api";

/**
 * Make an API request and provide a useful error when the backend is unreachable.
 * @param {string} url Request URL.
 * @param {RequestInit} [options] Fetch options.
 * @param {string} endpoint Endpoint label used in the error.
 * @returns {Promise<Response>} Fetch response.
 */
async function apiFetch(url, options, endpoint) {
  try {
    return await fetch(url, options);
  } catch (cause) {
    const err = new Error(
      `Could not reach the AultAI backend for ${endpoint}. Check that it is running and retry.`,
    );
    err.code = "BACKEND_UNAVAILABLE";
    err.cause = cause;
    throw err;
  }
}

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
    const rawBody = await res.text();
    const body = rawBody.length === 0 ? null : JSON.parse(rawBody);
    if (body !== null && typeof body === "object" && body.error !== undefined) {
      code = body.error.code ?? code;
      message = body.error.message ?? message;
    }
  } catch {
    code = "INVALID_ERROR_RESPONSE";
    message = `${endpoint} failed with status ${res.status} and returned an invalid error response.`;
  }
  const err = new Error(message);
  err.code = code;
  err.status = res.status;
  throw err;
}

/**
 * Parse a successful API response and report malformed JSON with endpoint context.
 * @param {Response} res Successful fetch response.
 * @param {string} endpoint Endpoint label used in the error.
 * @returns {Promise<any>} Parsed response body.
 */
async function parseJsonResponse(res, endpoint) {
  try {
    return await res.json();
  } catch (cause) {
    const err = new Error(`${endpoint} returned an invalid JSON response.`);
    err.code = "INVALID_RESPONSE";
    err.cause = cause;
    throw err;
  }
}

/**
 * Load project summary: files plus node/edge counts.
 * @returns {Promise<import("../types.js").ProjectInfo>} The project info.
 */
export async function loadProject() {
  const res = await apiFetch(`${BASE}/project/load`, undefined, "loadProject");
  if (!res.ok) {
    await throwApiError(res, "loadProject");
  }
  return parseJsonResponse(res, "loadProject");
}

/**
 * Upload a .zip project for extraction + background install.
 * @param {File} file The .zip file from the file input.
 * @returns {Promise<{ success: boolean, message: string, path: string }>} Result.
 */
export async function uploadProject(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await apiFetch(
    `${BASE}/project/upload`,
    { method: "POST", body: form },
    "uploadProject",
  );
  if (!res.ok) {
    await throwApiError(res, "uploadProject");
  }
  return parseJsonResponse(res, "uploadProject");
}

/**
 * Start the uploaded project in the background (port 3001).
 * @returns {Promise<{ port: number, previewPort: number, pid: number | null }>} Backend and preview ports.
 */
export async function startUploadedProject() {
  const res = await apiFetch(`${BASE}/project/start`, { method: "POST" }, "startUploadedProject");
  if (!res.ok) {
    await throwApiError(res, "startUploadedProject");
  }
  return parseJsonResponse(res, "startUploadedProject");
}

/**
 * Stop the background uploaded project.
 * @returns {Promise<{ stopped: boolean }>} Whether a process was stopped.
 */
export async function stopUploadedProject() {
  const res = await apiFetch(`${BASE}/project/stop`, { method: "POST" }, "stopUploadedProject");
  if (!res.ok) {
    await throwApiError(res, "stopUploadedProject");
  }
  return parseJsonResponse(res, "stopUploadedProject");
}

/**
 * Switch the active workspace back to the bundled shop-api.
 * @returns {Promise<{ active: string }>} The active workspace.
 */
export async function switchToShopApi() {
  const res = await apiFetch(`${BASE}/project/switch`, { method: "POST" }, "switchToShopApi");
  if (!res.ok) {
    await throwApiError(res, "switchToShopApi");
  }
  return parseJsonResponse(res, "switchToShopApi");
}

/**
 * Current upload/start status of the dynamic project.
 * @returns {Promise<{ active: string, port: number | null, previewPort: number | null, running: boolean }>} Status.
 */
export async function fetchProjectStatus() {
  const res = await apiFetch(`${BASE}/project/status`, undefined, "fetchProjectStatus");
  if (!res.ok) {
    await throwApiError(res, "fetchProjectStatus");
  }
  return parseJsonResponse(res, "fetchProjectStatus");
}

/**
 * Fetch the full code graph.
 * @returns {Promise<import("../types.js").GraphData>} Nodes and edges.
 */
export async function fetchGraph() {
  const res = await apiFetch(`${BASE}/graph`, undefined, "fetchGraph");
  if (!res.ok) {
    await throwApiError(res, "fetchGraph");
  }
  return parseJsonResponse(res, "fetchGraph");
}

/**
 * Fetch a single node with its callers and callees.
 * @param {string} id Node id (e.g. "checkout.calculateCheckoutTotal").
 * @returns {Promise<import("../types.js").NodeDetail>} The node detail.
 */
export async function fetchNode(id) {
  const res = await apiFetch(`${BASE}/node/${encodeURIComponent(id)}`, undefined, "fetchNode");
  if (!res.ok) {
    await throwApiError(res, "fetchNode");
  }
  return parseJsonResponse(res, "fetchNode");
}

/**
 * Run project analysis (heuristics + LLM pass).
 * @returns {Promise<import("../types.js").AnalyzeResponse>} Issues and mode.
 */
export async function analyze() {
  const res = await apiFetch(`${BASE}/analyze`, { method: "POST" }, "analyze");
  if (!res.ok) {
    await throwApiError(res, "analyze");
  }
  return parseJsonResponse(res, "analyze");
}

/**
 * Explain a single graph node.
 * @param {string} id Node id (e.g. "checkout.calculateCheckoutTotal").
 * @returns {Promise<{ explanation: string, mode: "live" | "mock" }>} The explanation.
 */
export async function explainNode(id) {
  const res = await apiFetch(
    `${BASE}/node/${encodeURIComponent(id)}/explain`,
    { method: "POST" },
    "explainNode",
  );
  if (!res.ok) {
    await throwApiError(res, "explainNode");
  }
  return parseJsonResponse(res, "explainNode");
}

/**
 * Request a reviewable AI fix proposal for supplied code and an error.
 * @param {{ file: string, code: string, error: string }} request
 * @returns {Promise<import("../types.js").AISolution>} Unapplied proposal.
 */
export async function requestAISolution(request) {
  const res = await apiFetch(
    `${BASE}/ai/solution`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    },
    "requestAISolution",
  );
  if (!res.ok) await throwApiError(res, "requestAISolution");
  return parseJsonResponse(res, "requestAISolution");
}

/**
 * Apply an explicitly approved AI solution.
 * @param {string} proposalId
 * @returns {Promise<{ applied: true, backupPath: string }>}
 */
export async function applyAISolution(proposalId) {
  const res = await apiFetch(
    `${BASE}/ai/solution/apply`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ proposalId }),
    },
    "applyAISolution",
  );
  if (!res.ok) await throwApiError(res, "applyAISolution");
  return parseJsonResponse(res, "applyAISolution");
}

/**
 * Revert an explicitly applied AI solution.
 * @param {string} proposalId
 * @returns {Promise<{ reverted: true }>}
 */
export async function revertAISolution(proposalId) {
  const res = await apiFetch(
    `${BASE}/ai/solution/revert`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ proposalId }),
    },
    "revertAISolution",
  );
  if (!res.ok) await throwApiError(res, "revertAISolution");
  return parseJsonResponse(res, "revertAISolution");
}

/**
 * Generate a fix proposal for an issue (no files touched).
 * @param {string} issueId Issue id (e.g. "issue-bug1-checkout-no-floor").
 * @param {import("../types.js").Issue | null} [issue] Validated issue context for the AI fix.
 * @returns {Promise<import("../types.js").FixProposal>} The fix proposal.
 */
export async function generateFix(issueId, issue = null) {
  const res = await apiFetch(
    `${BASE}/fix`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ issueId, ...(issue === null ? {} : { issue }) }),
    },
    "generateFix",
  );
  if (!res.ok) {
    await throwApiError(res, "generateFix");
  }
  return parseJsonResponse(res, "generateFix");
}

/**
 * Apply a fix (explicit user action; creates a .bak backup).
 * @param {string} issueId Issue id.
 * @returns {Promise<{ applied: true, backupPath: string }>} Apply result.
 */
export async function applyFix(issueId) {
  const res = await apiFetch(
    `${BASE}/fix/apply`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ issueId }),
    },
    "applyFix",
  );
  if (!res.ok) {
    await throwApiError(res, "applyFix");
  }
  return parseJsonResponse(res, "applyFix");
}

/**
 * Revert an applied fix (restores the .bak backup).
 * @param {string} issueId Issue id.
 * @returns {Promise<{ reverted: true }>} Revert result.
 */
export async function revertFix(issueId) {
  const res = await apiFetch(
    `${BASE}/fix/revert`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ issueId }),
    },
    "revertFix",
  );
  if (!res.ok) {
    await throwApiError(res, "revertFix");
  }
  return parseJsonResponse(res, "revertFix");
}

/**
 * Generate test-case suggestions without writing project files.
 * @returns {Promise<import("../types.js").GenerateTestsResponse>} Generated tests.
 */
export async function generateTests() {
  const res = await apiFetch(`${BASE}/tests/generate`, { method: "POST" }, "generateTests");
  if (!res.ok) {
    await throwApiError(res, "generateTests");
  }
  return parseJsonResponse(res, "generateTests");
}

/**
 * Run the shop-api Vitest suite and return per-test results.
 * @returns {Promise<import("../types.js").TestRunResult>} Test run results.
 */
export async function runTests() {
  const res = await apiFetch(`${BASE}/tests/run`, { method: "POST" }, "runTests");
  if (!res.ok) {
    await throwApiError(res, "runTests");
  }
  return parseJsonResponse(res, "runTests");
}

/**
 * Explain the most recent actual test run.
 * @returns {Promise<{ summary: string, failure_explanations: { testName: string, explanation: string }[] }>}
 */
export async function explainTestResults() {
  const res = await apiFetch(`${BASE}/tests/explain`, { method: "POST" }, "explainTestResults");
  if (!res.ok) await throwApiError(res, "explainTestResults");
  return parseJsonResponse(res, "explainTestResults");
}

/**
 * Run a load test against the local backend.
 * @param {object} config
 * @param {string} [config.endpoint]
 * @param {string} [config.method]
 * @param {"shop-api" | "dynamic_project"} [config.project]
 * @param {object} [config.payload]
 * @param {number} [config.concurrency]
 * @param {number} [config.duration]
 * @returns {Promise<import("../types.js").PerfResult>} Perf numbers.
 */
export async function runPerfTest(config) {
  const res = await apiFetch(
    `${BASE}/perf/run`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(config ?? {}),
    },
    "runPerfTest",
  );
  if (!res.ok) {
    await throwApiError(res, "runPerfTest");
  }
  return parseJsonResponse(res, "runPerfTest");
}

/**
 * Fetch the most recent load-test result.
 * @returns {Promise<import("../types.js").PerfResult>} Last perf numbers.
 */
export async function fetchLastPerf() {
  const res = await apiFetch(`${BASE}/perf/last`, undefined, "fetchLastPerf");
  if (!res.ok) {
    await throwApiError(res, "fetchLastPerf");
  }
  return parseJsonResponse(res, "fetchLastPerf");
}

/**
 * Ask AI to analyze the most recent measured performance result.
 * @returns {Promise<{ summary: string, recommendations: string[] }>}
 */
export async function analyzePerfResult() {
  const res = await apiFetch(`${BASE}/perf/analyze`, { method: "POST" }, "analyzePerfResult");
  if (!res.ok) await throwApiError(res, "analyzePerfResult");
  return parseJsonResponse(res, "analyzePerfResult");
}
