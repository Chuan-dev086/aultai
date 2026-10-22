import { spawn } from "node:child_process";
import { connect, createServer } from "node:net";
import { promises as fs } from "node:fs";
import nodeFs from "node:fs";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import unzipper from "unzipper";
import treeKill from "tree-kill";
import { WORKSPACE_DIR } from "../config.js";
import { getActiveSubdir, setActiveWorkspace } from "./sandbox.js";
import { stopTestsForProject } from "./testrunner.js";

/**
 * @typedef {import("../models.js").ProjectStatus} ProjectStatus
 */

export const DYNAMIC_PORT = Number(process.env.AULTAI_DYNAMIC_PORT ?? 3001);
const DYNAMIC_SUBDIR = "dynamic_project";
const TIMEOUT_MS = 300000;
const STOP_TIMEOUT_MS = 10000;
const MAX_ARCHIVE_ENTRIES = 10000;
const MAX_ARCHIVE_FILE_BYTES = 50 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 200 * 1024 * 1024;

/** @type {import("node:child_process").ChildProcess | null} */
let dynamicChild = null;
/** @type {number | null} */
let dynamicPort = null;
/** @type {number | null} */
let dynamicPreviewPort = null;
/** @type {Promise<{ port: number, previewPort: number, pid: number | undefined }> | null} */
let dynamicStarting = null;

/**
 * Extract the selected project from an uploaded ZIP directly into
 * packages/workspace/dynamic_project, avoiding directory moves on Windows.
 * @param {string} zipFilePath Absolute path of the uploaded zip on disk.
 * @returns {Promise<{ success: true, message: string, path: string }>} Result.
 * @throws {Error} When the zip is invalid or has no unambiguous project root.
 */
export async function uploadProject(zipFilePath) {
  const target = path.resolve(WORKSPACE_DIR, DYNAMIC_SUBDIR);
  let targetCleared = false;
  try {
    if (dynamicStarting !== null) {
      await dynamicStarting;
    }
    await stopTestsForProject(DYNAMIC_SUBDIR);
    if (dynamicChild !== null) {
      await stopProject();
    }
    await removeDirectoryWithRetry(target);
    targetCleared = true;
    await fs.mkdir(target, { recursive: true });
    const archive = await unzipper.Open.file(zipFilePath);
    await extractArchive(archive, target);
    await prepareEmbeddedLauncher(target);
  } catch (err) {
    let cleanupMessage = "";
    if (targetCleared) {
      try {
        await removeDirectoryWithRetry(target);
      } catch (cleanupErr) {
        cleanupMessage = ` Cleanup also failed: ${cleanupErr.message}`;
      }
    }
    if (err.code === "UPLOAD_FAILED" && cleanupMessage === "") {
      throw err;
    }
    throw uploadError(`Failed to upload zip: ${err.message}${cleanupMessage}`);
  }
  setActiveWorkspace(DYNAMIC_SUBDIR);
  return {
    success: true,
    message: "Project uploaded successfully.",
    path: DYNAMIC_SUBDIR,
  };
}

/**
 * Remove an uploaded-project directory, retrying transient Windows file locks.
 * @param {string} directory Absolute directory path.
 * @param {(directory: string) => Promise<void>} [remove] Removal operation, injectable for tests.
 * @returns {Promise<void>} Resolves when removed.
 * @throws {Error} When the directory stays locked after the bounded retries.
 */
