import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";
import treeKill from "tree-kill";
import { WORKSPACE_DIR } from "../config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = path.resolve(here, "..", "workers", "shop-api-worker.js");

export const SHOP_API_PORT = Number(process.env.SHOP_API_PORT ?? 3002);

/** @type {import("node:child_process").ChildProcess | null} */
let child = null;

/**
 * Spawn the shop-api worker process. Idempotent when already running.
 * @returns {Promise<void>} Resolves after the worker binds the port.
 */
export async function startShopApi() {
  if (child !== null) {
    return;
  }
  const proc = spawn(process.execPath, [WORKER_PATH], {
    env: { ...process.env, SHOP_API_PORT: String(SHOP_API_PORT) },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child = proc;
  proc.stdout.on("data", (d) => process.stdout.write(`[shop-api] ${d}`));
  proc.stderr.on("data", (d) => process.stderr.write(`[shop-api] ${d}`));
  proc.on("exit", (code) => {
    if (child === proc) {
      // eslint-disable-next-line no-console
      console.error(`[shop-api] worker exited with code ${code}`);
      child = null;
    }
  });
  await waitForPort(SHOP_API_PORT, 15000);
}

/**
 * Kill the shop-api worker process tree if running.
 * @returns {Promise<void>}
 */
export async function stopShopApi() {
  const proc = child;
  child = null;
  if (proc === null || proc.pid === undefined) {
    return;
  }
  await new Promise((resolve) =>
    treeKill(proc.pid, "SIGTERM", () => resolve(undefined)),
  );
}

/**
 * Stop then start the worker, so a fresh process re-imports shop-api from disk.
 * @returns {Promise<void>}
 */
export async function restartShopApi() {
  await stopShopApi();
  await startShopApi();
}

/**
 * Kill the worker synchronously; used from process exit handlers.
 */
export function forceStopShopApi() {
  if (child !== null && child.pid !== undefined) {
    try {
      treeKill(child.pid);
    } catch {
      // Ignore: best-effort cleanup on exit.
    }
    child = null;
  }
}

/**
 * Poll shop-api's src directory and restart the worker when a file's content
 * changes. Content fingerprint is used instead of mtime because Windows'
 * fs.stat mtimeMs does not always refresh for in-place appends.
 * Debounced 300ms so Apply Fix's .bak + write coalesce into one restart.
 * @returns {{ stop: () => void }} Handle to stop polling.
 */
export function watchShopApiSource() {
  const watchDir = path.resolve(WORKSPACE_DIR, "shop-api", "src");
  // eslint-disable-next-line no-console
  console.log(
    `[shop-api] polling ${watchDir} (every 500ms, content fingerprint)`,
  );

  const snapshot = new Map();
  let restarting = false;
  let pending = null;
  let stopped = false;

  const collect = async (dir) => {
    const out = [];
    const stack = [dir];
    while (stack.length > 0) {
      const cur = stack.pop();
      const entries = await fs.readdir(cur, { withFileTypes: true });
      for (const e of entries) {
        if (e.name === "node_modules" || e.name.startsWith(".")) {
          continue;
        }
        const full = path.join(cur, e.name);
        if (e.isDirectory()) {
          stack.push(full);
        } else if (
          e.isFile() &&
          (full.endsWith(".js") || full.endsWith(".jsx"))
        ) {
          out.push(full);
        }
      }
    }
    return out;
  };

  const fingerprint = async (f) => {
    const buf = await fs.readFile(f);
    return `${buf.length}:${buf.slice(-200).toString("base64")}`;
  };

  const tick = async () => {
    if (stopped || restarting) {
      return;
    }
    try {
      const files = await collect(watchDir);
      for (const f of files) {
        const fp = await fingerprint(f);
        const prev = snapshot.get(f);
        if (prev !== undefined && prev !== fp) {
          // eslint-disable-next-line no-console
          console.log(
            `[shop-api] ${path.relative(watchDir, f)} content changed`,
          );
          if (pending !== null) {
            clearTimeout(pending);
          }
          pending = setTimeout(() => {
            pending = null;
            doRestart();
          }, 300);
        }
        snapshot.set(f, fp);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[shop-api] poll error: ${err.message}`);
    }
  };

  const doRestart = async () => {
    if (restarting || stopped) {
      return;
    }
    restarting = true;
    try {
      // eslint-disable-next-line no-console
      console.log("[shop-api] source changed, restarting worker");
      await restartShopApi();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[shop-api] restart failed: ${err.message}`);
    } finally {
      restarting = false;
      try {
        const files = await collect(watchDir);
        for (const f of files) {
          snapshot.set(f, await fingerprint(f));
        }
      } catch {
        // ignore re-snapshot failure
      }
    }
  };

  (async () => {
    try {
      const files = await collect(watchDir);
      for (const f of files) {
        snapshot.set(f, await fingerprint(f));
      }
      // eslint-disable-next-line no-console
      console.log(`[shop-api] snapshot taken: ${snapshot.size} files`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[shop-api] initial snapshot failed: ${err.message}`);
    }
    const interval = setInterval(tick, 500);
    interval.unref?.();
  })();

  return {
    stop: () => {
      stopped = true;
      if (pending !== null) {
        clearTimeout(pending);
      }
    },
  };
}

/**
 * Poll until the TCP port accepts a connection.
 * @param {number} port Port to probe.
 * @param {number} timeoutMs Max wait.
 * @returns {Promise<void>}
 * @throws {Error} On timeout.
 */
async function waitForPort(port, timeoutMs) {
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
      throw new Error(
        `shop-api worker did not bind port ${port} within ${timeoutMs}ms`,
      );
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}
