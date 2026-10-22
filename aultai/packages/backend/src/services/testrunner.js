import { spawn } from "node:child_process";
import path from "node:path";
import treeKill from "tree-kill";
import { SHOP_API_DIR, WORKSPACE_DIR } from "../config.js";
import { getActiveSubdir } from "./sandbox.js";

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
const OUTPUT_LIMIT = 1024 * 1024;
let lastTestRun = null;
const activeTestRuns = new Map();

/**
 * Run the shop-api Vitest suite in a child process with --reporter=json.
 * Never runs analyzed code in this process.
 * @returns {Promise<TestRunResult>} Parsed per-test results.
 */
export function runTests() {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const active = getActiveSubdir();
    const args = active === "shop-api" ? ["test", "--", "--reporter=json"] : ["test"];
    // NOTE: on Windows, npm is a .cmd shim and requires a shell to execute.
    const child = spawn("npm", args, {
      cwd: active === "shop-api" ? path.resolve(SHOP_API_DIR) : path.resolve(WORKSPACE_DIR, active),
      shell: process.platform === "win32",
      windowsHide: true,
    });
    const runs = activeTestRuns.get(active) ?? new Set();
    const run = {
      child,
      closed: new Promise((resolveClose) => {
        child.once("close", resolveClose);
      }),
    };
    runs.add(run);
    activeTestRuns.set(active, runs);
    const removeRun = () => {
      runs.delete(run);
      if (runs.size === 0) {
        activeTestRuns.delete(active);
      }
    };
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      if (child.pid !== undefined) {
        treeKill(child.pid, (err) => {
          if (err && err.code !== "ESRCH") {
            console.error(`[tests] failed to stop timed-out test process: ${err.message}`);
          }
        });
      }
      reject(testTimeout());
    }, TIMEOUT_MS);
    child.stdout.on("data", (chunk) => {
      stdout = `${stdout}${String(chunk)}`.slice(-OUTPUT_LIMIT);
    });
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${String(chunk)}`.slice(-OUTPUT_LIMIT);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      removeRun();
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      removeRun();
      try {
        let result;
        try {
          result = parseVitestJson(stdout, Date.now() - started);
        } catch {
          const passed = code === 0;
          result = {
            total: 1,
            passed: passed ? 1 : 0,
            failed: passed ? 0 : 1,
            duration_ms: Date.now() - started,
            tests: [{
              name: "npm test",
              status: passed ? "passed" : "failed",
              duration_ms: Date.now() - started,
              error: passed ? null : (stderr || stdout).slice(-2000) || `npm test exited with code ${code}`,
            }],
          };
        }
        lastTestRun = { project: active, result };
        resolve(result);
      } catch (err) {
        reject(err);
      }
    });
  });
}

/**
 * Stop and await tests running against a workspace before replacing its files.
 * @param {string} project Workspace subdirectory name.
 * @returns {Promise<void>} Resolves when all matching test processes have exited.
 */
export async function stopTestsForProject(project) {
  const runs = [...(activeTestRuns.get(project) ?? [])];
  await Promise.all(runs.map(async ({ child, closed }) => {
    if (child.pid !== undefined && child.exitCode === null && child.signalCode === null) {
      await new Promise((resolve, reject) => {
        treeKill(child.pid, (err) => {
          if (err?.code === "ESRCH") {
            resolve();
          } else if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    }
    await closed;
  }));
}

/**
 * Return the most recent actual test run for AI explanation.
 * @returns {TestRunResult | null} Last result, if tests were executed.
 */
export function getLastTestRun() {
  return lastTestRun?.project === getActiveSubdir() ? lastTestRun.result : null;
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
