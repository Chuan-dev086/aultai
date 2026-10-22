import { promises as fs } from "node:fs";
import path from "node:path";
import { WORKSPACE_DIR } from "../config.js";

/**
 * Workspaces visible to AultAI, as subdirectories of WORKSPACE_DIR.
 */
export const KNOWN_WORKSPACES = ["shop-api", "dynamic_project"];

const ACTIVE = { subdir: "shop-api" };

/**
 * Return the absolute path of the currently active workspace directory.
 * Defaults to packages/workspace/shop-api; switchable to dynamic_project.
 * @returns {string} Absolute workspace path.
 */
export function getActiveWorkspace() {
  return path.resolve(WORKSPACE_DIR, ACTIVE.subdir);
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
  const candidate = path.resolve(root, rel);
  if (candidate !== root && !candidate.startsWith(root + path.sep)) {
    throw pathTraversal(`Path escapes workspace: ${rel}`);
  }
  let real = candidate;
  try {
    real = await fs.realpath(candidate);
  } catch (err) {
    if (err.code !== "ENOENT") {
      throw err;
    }
  }
  const realRoot = await fs.realpath(root);
  if (real !== realRoot && !real.startsWith(realRoot + path.sep)) {
    throw pathTraversal(`Symlink escapes workspace: ${rel}`);
  }
  return candidate;
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
  const root = path.resolve(WORKSPACE_DIR);
  return out.map((f) => path.relative(root, f).split(path.sep).join("/"));
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
