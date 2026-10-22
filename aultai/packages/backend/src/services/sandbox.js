import { promises as fs } from "node:fs";
import nodeFs from "node:fs";
import path from "node:path";
import { WORKSPACE_DIR } from "../config.js";

/**
 * Workspaces visible to AultAI, as subdirectories of WORKSPACE_DIR.
 */
export const KNOWN_WORKSPACES = ["shop-api", "dynamic_project"];

const ACTIVE = { subdir: "shop-api" };
const ACTIVE_PROJECT_FILE = path.resolve(WORKSPACE_DIR, ".aultai-active-project");
let dynamicWorkspaceSubdir = loadDynamicWorkspaceSubdir();

/**
 * Return the absolute path of the currently active workspace directory.
 * Defaults to packages/workspace/shop-api; switchable to dynamic_project.
 * @returns {string} Absolute workspace path.
 */
export function getActiveWorkspace() {
  return getWorkspacePath(ACTIVE.subdir);
}

/**
 * Return the physical directory for a logical workspace.
 * @param {string} subdir Workspace name.
 * @returns {string} Absolute workspace path.
 */
export function getWorkspacePath(subdir) {
  if (subdir === "dynamic_project") {
    return path.resolve(WORKSPACE_DIR, dynamicWorkspaceSubdir);
  }
  return path.resolve(WORKSPACE_DIR, subdir);
}

/**
 * Make a completed uploaded-project directory the active dynamic workspace.
 * @param {string} subdir WORKSPACE_DIR-relative path inside .dynamic-projects.
 * @returns {Promise<void>}
 */
export async function setDynamicWorkspace(subdir) {
  const normalized = path.posix.normalize(subdir.replace(/\\/g, "/"));
  if (!/^\.dynamic-projects\/[0-9a-f-]+$/.test(normalized)) {
    throw pathTraversal("Invalid uploaded project directory");
  }
  const candidate = path.resolve(WORKSPACE_DIR, ...normalized.split("/"));
  const relative = path.relative(path.resolve(WORKSPACE_DIR), candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw pathTraversal("Uploaded project directory is outside the workspace");
  }
  await fs.stat(candidate);
  await fs.writeFile(ACTIVE_PROJECT_FILE, normalized, "utf8");
  dynamicWorkspaceSubdir = normalized;
}

/**
 * Return the physical uploaded-project directory selected for dynamic_project.
 * @returns {string} Workspace-relative upload directory.
 */
export function getDynamicWorkspaceSubdir() {
  return dynamicWorkspaceSubdir;
}

/**
 * Clear the selected upload and restore the legacy dynamic_project directory.
 * @returns {Promise<void>}
 */