export async function removeDirectoryWithRetry(
  directory,
  remove = (target) => fs.rm(target, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 }),
) {
  const transientCodes = new Set(["EBUSY", "EPERM", "ENOTEMPTY", "EACCES"]);
  const retries = 60;
  for (let attempt = 0; ; attempt += 1) {
    try {
      await remove(directory);
      return;
    } catch (err) {
      if (!transientCodes.has(err.code) || attempt >= retries) {
        if (transientCodes.has(err.code)) {
          throw uploadError(
            `Could not clear the uploaded project because Windows still has files or folders in use (${err.code}). AultAI stopped its managed project and test processes, but another process may still be using dynamic_project.`,
          );
        }
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

/**
 * Validate and extract an archive while enforcing path and expansion limits.
 * @param {import("unzipper").Open.Directory} archive Parsed ZIP archive.
 * @param {string} target Absolute extraction root.
 * @returns {Promise<void>} Resolves after every allowed entry is extracted.
 * @throws {Error} When an archive entry is unsafe or exceeds a limit.
 */
async function extractArchive(archive, target) {
  if (archive.files.length > MAX_ARCHIVE_ENTRIES) {
    throw uploadError(`ZIP contains more than ${MAX_ARCHIVE_ENTRIES} entries`);
  }
  let declaredTotalBytes = 0;
  const validatedEntries = archive.files.map((entry) => {
    const segments = archiveEntrySegments(entry.path);
    archiveEntryPath(target, segments.join("/"));
    if (entry.type !== "File" && entry.type !== "Directory") {
      throw uploadError(`Unsupported ZIP entry type: ${entry.type}`);
    }
    const size = entry.uncompressedSize;
    if (!Number.isSafeInteger(size) || size < 0) {
      throw uploadError(`Invalid uncompressed size for ZIP entry: ${entry.path}`);
    }
    if (entry.type === "File" && size > MAX_ARCHIVE_FILE_BYTES) {
      throw uploadError(`ZIP entry exceeds the ${MAX_ARCHIVE_FILE_BYTES} byte file limit`);
    }
    declaredTotalBytes += entry.type === "File" ? size : 0;
    if (declaredTotalBytes > MAX_ARCHIVE_BYTES) {
      throw uploadError(`ZIP expands beyond the ${MAX_ARCHIVE_BYTES} byte limit`);
    }
    return { entry, segments };
  });

  let projectPrefix = [];
  const rootPackageExists = validatedEntries.some(
    ({ entry, segments }) =>
      entry.type === "File" && segments.length === 1 && segments[0] === "package.json",
  );
  if (!rootPackageExists) {
    const packageRoots = validatedEntries
      .filter(
        ({ entry, segments }) =>
          entry.type === "File" && segments[segments.length - 1] === "package.json",
      )
      .map(({ segments }) => segments.slice(0, -1));
    const shallowestDepth = Math.min(...packageRoots.map((root) => root.length));
    const shallowestRoots = packageRoots.filter((root) => root.length === shallowestDepth);
    const uniqueRoots = new Map(shallowestRoots.map((root) => [root.join("/"), root]));
    if (uniqueRoots.size === 0) {
      throw uploadError("Uploaded project must contain a package.json at its root");
    }
    if (uniqueRoots.size > 1) {
      throw uploadError(
        "ZIP contains multiple project folders with package.json; upload the intended project folder",
      );
    }
    projectPrefix = [...uniqueRoots.values()][0];
  }

  let extractedBytes = 0;
  for (const { entry, segments } of validatedEntries) {
    if (
      segments.length < projectPrefix.length ||
      !projectPrefix.every((segment, index) => segments[index] === segment)
    ) {
      continue;
    }
    const relativeSegments = segments.slice(projectPrefix.length);
    if (relativeSegments.length === 0) {
      continue;
    }
    const destination = archiveEntryPath(target, relativeSegments.join("/"));
    if (entry.type === "Directory") {
      await fs.mkdir(destination, { recursive: true });
      continue;
    }
    await fs.mkdir(path.dirname(destination), { recursive: true });
    let entryBytes = 0;
    const limit = new Transform({
      transform(chunk, encoding, callback) {
        entryBytes += chunk.length;
        extractedBytes += chunk.length;
        if (entryBytes > MAX_ARCHIVE_FILE_BYTES || extractedBytes > MAX_ARCHIVE_BYTES) {
          callback(uploadError("ZIP expanded beyond the extraction limits"));
          return;
        }
        callback(null, chunk);
      },
    });
    await pipeline(
      entry.stream(),
      limit,
      nodeFs.createWriteStream(destination, { flags: "wx" }),
    );
  }
}

/**
 * Resolve a ZIP entry path and reject absolute or traversing paths.
 * @param {string} target Absolute extraction root.
 * @param {string} entryPath Untrusted path from the archive.
 * @returns {string} Resolved destination inside the extraction root.
 * @throws {Error} When the entry path is invalid or escapes the root.
 */
function archiveEntryPath(target, entryPath) {
  const segments = archiveEntrySegments(entryPath);
  const destination = path.resolve(target, ...segments);
  if (destination === target || !destination.startsWith(target + path.sep)) {
    throw uploadError(`ZIP entry escapes the extraction directory: ${entryPath}`);
  }
  return destination;
}

/**
 * Normalize and validate an untrusted ZIP entry path.
 * @param {string} entryPath Path stored in the ZIP.
 * @returns {string[]} Safe normalized path segments.
 */
function archiveEntrySegments(entryPath) {
  const normalized = entryPath.replace(/\\/g, "/");
  const segments = normalized.split("/").filter((segment) => segment.length > 0);
  if (
    normalized.length === 0 ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized) ||
    normalized.includes("\0") ||
    segments.length === 0 ||
    segments.some((segment) => segment === "." || segment === "..")
  ) {
    throw uploadError(`Unsafe ZIP entry path: ${entryPath}`);
  }
  return segments;
}

/**
 * Install the uploaded project without allowing an ancestor repository's
 * npm-workspaces configuration to redirect installation outside the project.
 * @returns {Promise<void>} Resolves when install exits 0.
 * @throws {Error} When npm install fails or times out.
 */
export function installDeps() {
  return new Promise((resolve, reject) => {
    const cwd = path.resolve(WORKSPACE_DIR, DYNAMIC_SUBDIR);
    const child = spawn("npm", ["install", "--workspaces=false", "--no-audit", "--no-fund"], {
      cwd,
      shell: process.platform === "win32",
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(installError("npm install timed out"));
    }, TIMEOUT_MS);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(installError(err.message));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        const output = `${stderr}\n${stdout}`.trim();
        reject(installError(`npm install exited ${code}: ${output.slice(-2000)}`));
      }
    });
  });
}

