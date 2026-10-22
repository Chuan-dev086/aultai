import { spawn } from "node:child_process";
import path from "node:path";
import { SHOP_API_DIR } from "../config.js";

/**
 * @typedef {Object} SingleTestResult
 * @property {string} name
 * @property {"passed" | "failed"} status
 * @property {number} duration_ms
 * @property {string | null} error
 */

/**
 * @typedef {Object} TestRunResult
 * @property {number} total
 * @property {number} passed
 * @property {number} failed
 * @property {number} duration_ms
 * @property {SingleTestResult[]} tests
 */

const TIMEOUT_MS = 120000;

/**
 * Run the shop-api Vitest suite in a child process with --reporter=json.
 * Never runs analyzed code in this process.
 * @returns {Promise<TestRunResult>} Parsed per-test results.
 */
export function runTests() {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    // NOTE: on Windows, npm is a .cmd shim and requires a shell to execute.
    const child = spawn("npm", ["test", "--", "--reporter=json"], {
      cwd: path.resolve(SHOP_API_DIR),
      shell: process.platform === "win32",
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(testTimeout());
    }, TIMEOUT_MS);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", () => {
      clearTimeout(timer);
      try {
        resolve(parseVitestJson(stdout, Date.now() - started));
      } catch (err) {
        err.message = `Failed to parse vitest JSON output: ${err.message}\nstderr: ${stderr.slice(0, 500)}`;
        reject(err);
      }
    });
  });
}

/**
 * Parse Vitest --reporter=json stdout into a TestRunResult.
 * @param {string} stdout Raw stdout from the vitest process.
 * @param {number} duration_ms Wall-clock duration of the run.
 * @returns {TestRunResult} Parsed results.
 * @throws {Error} When no JSON object can be extracted.
 */
function parseVitestJson(stdout, duration_ms) {
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("no JSON object found in vitest output");
  }
  const parsed = JSON.parse(stdout.slice(start, end + 1));
  const tests = [];
  for (const file of parsed.testResults ?? []) {
    for (const a of file.assertionResults ?? []) {
      tests.push({
        name: a.fullName ?? a.title,
        status: a.status === "passed" ? "passed" : "failed",
        duration_ms: Math.round((a.duration ?? 0) * 100) / 100,
        error: (a.failureMessages ?? []).join("\n").slice(0, 2000) || null,
      });
    }
  }
  const failed = tests.filter((t) => t.status === "failed").length;
  return {
    total: tests.length,
    passed: tests.length - failed,
    failed,
    duration_ms,
    tests,
  };
}

/**
 * Build a timeout error for a test run that exceeded TIMEOUT_MS.
 * @returns {Error} Error indicating the timeout.
 */
function testTimeout() {
  const err = new Error(`Test run timed out after ${TIMEOUT_MS}ms`);
  err.code = "TEST_TIMEOUT";
  return err;
}
