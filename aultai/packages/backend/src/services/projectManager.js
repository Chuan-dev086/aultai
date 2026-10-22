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
import { setActiveWorkspace } from "./sandbox.js";

/**
 * @typedef {import("../models.js").ProjectStatus} ProjectStatus
 */

export const DYNAMIC_PORT = 3001;
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
/** @type {Promise<{ port: number, pid: number | undefined }> | null} */
let dynamicStarting = null;

/**
 * Extract an uploaded zip into packages/workspace/dynamic_project (cleared
 * first). Throws when no package.json exists at the archive root.
 * @param {string} zipFilePath Absolute path of the uploaded zip on disk.
 * @returns {Promise<{ success: true, message: string, path: string }>} Result.
 * @throws {Error} When the zip is invalid or lacks package.json.
 */
export async function uploadProject(zipFilePath) {
  const target = path.resolve(WORKSPACE_DIR, DYNAMIC_SUBDIR);
  await fs.rm(target, { recursive: true, force: true });
  await fs.mkdir(target, { recursive: true });
  try {
    const archive = await unzipper.Open.file(zipFilePath);
    await extractArchive(archive, target);
    if (!(await hasPackageJson(target))) {
      await flattenSingleSubdir(target);
    }
    if (!(await hasPackageJson(target))) {
      throw uploadError("Uploaded project must contain a package.json at its root");
    }
  } catch (err) {
    await fs.rm(target, { recursive: true, force: true });
    if (err.code === "UPLOAD_FAILED") {
      throw err;
    }
    throw uploadError(`Failed to extract zip: ${err.message}`);
  }
  setActiveWorkspace(DYNAMIC_SUBDIR);
  return {
    success: true,
    message: "Project uploaded successfully.",
    path: DYNAMIC_SUBDIR,
  };
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
    const destination = archiveEntryPath(target, entry.path);
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
    return { entry, destination };
  });

  let extractedBytes = 0;
  for (const { entry, destination } of validatedEntries) {
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
  const destination = path.resolve(target, ...segments);
  if (destination === target || !destination.startsWith(target + path.sep)) {
    throw uploadError(`ZIP entry escapes the extraction directory: ${entryPath}`);
  }
  return destination;
}

/**
 * Run `npm install` inside the dynamic project directory.
 * @returns {Promise<void>} Resolves when install exits 0.
 * @throws {Error} When npm install fails or times out.
 */
export function installDeps() {
  return new Promise((resolve, reject) => {
    const cwd = path.resolve(WORKSPACE_DIR, DYNAMIC_SUBDIR);
    const child = spawn("npm", ["install", "--no-audit", "--no-fund"], {
      cwd,
      shell: process.platform === "win32",
      windowsHide: true,
    });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(installError("npm install timed out"));
    }, TIMEOUT_MS);
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
        reject(installError(`npm install exited ${code}: ${stderr.slice(0, 500)}`));
      }
    });
  });
}

/**
 * Start the dynamic project in the background (`npm start`, PORT=3001).
 * Only the fixed `npm start` script is ever executed — never arbitrary input.
 * @returns {Promise<{ port: number, pid: number | undefined }>} Port and pid.
 * @throws {Error} When the project was never uploaded or fails to bind.
 */
export async function startProject() {
  if (dynamicStarting !== null) {
    return dynamicStarting;
  }
  if (dynamicChild !== null) {
    return { port: dynamicPort ?? DYNAMIC_PORT, pid: dynamicChild.pid };
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
 * @returns {Promise<{ port: number, pid: number | undefined }>} Port and pid.
 * @throws {Error} When no project exists or it fails to bind.
 */
async function startDynamicProject() {
  const cwd = path.resolve(WORKSPACE_DIR, DYNAMIC_SUBDIR);
  try {
    await fs.stat(path.join(cwd, "package.json"));
  } catch {
    throw uploadError("No dynamic project uploaded yet");
  }
  await ensurePortAvailable(DYNAMIC_PORT);
  const child = spawn("npm", ["start"], {
    cwd,
    shell: process.platform === "win32",
    windowsHide: true,
    env: { ...process.env, PORT: String(DYNAMIC_PORT) },
  });
  dynamicChild = child;
  dynamicPort = DYNAMIC_PORT;
  child.on("error", () => {
    dynamicChild = null;
    dynamicPort = null;
  });
  child.on("exit", () => {
    if (dynamicChild === child) {
      dynamicChild = null;
      dynamicPort = null;
    }
  });
  try {
    await waitForPort(DYNAMIC_PORT, 30000, child);
  } catch (err) {
    try {
      await stopProject();
    } catch (stopErr) {
      throw uploadError(`${err.message}; failed to stop the project after startup failure: ${stopErr.message}`);
    }
    throw err;
  }
  return { port: DYNAMIC_PORT, pid: child.pid };
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
  return {
    active: dynamicChild !== null ? DYNAMIC_SUBDIR : "shop-api",
    port: dynamicChild !== null ? (dynamicPort ?? DYNAMIC_PORT) : 3000,
    running: dynamicChild !== null,
  };
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
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", (err) => {
      if (err.code === "EADDRINUSE") {
        reject(uploadError(`Port ${port} is already in use`));
      } else {
        reject(err);
      }
    });
    server.listen(port, "127.0.0.1", () => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });
}

/**
 * Check whether a directory contains a package.json file.
 * @param {string} dir Absolute path of the directory to check.
 * @returns {Promise<boolean>} True when package.json exists and is a file.
 */
async function hasPackageJson(dir) {
  try {
    const stat = await fs.stat(path.join(dir, "package.json"));
    return stat.isFile();
  } catch {
    return false;
  }
}

/**
 * Flatten a zip that contains a single top-level folder (e.g. zipping
 * `my-app/` instead of its contents). Moves all files from that
 * subdirectory up to the target root and removes the empty subdirectory.
 * No-op unless the target holds exactly one directory containing a
 * package.json.
 * @param {string} target Absolute path of the extraction root.
 * @returns {Promise<void>} Resolves after flattening or no-op.
 */
async function flattenSingleSubdir(target) {
  let entries;
  try {
    entries = await fs.readdir(target, { withFileTypes: true });
  } catch {
    return;
  }
  const dirs = entries.filter((entry) => entry.isDirectory());
  if (dirs.length !== 1) {
    return;
  }
  const sub = path.join(target, dirs[0].name);
  if (!(await hasPackageJson(sub))) {
    return;
  }
  const children = await fs.readdir(sub);
  for (const child of children) {
    await fs.rename(path.join(sub, child), path.join(target, child));
  }
  await fs.rm(sub, { recursive: true, force: true });
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