/**
 * Start the dynamic project in the background (`npm start`, PORT=3001).
 * Only the fixed `npm start` script is ever executed — never arbitrary input.
 * @returns {Promise<{ port: number, previewPort: number, pid: number | undefined }>} Backend and preview ports.
 * @throws {Error} When the project was never uploaded or fails to bind.
 */
export async function startProject() {
  if (dynamicStarting !== null) {
    return dynamicStarting;
  }
  if (dynamicChild !== null) {
    return {
      port: dynamicPort ?? DYNAMIC_PORT,
      previewPort: dynamicPreviewPort ?? dynamicPort ?? DYNAMIC_PORT,
      pid: dynamicChild.pid,
    };
  }
  const startAttempt = startDynamicProject();
  dynamicStarting = startAttempt;
  try {
    return await startAttempt;
  } finally {
    if (dynamicStarting === startAttempt) {
      dynamicStarting = null;
    }
  }
}

/**
 * Spawn the uploaded project and wait until it accepts connections.
 * @returns {Promise<{ port: number, previewPort: number, pid: number | undefined }>} Backend and preview ports.
 * @throws {Error} When no project exists or it fails to bind.
 */
async function startDynamicProject() {
  const cwd = path.resolve(WORKSPACE_DIR, DYNAMIC_SUBDIR);
  try {
    await fs.stat(path.join(cwd, "package.json"));
  } catch {
    throw uploadError("No dynamic project uploaded yet");
  }
  try {
    const modules = await fs.stat(path.join(cwd, "node_modules"));
    if (!modules.isDirectory()) {
      await installDeps();
    }
  } catch (err) {
    if (err.code !== "ENOENT") {
      throw err;
    }
    await installDeps();
  }
  const embeddedLauncher = await hasEmbeddedAultAiLauncher(cwd);
  const previewPort = embeddedLauncher ? await findAvailablePort(5173, 100) : null;
  await ensurePortAvailable(DYNAMIC_PORT);
  const child = spawn("npm", ["start"], {
    cwd,
    shell: process.platform === "win32",
    windowsHide: true,
    env: {
      ...process.env,
      PORT: String(DYNAMIC_PORT),
      ...(embeddedLauncher
        ? {
            AULTAI_NO_OPEN: "1",
            AULTAI_PREVIEW_PORT: String(previewPort),
          }
        : {}),
    },
  });
  let startupOutput = "";
  const appendStartupOutput = (chunk) => {
    startupOutput = `${startupOutput}${String(chunk)}`.slice(-6000);
  };
  child.stdout.on("data", appendStartupOutput);
  child.stderr.on("data", appendStartupOutput);
  dynamicChild = child;
  dynamicPort = DYNAMIC_PORT;
  dynamicPreviewPort = previewPort ?? DYNAMIC_PORT;
  child.on("error", () => {
    dynamicChild = null;
    dynamicPort = null;
    dynamicPreviewPort = null;
  });
  child.on("exit", () => {
    if (dynamicChild === child) {
      dynamicChild = null;
      dynamicPort = null;
      dynamicPreviewPort = null;
    }
  });
  try {
    await waitForPort(DYNAMIC_PORT, 30000, child);
    if (previewPort !== null) {
      await waitForPort(previewPort, 30000, child);
    }
  } catch (err) {
    try {
      await stopProject();
    } catch (stopErr) {
      throw uploadError(`${err.message}; failed to stop the project after startup failure: ${stopErr.message}`);
    }
    const exitDetails = child.exitCode !== null
      ? ` (exit code ${child.exitCode}${child.signalCode === null ? "" : `, signal ${child.signalCode}`})`
      : "";
    const output = startupOutput.trim();
    throw uploadError(
      `${err.message}${exitDetails}${output.length === 0 ? "" : `\nProject startup output:\n${output}`}`,
    );
  }
  return {
    port: DYNAMIC_PORT,
    previewPort: previewPort ?? DYNAMIC_PORT,
    pid: child.pid,
  };
}