export async function resetDynamicWorkspace() {
  try {
    await fs.unlink(ACTIVE_PROJECT_FILE);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  dynamicWorkspaceSubdir = "dynamic_project";
}

/**
 * Return the active workspace as a WORKSPACE_DIR-relative subdir name.
 * @returns {string} e.g. "shop-api" or "dynamic_project".
 */
export function getActiveSubdir() {
  return ACTIVE.subdir;
}

/**
 * Switch the active workspace (whitelisted names only — no arbitrary paths).
 * @param {string} name Workspace subdir name.
 * @returns {string} The new absolute workspace path.
 * @throws {Error} With code "UNKNOWN_WORKSPACE" for unlisted names.
 */
export function setActiveWorkspace(name) {
  if (!KNOWN_WORKSPACES.includes(name)) {
    const err = new Error(`Unknown workspace: ${name}`);
    err.code = "UNKNOWN_WORKSPACE";
    throw err;
  }
  ACTIVE.subdir = name;
  return getActiveWorkspace();
}

/**
 * Resolve a workspace-relative path to an absolute path inside WORKSPACE_DIR.
 * Rejects traversal (`..`), absolute paths outside WORKSPACE_DIR, and
 * symlinks that escape the workspace.
 * @param {string} rel Workspace-relative path (e.g. "shop-api/src/checkout.js").
 * @returns {Promise<string>} The resolved absolute path.
 * @throws {Error} With code "E_PATH_TRAVERSAL" when the path escapes WORKSPACE_DIR.
 */
export async function safePath(rel) {
  if (typeof rel !== "string" || rel.length === 0) {
    throw pathTraversal(`Invalid workspace path: ${JSON.stringify(rel)}`);
  }
  const root = path.resolve(WORKSPACE_DIR);
  const logicalCandidate = path.resolve(root, rel);
  if (logicalCandidate !== root && !logicalCandidate.startsWith(root + path.sep)) {
    throw pathTraversal(`Path escapes workspace: ${rel}`);
  }
  const logicalRelative = path.relative(root, logicalCandidate);
  const segments = logicalRelative.split(path.sep);
  const candidate = segments[0] === "dynamic_project"
    ? path.resolve(getWorkspacePath("dynamic_project"), ...segments.slice(1))
    : logicalCandidate;
  const real = await resolveRealPath(candidate);
  const realRoot = await fs.realpath(root);
  const realRelative = path.relative(realRoot, real);
  if (realRelative.startsWith("..") || path.isAbsolute(realRelative)) {
    throw pathTraversal(`Symlink escapes workspace: ${rel}`);
  }
  return candidate;
}

async function resolveRealPath(candidate) {
  let current = candidate;
  const missingSegments = [];
  for (;;) {
    try {
      return path.resolve(await fs.realpath(current), ...missingSegments);
    } catch (err) {
      if (err.code !== "ENOENT") {
        throw err;
      }
      const parent = path.dirname(current);
      if (parent === current) {
        throw err;
      }
      missingSegments.unshift(path.basename(current));
      current = parent;
    }
  }
}

/**
 * Read a UTF-8 text file inside the workspace.
 * @param {string} rel Workspace-relative path.
 * @returns {Promise<string>} File contents.
 */
export async function readFile(rel) {
  const abs = await safePath(rel);
  return fs.readFile(abs, "utf8");
}

/**
 * Write a UTF-8 text file inside the workspace (creates parent dirs).
 * @param {string} rel Workspace-relative path.
 * @param {string} content File contents.
 * @returns {Promise<void>}
 */
export async function writeFile(rel, content) {
  const abs = await safePath(rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf8");
}

/**
 * List all .js/.jsx files under a workspace-relative directory, recursively,
 * skipping node_modules (and any hidden directory).
 * @param {string} rel Workspace-relative directory (e.g. "shop-api" or ".").
 * @returns {Promise<string[]>} Workspace-relative file paths, sorted.
 */
export async function listJsFiles(rel) {
  const abs = await safePath(rel);
  const out = [];
  await walk(abs, abs, out);
  out.sort();
  const logicalRoot = rel === "." ? "" : rel.replace(/[\\/]+$/, "");
  return out.map((file) => {
    const relative = path.relative(abs, file).split(path.sep).join("/");
    if (logicalRoot === "dynamic_project" || logicalRoot.startsWith("dynamic_project/")) {
      return `${logicalRoot}/${relative}`;
    }
    return path.relative(path.resolve(WORKSPACE_DIR), file).split(path.sep).join("/");
  });
}

function loadDynamicWorkspaceSubdir() {
  try {
    const subdir = nodeFs.readFileSync(ACTIVE_PROJECT_FILE, "utf8").trim();
    if (/^\.dynamic-projects\/[0-9a-f-]+$/.test(subdir)) {
      return subdir;
    }
  } catch (err) {
    if (err.code !== "ENOENT") {
      throw err;
    }
  }
  return "dynamic_project";
}

/**
 * Recursively collect .js/.jsx files, skipping node_modules and dot-dirs.
 * @param {string} dir Absolute directory being walked.
 * @param {string} base Absolute walk root (unused, kept for clarity of logs).
 * @param {string[]} out Accumulator of absolute file paths.
 * @returns {Promise<void>}
 */
async function walk(dir, base, out) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, base, out);
    } else if (entry.isFile() && (full.endsWith(".js") || full.endsWith(".jsx"))) {
      out.push(full);
    }
  }
}

/**
 * Build an E_PATH_TRAVERSAL error.
 * @param {string} message
 * @returns {Error} Error with `code` set to "E_PATH_TRAVERSAL".
 */
function pathTraversal(message) {
  const err = new Error(message);
  err.code = "E_PATH_TRAVERSAL";
  return err;
}
