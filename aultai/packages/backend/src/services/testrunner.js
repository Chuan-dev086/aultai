import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import treeKill from "tree-kill";
import { SHOP_API_DIR } from "../config.js";
import { getActiveSubdir, getWorkspacePath } from "./sandbox.js";

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
 * Run the shop-api Vitest suite in a child process with --reporter=json and
 * thread workers, avoiding Vitest's Windows child-process serialization issue.
 * Never runs analyzed code in this process.
 * @returns {Promise<TestRunResult>} Parsed per-test results.
 */
export async function runTests() {
  const active = getActiveSubdir();
  const cwd = active === "shop-api" ? path.resolve(SHOP_API_DIR) : getWorkspacePath(active);
  await ensureTestCommand(cwd);

  return new Promise((resolve, reject) => {
    const started = Date.now();
    const args = active === "shop-api"
      ? ["test", "--", "--reporter=json", "--pool=threads"]
      : ["test"];
    // NOTE: on Windows, npm is a .cmd shim and requires a shell to execute.
    const child = spawn("npm", args, {
      cwd,
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
 * Save explicitly approved AI-generated Node test modules and execute them.
 * @param {Array<{ name: string, code: string }>} tests Generated test modules.
 * @returns {Promise<TestRunResult>} Per-test results.
 */
export async function runGeneratedTests(tests) {
  const active = getActiveSubdir();
  const cwd = getWorkspacePath(active);
  const totalBytes = tests.reduce((total, item) => total + Buffer.byteLength(item.code, "utf8"), 0);
  if (tests.length === 0 || tests.length > 20 || totalBytes > 100000) {
    throw testConfigurationError("Generated tests must contain 1–20 files and be no larger than 100 KB in total.");
  }
  for (const item of tests) {
    if (
      typeof item.name !== "string" ||
      typeof item.code !== "string" ||
      item.code.length > 10000 ||
      !/node:test/.test(item.code) ||
      !/node:assert\/strict/.test(item.code) ||
      !/\b(?:test|it)\s*\(/.test(item.code)
    ) {
      throw testConfigurationError("Each generated test must be a runnable Node.js test module using node:test and strict assertions.");
    }
  }

  const testDir = path.join(cwd, ".aultai-tests", randomUUID());
  await fs.mkdir(testDir, { recursive: true });
  const filenames = [];
  for (const [index, item] of tests.entries()) {
    const filename = `generated-${index + 1}.test.js`;
    await fs.writeFile(path.join(testDir, filename), item.code, { encoding: "utf8", flag: "wx" });
    filenames.push(filename);
  }

  const started = Date.now();
  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--test", "--test-reporter=tap", ...filenames.map((filename) => path.join(testDir, filename))],
      { cwd, windowsHide: true },
    );
    const runs = activeTestRuns.get(active) ?? new Set();
    const run = {
      child,
      closed: new Promise((resolveClose) => child.once("close", resolveClose)),
    };
    runs.add(run);
    activeTestRuns.set(active, runs);
    const removeRun = () => {
      runs.delete(run);
      if (runs.size === 0) activeTestRuns.delete(active);
    };
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      if (child.pid !== undefined) {
        treeKill(child.pid, (error) => {
          if (error && error.code !== "ESRCH") {
            console.error(`[tests] failed to stop generated test process: ${error.message}`);
          }
        });
      }
      removeRun();
      reject(testTimeout());
    }, TIMEOUT_MS);
    child.stdout.on("data", (chunk) => {
      stdout = `${stdout}${String(chunk)}`.slice(-OUTPUT_LIMIT);
    });
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${String(chunk)}`.slice(-OUTPUT_LIMIT);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      removeRun();
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      removeRun();
      const output = `${stdout}\n${stderr}`.trim();
      const testsResult = [];
      const testPattern = /^\s*(ok|not ok)\s+\d+\s+-\s+(.+)$/gm;
      for (const match of output.matchAll(testPattern)) {
        testsResult.push({
          name: match[2].trim(),
          status: match[1] === "ok" ? "passed" : "failed",
          duration_ms: 0,
          error: match[1] === "ok" ? null : output.slice(-2000),
        });
      }
      if (testsResult.length === 0) {
        testsResult.push({
          name: "Generated Node.js tests",
          status: code === 0 ? "passed" : "failed",
          duration_ms: Date.now() - started,
          error: code === 0 ? null : output.slice(-2000) || `node --test exited with code ${code}`,
        });
      }
      const failed = testsResult.filter((item) => item.status === "failed").length;
      resolve({
        total: testsResult.length,
        passed: testsResult.length - failed,
        failed,
        duration_ms: Date.now() - started,
        tests: testsResult,
      });
    });
  });
  lastTestRun = { project: active, result };
  return { ...result, generatedTestDirectory: path.relative(cwd, testDir).split(path.sep).join("/") };
}

async function ensureTestCommand(cwd) {
  let packageText;
  try {
    packageText = await fs.readFile(path.join(cwd, "package.json"), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw testConfigurationError(
        "No package.json was found in the active project, so AultAI cannot run its npm test command.",
      );
    }
    throw error;
  }

  let packageInfo;
  try {
    packageInfo = JSON.parse(packageText);
  } catch {
    throw testConfigurationError("The active project's package.json is not valid JSON.");
  }
  if (typeof packageInfo.scripts?.test !== "string" || packageInfo.scripts.test.trim() === "") {
    throw testConfigurationError(
      'The active project has no "scripts.test" command in package.json. Add a test script before running tests; generated AI suggestions are not added or executed automatically.',
    );
  }
}

function testConfigurationError(message) {
  const error = new Error(message);
  error.code = "TEST_COMMAND_NOT_CONFIGURED";
  return error;
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