/**
 * Stop the dynamic background project via tree-kill (kills the process tree).
 * @returns {Promise<{ stopped: boolean }>} Whether a process was stopped.
 */
export async function stopProject() {
  const child = dynamicChild;
  if (child === null || child.pid === undefined) {
    return { stopped: false };
  }
  if (child.exitCode !== null || child.signalCode !== null) {
    if (dynamicChild === child) {
      dynamicChild = null;
      dynamicPort = null;
      dynamicPreviewPort = null;
    }
    return { stopped: false };
  }
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
  if (child.exitCode === null && child.signalCode === null) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(uploadError("Dynamic project did not exit after the stop request"));
      }, STOP_TIMEOUT_MS);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  if (dynamicChild === child) {
    dynamicChild = null;
    dynamicPort = null;
    dynamicPreviewPort = null;
  }
  return { stopped: true };
}

/**
 * Switch the active workspace back to the bundled shop-api.
 * @returns {{ active: string }} The active workspace subdir.
 */
export function switchToShopApi() {
  setActiveWorkspace("shop-api");
  return { active: "shop-api" };
}

/**
 * Describe the current project-manager state.
 * @returns {ProjectStatus} Active workspace, port, and running flag.
 */
export function projectStatus() {
  const active = getActiveSubdir();
  const running = dynamicChild !== null;
  return {
    active,
    port: running ? (dynamicPort ?? DYNAMIC_PORT) : active === "shop-api" ? 3000 : null,
    previewPort: running ? (dynamicPreviewPort ?? dynamicPort ?? DYNAMIC_PORT) : null,
    running,
  };
}

/**
 * Detect the uploaded AultAI launcher, which starts a backend and Vite frontend.
 * @param {string} cwd Uploaded project root.
 * @returns {Promise<boolean>} Whether the embedded launcher is available.
 */
async function hasEmbeddedAultAiLauncher(cwd) {
  try {
    const [launcher, frontend] = await Promise.all([
      fs.stat(path.join(cwd, "scripts", "start.js")),
      fs.stat(path.join(cwd, "packages", "frontend", "package.json")),
    ]);
    return launcher.isFile() && frontend.isFile();
  } catch (err) {
    if (err.code === "ENOENT") {
      return false;
    }
    throw err;
  }
}

