/**
 * One-command launcher for the AultAI demo: `npm start`
 *
 * - Picks a free backend port (3000, or the next free one).
 * - Starts the backend, waits until it is healthy.
 * - Starts the Vite frontend pointed at that backend and opens the browser.
 * - Ctrl+C stops everything.
 *
 * No extra dependencies; works on Windows, macOS and Linux.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frontendDir = path.join(root, "packages", "frontend");
const children = [];

function fail(message) {
  console.error("\n  " + message + "\n");
  stopAll(1);
}

function stopAll(code = 0) {
  for (const c of children) {
    if (c.exitCode === null) c.kill();
  }
  process.exit(code);
}
process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

// ---- checks ---------------------------------------------------------------
const major = Number(process.versions.node.split(".")[0]);
if (major < 20) fail(`Node.js 20 or newer is needed (you have ${process.versions.node}). Install the LTS version from https://nodejs.org`);
if (!fs.existsSync(path.join(root, "node_modules"))) fail("Packages are not installed yet. Run: npm install");

let viteBin;
try {
  const require = createRequire(path.join(frontendDir, "package.json"));
  viteBin = path.join(path.dirname(require.resolve("vite/package.json")), "bin", "vite.js");
} catch {
  fail("Vite is missing. Run: npm install");
}

// ---- helpers ----------------------------------------------------------------
function portIsFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.listen(port, () => srv.close(() => resolve(true)));
  });
}

async function findPort(start, tries = 30) {
  for (let p = start; p < start + tries; p += 1) {
    if (await portIsFree(p)) return p;
    console.log(`  Port ${p} is busy or blocked, trying ${p + 1}…`);
  }
  return null;
}

function waitForHealth(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get({ host: "127.0.0.1", port, path: "/api/health", timeout: 1000 }, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else retry();
      });
      req.on("error", retry);
      req.on("timeout", () => req.destroy());
    };
    const retry = () => {
      if (Date.now() > deadline) reject(new Error("backend did not become healthy"));
      else setTimeout(attempt, 300);
    };
    attempt();
  });
}

function run(name, args, opts) {
  const child = spawn(process.execPath, args, { ...opts, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  const prefix = (stream, out) => {
    let buf = "";
    stream.on("data", (chunk) => {
      buf += String(chunk);
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      for (const line of lines) if (line.trim() !== "") out.write(`[${name}] ${line}\n`);
    });
  };
  prefix(child.stdout, process.stdout);
  prefix(child.stderr, process.stderr);
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) fail(`The ${name} stopped unexpectedly (exit code ${code}). See the messages above.`);
  });
  children.push(child);
  return child;
}

// ---- start ------------------------------------------------------------------
const backendPort = await findPort(Number(process.env.PORT) || 3000);
if (backendPort === null) fail("Couldn't find a free port for the backend.");

console.log("\n  Starting AultAI…\n");
run("backend", [path.join(root, "packages", "backend", "src", "index.js")], {
  cwd: root,
  env: { ...process.env, PORT: String(backendPort) },
});

try {
  await waitForHealth(backendPort);
} catch {
  fail("The backend didn't start. See the [backend] messages above.");
}

run("frontend", [viteBin, "--port", "5173", "--open"], {
  cwd: frontendDir,
  env: { ...process.env, AULTAI_BACKEND_PORT: String(backendPort) },
});

console.log(`\n  AultAI is starting. Your browser will open automatically.`);
console.log(`  If it doesn't, open the "Local:" address shown by [frontend] below.`);
console.log(`  Press Ctrl+C to stop.\n`);
