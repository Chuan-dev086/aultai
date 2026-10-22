import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { SHOP_API_DIR } from "../config.js";

/**
 * The demo shop-api runs in its own child process (never in the AultAI
 * process). The backend proxies /shop-api and /preview to it, and restarts it
 * after a fix is applied or reverted so the live preview uses the new code.
 */

const START_TIMEOUT_MS = 15000;

/** Port the shop-api child listens on (chosen when it starts). */
let shopApiPort = process.env.SHOP_API_PORT === undefined ? null : Number(process.env.SHOP_API_PORT);

/**
 * Current shop-api port (null before the first start).
 * @returns {number | null} The port.
 */
export function getShopApiPort() {
  return shopApiPort;
}

/** @type {import("node:child_process").ChildProcess | null} */
let child = null;
/** @type {Promise<void> | null} */
let ready = null;

/**
 * Start the shop-api child process if it is not already running.
 * @returns {Promise<void>} Resolves once the shop-api accepts connections.
 */
export function startShopApi() {
  if (ready !== null) {
    return ready; // already running or starting
  }
  ready = launch();
  return ready;
}

/**
 * Pick a port, spawn the shop-api, and wait for it to accept connections.
 * @returns {Promise<void>}
 */
async function launch() {
  // Let the OS choose a free port (avoids ports Windows reserves, like 5000).
  if (process.env.SHOP_API_PORT === undefined) {
    shopApiPort = await freePort();
  }
  const SHOP_API_PORT = shopApiPort;
  // Import the shop-api app and listen on PORT. This avoids api.js's
  // "run directly?" check, which can fail on OneDrive / symlinked folders.
  const apiUrl = pathToFileURL(path.join(SHOP_API_DIR, "src", "api.js")).href;
  const loader =
    `const m = await import(${JSON.stringify(apiUrl)});` +
    "m.app.listen(Number(process.env.PORT));";
  const proc = spawn(process.execPath, ["--input-type=module", "-e", loader], {
    cwd: SHOP_API_DIR,
    env: { ...process.env, PORT: String(SHOP_API_PORT) },
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
  let stderr = "";
  proc.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });
  proc.on("exit", (code) => {
    if (child === proc) {
      child = null;
      ready = null;
    }
    if (proc.stoppedOnPurpose !== true && code !== 0 && code !== null) {
      // eslint-disable-next-line no-console
      console.error(`shop-api exited with code ${code}: ${stderr.slice(0, 500)}`);
    }
  });
  child = proc;
  try {
    await waitForPort(SHOP_API_PORT, START_TIMEOUT_MS);
  } catch (err) {
    if (child === proc) {
      child = null;
      ready = null;
    }
    proc.kill();
    throw err;
  }
}

/**
 * Ask the OS for a currently free TCP port.
 * @returns {Promise<number>} A free port number.
 */
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/**
 * Stop the shop-api child process (no-op when it is not running).
 * @returns {Promise<void>} Resolves once the process has exited.
 */
export async function stopShopApi() {
  if (ready !== null) {
    await ready.catch(() => {}); // let an in-progress start finish first
  }
  return new Promise((resolve) => {
    if (child === null) {
      resolve();
      return;
    }
    const proc = child;
    proc.stoppedOnPurpose = true;
    child = null;
    ready = null;
    const timer = setTimeout(resolve, 3000);
    proc.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    proc.kill();
  });
}

/**
 * Restart the shop-api so it picks up code changes on disk.
 * @returns {Promise<void>}
 */
export async function restartShopApi() {
  await stopShopApi();
  await startShopApi();
}

/**
 * Express middleware that forwards requests to the shop-api child process.
 * Mount it BEFORE express.json() so the request body is still unread.
 * @param {string} prefix Path prefix to add when forwarding (e.g. "/preview").
 * @returns {import("express").RequestHandler} The proxy middleware.
 */
export function shopApiProxy(prefix) {
  return async (req, res) => {
    try {
      await startShopApi();
    } catch (err) {
      res.status(503).json({ error: { code: "SHOP_API_UNAVAILABLE", message: err.message } });
      return;
    }
    const upstream = http.request(
      {
        host: "127.0.0.1",
        port: shopApiPort,
        method: req.method,
        path: `${prefix}${req.url}`,
        headers: req.headers,
      },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on("error", (err) => {
      if (res.headersSent) {
        res.end();
        return;
      }
      res.status(502).json({ error: { code: "SHOP_API_UNAVAILABLE", message: err.message } });
    });
    req.pipe(upstream);
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
      throw new Error(`shop-api did not start on port ${port} within ${timeoutMs}ms`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}

process.on("exit", () => {
  if (child !== null) {
    child.kill();
  }
});

// Ctrl+C / kill: stop the child too, then exit.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    if (child !== null) {
      child.kill();
    }
    process.exit(0);
  });
}