/**
 * Configure the known AultAI launcher to support serving its frontend in the
 * Preview iframe without opening a separate browser tab.
 * @param {string} cwd Uploaded project root.
 * @returns {Promise<void>} Resolves when no adaptation is needed or complete.
 */
async function prepareEmbeddedLauncher(cwd) {
  if (!(await hasEmbeddedAultAiLauncher(cwd))) {
    return;
  }
  const launcherPath = path.join(cwd, "scripts", "start.js");
  const source = await fs.readFile(launcherPath, "utf8");
  if (source.includes("AULTAI_NO_OPEN") && source.includes("AULTAI_PREVIEW_PORT")) {
    return;
  }
  const original = 'run("frontend", [viteBin, "--port", "5173", "--open"], {';
  if (!source.includes(original)) {
    throw uploadError("The uploaded AultAI launcher is not compatible with embedded Preview mode");
  }
  const adapted = source.replace(
    original,
    [
      'const previewPort = process.env.AULTAI_PREVIEW_PORT ?? "5173";',
      'const viteArgs = ["--host", "127.0.0.1", "--port", previewPort, "--strictPort"];',
      'if (process.env.AULTAI_NO_OPEN !== "1") {',
      '  viteArgs.push("--open");',
      "}",
      'run("frontend", [viteBin, ...viteArgs], {',
    ].join("\n"),
  );
  await fs.writeFile(launcherPath, adapted, "utf8");
}

/**
 * Find a free TCP port within a bounded range.
 * @param {number} start First port to check.
 * @param {number} attempts Number of consecutive ports to check.
 * @returns {Promise<number>} First available port.
 */
async function findAvailablePort(start, attempts) {
  for (let port = start; port < start + attempts; port += 1) {
    try {
      await ensurePortAvailable(port);
      return port;
    } catch (err) {
      if (err.code !== "UPLOAD_FAILED" || !err.message.includes("already in use")) {
        throw err;
      }
    }
  }
  throw uploadError(`No free preview port found between ${start} and ${start + attempts - 1}`);
}

/**
 * Poll until a TCP port accepts connections or the timeout elapses.
 * @param {number} port Port to probe.
 * @param {number} timeoutMs Max wait.
 * @param {import("node:child_process").ChildProcess} child Started project process.
 * @returns {Promise<void>}
 * @throws {Error} On timeout.
 */
async function waitForPort(port, timeoutMs, child) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) {
      throw uploadError(`Dynamic project exited before binding port ${port}`);
    }
    const open = await new Promise((resolve) => {
      const socket = connect(port, "127.0.0.1");
      socket.on("connect", () => {
        socket.end();
        resolve(true);
      });
      socket.on("error", () => resolve(false));
    });
    if (open) {
      return;
    }
    if (Date.now() > deadline) {
      throw uploadError(`Dynamic project did not bind port ${port} in time`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

/**
 * Ensure the dynamic project port is free before starting the child process.
 * @param {number} port Port to reserve-check.
 * @returns {Promise<void>} Resolves when the port can be bound.
 * @throws {Error} When the port is already in use or cannot be checked.
 */
async function ensurePortAvailable(port) {
  for (const host of ["127.0.0.1", "::1"]) {
    await new Promise((resolve, reject) => {
      const server = createServer();
      server.once("error", (err) => {
        if (err.code === "EADDRINUSE") {
          reject(uploadError(`Port ${port} is already in use`));
        } else {
          reject(err);
        }
      });
      server.listen(port, host, () => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    });
  }
}

/**
 * Build an upload-phase error.
 * @param {string} message
 * @returns {Error} Error with code "UPLOAD_FAILED".
 */
function uploadError(message) {
  const err = new Error(message);
  err.code = "UPLOAD_FAILED";
  return err;
}

/**
 * Build an install-phase error.
 * @param {string} message
 * @returns {Error} Error with code "INSTALL_FAILED".
 */
function installError(message) {
  const err = new Error(message);
  err.code = "INSTALL_FAILED";
  return err;
}
