import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import nodeFs from "node:fs";
import path from "node:path";
import unzipper from "unzipper";
import treeKill from "tree-kill";
import { WORKSPACE_DIR } from "../config.js";
import { getActiveSubdir, setActiveWorkspace } from "./sandbox.js";

/**
 * @typedef {import("../models.js").ProjectStatus} ProjectStatus
 */

export const DYNAMIC_PORT = 3001;
const DYNAMIC_SUBDIR = "dynamic_project";
const TIMEOUT_MS = 300000;

/** @type {import("node:child_process").ChildProcess | null} */
let dynamicChild = null;
/** @type {number | null} */
let dynamicPort = null;

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
    await nodeFs
      .createReadStream(zipFilePath)
      .pipe(unzipper.Extract({ path: target }))
      .promise();
  } catch (err) {
    throw uploadError(`Failed to extract zip: ${err.message}`);
  }
  try {
    const stat = await fs.stat(path.join(target, "package.json"));
    if (!stat.isFile()) {
      throw new Error("not a file");
    }
  } catch {
    throw uploadError("Uploaded project must contain a package.json at its root");
  }
  setActiveWorkspace(DYNAMIC_SUBDIR);
  return {
    success: true,
    message: "Project uploaded. Run install, then start.",
    path: DYNAMIC_SUBDIR,
  };
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
  if (dynamicChild !== null) {
    return { port: dynamicPort ?? DYNAMIC_PORT, pid: dynamicChild.pid };
  }
  const cwd = path.resolve(WORKSPACE_DIR, DYNAMIC_SUBDIR);
  try {
    await fs.stat(path.join(cwd, "package.json"));
  } catch {
    throw uploadError("No dynamic project uploaded yet");
  }
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
  await waitForPort(DYNAMIC_PORT, 30000);
  return { port: DYNAMIC_PORT, pid: child.pid };
}

/**
 * Stop the dynamic background project via tree-kill (kills the process tree).
 * @returns {{ stopped: boolean }} Whether a process was stopped.
 */
export function stopProject() {
  if (dynamicChild === null || dynamicChild.pid === undefined) {
    dynamicChild = null;
    dynamicPort = null;
    return { stopped: false };
  }
  const pid = dynamicChild.pid;
  dynamicChild = null;
  dynamicPort = null;
  treeKill(pid);
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
    active: getActiveSubdir(),
    port: dynamicChild !== null ? (dynamicPort ?? DYNAMIC_PORT) : 3000,
    running: dynamicChild !== null,
  };
}

/**
 * Poll until a TCP port accepts connections or the timeout elapses.
 * @param {number} port Port to probe.
 * @param {number} timeoutMs Max wait.
 * @returns {Promise<void>}
 * @throws {Error} On timeout.
 */
async function waitForPort(port, timeoutMs) {
  const net = await import("node:net");
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const open = await new Promise((resolve) => {
      const socket = net.connect(port, "127.0.0.1");
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
