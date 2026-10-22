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
