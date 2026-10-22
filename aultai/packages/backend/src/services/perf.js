import { randomUUID } from "node:crypto";
import autocannon from "autocannon";
import { PORT } from "../config.js";
import { projectStatus } from "./projectManager.js";
import { getActiveSubdir } from "./sandbox.js";

/**
 * @typedef {import("../models.js").PerfResult} PerfResult
 */

/** @type {PerfResult[]} In-memory history of the last runs (max 10). */
const history = [];

const DEFAULT_PAYLOAD = {
  cart: { items: [{ productId: "p1", quantity: 1 }] },
  voucher: {
    code: "MINUS50",
    type: "fixed",
    value: 50,
    expiresAt: null,
    minSpend: 0,
  },
};

/**
 * Run a load test against the local backend (which also serves /shop-api).
 * @param {object} [opts]
 * @param {string} [opts.endpoint] Path under http://localhost:PORT.
 * @param {string} [opts.method] HTTP method.
 * @param {object | null} [opts.payload] JSON body for POST/PUT.
 * @param {number} [opts.concurrency] Simultaneous connections.
 * @param {number} [opts.duration] Test duration in seconds.
 * @returns {Promise<PerfResult>} Aggregated perf numbers.
 */
export async function runLoadTest(opts = {}) {
  const endpoint = opts.endpoint ?? "/shop-api/cart/checkout";
  const method = (opts.method ?? "POST").toUpperCase();
  const payload = opts.payload === undefined ? DEFAULT_PAYLOAD : opts.payload;
  const activeProject = getActiveSubdir();
  if (opts.project !== undefined && opts.project !== activeProject) {
    throw perfError("ACTIVE_PROJECT_CHANGED", "The active project changed. Refresh and retry the performance test.");
  }
  validateEndpoint(endpoint, activeProject);
  const concurrency = validateInt(opts.concurrency ?? 10, "concurrency", 1, 100);
  const duration = validateInt(opts.duration ?? 5, "duration", 1, 60);
  let port = PORT;
  if (activeProject === "dynamic_project") {
    const status = projectStatus();
    if (!status.running || status.port === null) {
      throw perfError("PROJECT_NOT_RUNNING", "Start the uploaded project before running a performance test.");
    }
    port = status.port;
  }
  const url = `http://127.0.0.1:${port}${endpoint}`;
  const result = await runAutocannon({ url, method, payload, concurrency, duration });
  const totalRequests = result.requests?.total ?? 0;
  const errors = result.errors ?? 0;
  const perf = {
    id: randomUUID(),
    project: activeProject,
    endpoint,
    concurrency,
    duration,
    rps: Math.round((result.requests?.average ?? 0) * 100) / 100,
    latency: {
      // NOTE: autocannon v7 histograms expose p50/p75/p90/p97_5/p99 (no p95
      // bucket), so p50/p95/p99 are interpolated between bracketing buckets.
      p50: quantile(result.latency, 50),
      p95: quantile(result.latency, 95),
      p99: quantile(result.latency, 99),
    },
    totalRequests,
    errors,
    errorRate: totalRequests === 0 ? 0 : Math.round((errors / totalRequests) * 10000) / 100,
    timestamp: new Date().toISOString(),
  };
  history.push(perf);
  if (history.length > 10) {
    history.splice(0, history.length - 10);
  }
  return perf;
}

/**
 * Return the most recent load-test result, if any.
 * @returns {PerfResult | null} The last run or null.
 */
export function getLastRun() {
  return history.length === 0 ? null : history[history.length - 1];
}

/**
 * Run autocannon programmatically and resolve with its result object.
 * @param {object} args
 * @param {string} args.url Full target URL.
 * @param {string} args.method HTTP method.
 * @param {object | null} args.payload JSON body (for methods with a body).
 * @param {number} args.concurrency Connections.
 * @param {number} args.duration Seconds.
 * @returns {Promise<object>} Raw autocannon result.
 * @throws {Error} When autocannon emits an error.
 */
function runAutocannon({ url, method, payload, concurrency, duration }) {
  return new Promise((resolve, reject) => {
    const opts = { url, method, connections: concurrency, duration };
    if (payload !== null && payload !== undefined && method !== "GET" && method !== "HEAD") {
      opts.body = JSON.stringify(payload);
      opts.headers = { "content-type": "application/json" };
    }
    const instance = autocannon(opts);
    instance.on("done", (result) => resolve(result));
    instance.on("error", (err) => reject(err));
  });
}

/**
 * Clamp a value to an integer range, falling back to the minimum.
 * @param {unknown} value Raw value.
 * @param {number} min Minimum (also the fallback).
 * @param {number} max Maximum.
 * @returns {number} Clamped integer.
 */
function validateInt(value, name, min, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw perfError("INVALID_PERF_REQUEST", `${name} must be an integer between ${min} and ${max}.`);
  }
  return n;
}

/**
 * Restrict load-test targets to the active project's local application.
 * @param {string} endpoint Relative URL path requested by the caller.
 * @param {string} project Active project name.
 * @returns {void}
 */
function validateEndpoint(endpoint, project) {
  if (
    typeof endpoint !== "string" ||
    !endpoint.startsWith("/") ||
    endpoint.startsWith("//") ||
    endpoint.includes("\\") ||
    endpoint.includes("#") ||
    /[\r\n\0]/.test(endpoint)
  ) {
    throw perfError("INVALID_PERF_ENDPOINT", "Endpoint must be a local application path beginning with /.");
  }
  let url;
  try {
    url = new URL(endpoint, "http://127.0.0.1");
  } catch {
    throw perfError("INVALID_PERF_ENDPOINT", "Endpoint must be a valid local application path.");
  }
  if (url.origin !== "http://127.0.0.1") {
    throw perfError("INVALID_PERF_ENDPOINT", "External performance-test targets are not allowed.");
  }
  if (project === "shop-api" && !/^\/shop-api(?:\/|$)/.test(url.pathname)) {
    throw perfError("INVALID_PERF_ENDPOINT", "The shop-api target must use a /shop-api path.");
  }
}

/**
 * Build a performance-request error with a stable API code.
 * @param {string} code Error code.
 * @param {string} message User-facing description.
 * @returns {Error} The error.
 */
function perfError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * Estimate a latency percentile by linear interpolation between autocannon's
 * histogram buckets (p50, p75, p90, p97_5, p99, p99_9, ...).
 * @param {object | undefined} latency Autocannon latency object.
 * @param {number} pct Desired percentile (e.g. 95).
 * @returns {number} Interpolated ms value rounded to 2 decimals.
 */
function quantile(latency, pct) {
  const table = [
    [50, latency?.p50],
    [75, latency?.p75],
    [90, latency?.p90],
    [97.5, latency?.p97_5],
    [99, latency?.p99],
    [99.9, latency?.p99_9],
  ].filter(([, v]) => typeof v === "number");
  if (table.length === 0) {
    return 0;
  }
  if (pct <= table[0][0]) {
    return round2(table[0][1]);
  }
  for (let i = 1; i < table.length; i += 1) {
    if (pct <= table[i][0]) {
      const [p0, v0] = table[i - 1];
      const [p1, v1] = table[i];
      const t = (pct - p0) / (p1 - p0);
      return round2(v0 + (v1 - v0) * t);
    }
  }
  return round2(table[table.length - 1][1]);
}

/**
 * Round to 2 decimals.
 * @param {number} n Value.
 * @returns {number} Rounded value.
 */
function round2(n) {
  return Math.round(n * 100) / 100;
}
