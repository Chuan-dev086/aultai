import assert from "node:assert/strict";
import { after, test } from "node:test";
import { once } from "node:events";
import { promises as fs } from "node:fs";
import express from "express";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";

const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "aultai-upload-test-"));
process.env.WORKSPACE_DIR = workspaceDir;
const { graphRouter } = await import("../src/routes/graph.js");
const { projectRouter } = await import("../src/routes/project.js");
const { buildGraph } = await import("../src/services/graphBuilder.js");
const { discoverEndpoints } = await import("../src/services/endpoints.js");
const {
  projectStatus,
  removeDirectoryWithRetry,
  startProject,
  stopProject,
  uploadProject,
} = await import("../src/services/projectManager.js");
const { runGeneratedTests, runTests } = await import("../src/services/testrunner.js");
const {
  getActiveWorkspace,
  getDynamicWorkspaceSubdir,
  listJsFiles,
  readFile,
  resetDynamicWorkspace,
  setActiveWorkspace,
  setDynamicWorkspace,
} = await import("../src/services/sandbox.js");

after(async () => {
  await fs.rm(workspaceDir, { recursive: true, force: true });
  delete process.env.WORKSPACE_DIR;
});

test("extracts a nested project directly and rejects ambiguous project roots", async () => {
  const archivePath = path.join(workspaceDir, "nested-project.zip");
  await fs.writeFile(
    archivePath,
    createZip([
      ["aultai-main/README.md", "# Wrapper"],
      ["aultai-main/aultai/package.json", '{"name":"aultai"}'],
      ["aultai-main/aultai/scripts/start.js", 'run("frontend", [viteBin, "--port", "5173", "--open"], {'],
      ["aultai-main/aultai/packages/frontend/package.json", '{"name":"frontend"}'],
      ["aultai-main/aultai/packages/backend/package.json", '{"name":"backend"}'],
    ]),
  );

  await uploadProject(archivePath);

  const projectRoot = getActiveWorkspace();
  assert.deepEqual(projectStatus(), {
    active: "dynamic_project",
    port: null,
    previewPort: null,
    running: false,
  });
  assert.equal(await fs.readFile(path.join(projectRoot, "package.json"), "utf8"), '{"name":"aultai"}');
  assert.equal(await readFile("dynamic_project/package.json"), '{"name":"aultai"}');
  assert.deepEqual(await listJsFiles("dynamic_project"), ["dynamic_project/scripts/start.js"]);
  assert.equal(await fs.readFile(path.join(projectRoot, "packages", "backend", "package.json"), "utf8"), '{"name":"backend"}');
  const launcher = await fs.readFile(path.join(projectRoot, "scripts", "start.js"), "utf8");
  assert.match(launcher, /AULTAI_NO_OPEN/);
  assert.match(launcher, /AULTAI_PREVIEW_PORT/);
  assert.match(launcher, /--host", "127\.0\.0\.1/);
  assert.match(launcher, /--strictPort/);
  assert.equal(await fs.readdir(projectRoot).then((entries) => entries.includes("aultai-main")), false);
  await assert.rejects(fs.stat(path.join(projectRoot, "README.md")), { code: "ENOENT" });

  await fs.writeFile(
    archivePath,
    createZip([
      ["first/package.json", '{"name":"first"}'],
      ["second/package.json", '{"name":"second"}'],
    ]),
  );
  await assert.rejects(
    uploadProject(archivePath),
    (err) => err.code === "UPLOAD_FAILED" && err.message.includes("multiple project folders"),
  );

  await fs.writeFile(archivePath, createZip([["package.json", '{"name":"replacement"}']]));
  await uploadProject(archivePath);
  const replacementRoot = getActiveWorkspace();
  assert.notEqual(replacementRoot, projectRoot);
  assert.equal(await fs.readFile(path.join(replacementRoot, "package.json"), "utf8"), '{"name":"replacement"}');
  assert.equal(await fs.readFile(path.join(projectRoot, "package.json"), "utf8"), '{"name":"aultai"}');
});

test("retries transient Windows directory locks during project cleanup", async () => {
  let attempts = 0;
  await removeDirectoryWithRetry("locked-project", async () => {
    attempts += 1;
    if (attempts < 3) {
      const err = new Error("directory is busy");
      err.code = "EBUSY";
      throw err;
    }
  });
  assert.equal(attempts, 3);
});

test("stops retrying a permanently locked project directory and reports an actionable error", async () => {
  let attempts = 0;
  await assert.rejects(
    removeDirectoryWithRetry("locked-project", async () => {
      attempts += 1;
      const err = new Error("directory is busy");
      err.code = "EBUSY";
      throw err;
    }),
    (err) =>
      err.code === "PROJECT_FILES_IN_USE" &&
      err.message.includes("Close any terminals, editors, or project processes") &&
      err.message.includes("then retry"),
  );
  assert.equal(attempts, 11);
});

test("starts supported split dev projects and reports their configured API and preview ports", async () => {
  const previousActiveWorkspace = projectStatus().active;
  setActiveWorkspace("dynamic_project");
  const root = getActiveWorkspace();
  const apiPort = await findAvailablePort();
  const previewPort = await findAvailablePort();
  await fs.mkdir(path.join(root, "server"), { recursive: true });
  await fs.mkdir(path.join(root, "client"), { recursive: true });
  await fs.mkdir(path.join(root, "node_modules"), { recursive: true });
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({
      scripts: {
        dev: "node dev.js",
        server: "node server/index.js",
        client: "node client/index.js",
      },
    }),
  );
  await fs.writeFile(
    path.join(root, "client", "vite.config.js"),
    `export default { server: { port: ${previewPort} } };`,
  );
  await fs.writeFile(
    path.join(root, "server", "index.js"),
    [
      'import { createServer } from "node:http";',
      `createServer((_req, res) => res.end("api")).listen(${apiPort}, "127.0.0.1");`,
    ].join("\n"),
  );
  await fs.writeFile(
    path.join(root, "client", "index.js"),
    [
      'import { createServer } from "node:http";',
      `createServer((_req, res) => res.end("preview")).listen(${previewPort}, "127.0.0.1");`,
    ].join("\n"),
  );

  try {
    const started = await startProject();
    assert.equal(started.port, apiPort);
    assert.equal(started.previewPort, previewPort);
    assert.equal(projectStatus().port, apiPort);
    assert.equal(projectStatus().previewPort, previewPort);
    assert.equal((await fetch(`http://127.0.0.1:${apiPort}`)).status, 200);
    assert.equal((await fetch(`http://127.0.0.1:${previewPort}`)).status, 200);
  } finally {
    await stopProject();
    setActiveWorkspace(previousActiveWorkspace);
  }
});

test("lists, opens, and safely detaches uploaded projects before deleting them", async () => {
  const uploadsDir = path.join(workspaceDir, ".dynamic-projects");
  const firstId = "11111111-1111-4111-8111-111111111111";
  const secondId = "22222222-2222-4222-8222-222222222222";
  const previousDynamicWorkspace = getDynamicWorkspaceSubdir();
  const previousActiveWorkspace = projectStatus().active;
  for (const [id, name] of [[firstId, "first-upload"], [secondId, "second-upload"]]) {
    const projectDir = path.join(uploadsDir, id);
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(path.join(projectDir, "package.json"), JSON.stringify({ name }));
  }
  await setDynamicWorkspace(path.posix.join(".dynamic-projects", firstId));
  setActiveWorkspace("dynamic_project");

  const app = express();
  app.use("/api", projectRouter);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/project/uploads`;
  try {
    const listResponse = await fetch(baseUrl);
    assert.equal(listResponse.status, 200);
    const listed = (await listResponse.json()).projects
      .filter(({ id }) => id === firstId || id === secondId)
      .map(({ id, name, current }) => ({ id, name, current }))
      .sort((left, right) => left.id.localeCompare(right.id));
    assert.deepEqual(
      listed,
      [
        { id: firstId, name: "first-upload", current: true },
        { id: secondId, name: "second-upload", current: false },
      ].sort((left, right) => left.id.localeCompare(right.id)),
    );

    const openResponse = await fetch(`${baseUrl}/${secondId}/open`, { method: "POST" });
    assert.equal(openResponse.status, 200);
    assert.deepEqual(await openResponse.json(), { active: "dynamic_project", projectId: secondId });
    assert.equal(getDynamicWorkspaceSubdir(), path.posix.join(".dynamic-projects", secondId));
    assert.equal(projectStatus().active, "dynamic_project");

    const invalidOpen = await fetch(`${baseUrl}/not-a-uuid/open`, { method: "POST" });
    assert.equal(invalidOpen.status, 400);
    const missingOpen = await fetch(
      `${baseUrl}/33333333-3333-4333-8333-333333333333/open`,
      { method: "POST" },
    );
    assert.equal(missingOpen.status, 404);

    const reopenResponse = await fetch(`${baseUrl}/${firstId}/open`, { method: "POST" });
    assert.equal(reopenResponse.status, 200);
    assert.equal(getDynamicWorkspaceSubdir(), path.posix.join(".dynamic-projects", firstId));

    const deletionResponse = await fetch(`${baseUrl}/${firstId}`, { method: "DELETE" });
    assert.equal(deletionResponse.status, 200);
    assert.deepEqual(await deletionResponse.json(), {
      deleted: firstId,
      active: "shop-api",
      workspaceChanged: true,
    });
    const invalidDeletion = await fetch(`${baseUrl}/not-a-uuid`, { method: "DELETE" });
    assert.equal(invalidDeletion.status, 400);
    const secondDeletion = await fetch(`${baseUrl}/${secondId}`, { method: "DELETE" });
    assert.equal(secondDeletion.status, 200);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => err ? reject(err) : resolve());
    });
  }

  assert.notEqual(getDynamicWorkspaceSubdir(), path.posix.join(".dynamic-projects", firstId));
  await fs.stat(path.resolve(workspaceDir, getDynamicWorkspaceSubdir()));
  await assert.rejects(fs.stat(path.join(uploadsDir, firstId)), { code: "ENOENT" });
  if (previousDynamicWorkspace.startsWith(".dynamic-projects/")) {
    try {
      await fs.stat(path.resolve(workspaceDir, previousDynamicWorkspace));
      await setDynamicWorkspace(previousDynamicWorkspace);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await resetDynamicWorkspace();
    }
  } else {
    await resetDynamicWorkspace();
  }
  setActiveWorkspace(previousActiveWorkspace);
});

test("stops an active dynamic-project test process before replacing its files", async () => {
  const projectRoot = getActiveWorkspace();
  await fs.mkdir(projectRoot, { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, "package.json"),
    JSON.stringify({ scripts: { test: "node hold.js" } }),
  );
  await fs.writeFile(path.join(projectRoot, "hold.js"), "setInterval(() => {}, 1000);");
  setActiveWorkspace("dynamic_project");
  const testRun = runTests();
  await new Promise((resolve) => setTimeout(resolve, 500));

  const archivePath = path.join(workspaceDir, "replacement.zip");
  await fs.writeFile(archivePath, createZip([["package.json", '{"name":"replacement"}']]));
  await uploadProject(archivePath);
  await testRun;

  assert.equal(
    await fs.readFile(path.join(getActiveWorkspace(), "package.json"), "utf8"),
    '{"name":"replacement"}',
  );
});

test("reports when an uploaded project has no npm test command", async () => {
  setActiveWorkspace("dynamic_project");
  const projectRoot = getActiveWorkspace();
  await fs.mkdir(projectRoot, { recursive: true });
  await fs.writeFile(path.join(projectRoot, "package.json"), JSON.stringify({ name: "no-tests" }));

  await assert.rejects(
    runTests(),
    (error) =>
      error.code === "TEST_COMMAND_NOT_CONFIGURED" &&
      error.message.includes('no "scripts.test" command') &&
      error.message.includes("not added or executed automatically"),
  );
  setActiveWorkspace("shop-api");
});

test("runs explicitly submitted generated Node.js tests without a project test script", async () => {
  setActiveWorkspace("dynamic_project");
  const result = await runGeneratedTests([
    {
      name: "generated passing test",
      code: [
        'import { test } from "node:test";',
        'import assert from "node:assert/strict";',
        'test("generated assertion passes", () => { assert.equal(2 + 2, 4); });',
      ].join("\n"),
    },
  ]);

  assert.equal(result.total, 1);
  assert.equal(result.passed, 1);
  assert.equal(result.failed, 0);
  assert.match(result.generatedTestDirectory, /^\.aultai-tests\//);
  assert.equal(
    (await fs.readdir(path.join(getActiveWorkspace(), result.generatedTestDirectory))).includes("generated-1.test.js"),
    true,
  );
});

test("project source endpoint serves code and rejects traversal and oversized files", async () => {
  setActiveWorkspace("dynamic_project");
  const root = getActiveWorkspace();
  const sourcePath = path.join(root, "src", "example.js");
  const largePath = path.join(root, "src", "large.js");
  await fs.mkdir(path.dirname(sourcePath), { recursive: true });
  await fs.writeFile(sourcePath, "export const answer = 42;\n");
  await fs.writeFile(largePath, "x".repeat(30001));

  const app = express();
  app.use("/api", graphRouter);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}/api/project/file`;

  try {
    const sourceResponse = await fetch(`${baseUrl}?path=src%2Fexample.js`);
    assert.equal(sourceResponse.status, 200);
    assert.deepEqual(await sourceResponse.json(), {
      file: "src/example.js",
      code: "export const answer = 42;\n",
    });

    const traversalResponse = await fetch(`${baseUrl}?path=..%2Fpackage.json`);
    assert.equal(traversalResponse.status, 400);

    const oversizedResponse = await fetch(`${baseUrl}?path=src%2Flarge.js`);
    assert.equal(oversizedResponse.status, 413);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => err ? reject(err) : resolve());
    });
  }
});

test("graph uses unique file-based module IDs and every defines edge has a rendered target", async () => {
  setActiveWorkspace("dynamic_project");
  const root = getActiveWorkspace();
  const files = {
    "frontend/src/api.js": 'export function loadProfile() { return true; }\n',
    "frontend/src/App.js": 'import { loadProfile } from "./api.js";\nexport function App() { return loadProfile(); }\n',
    "backend/src/api.js": 'export function loadOrders() { return []; }\n',
  };
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = path.join(root, ...relativePath.split("/"));
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, contents);
  }

  const graph = await buildGraph();
  const ids = graph.nodes.map((node) => node.id);
  const idSet = new Set(ids);
  const definesEdges = graph.edges.filter((edge) => edge.type === "defines");
  const callEdge = graph.edges.find((edge) =>
    edge.type === "calls" && edge.source === "frontend/src/App.App");

  assert.equal(idSet.size, ids.length, "node IDs must be unique for the graph renderer");
  assert.equal(idSet.has("frontend/src/api"), true);
  assert.equal(idSet.has("backend/src/api"), true);
  assert.ok(definesEdges.length > 0);
  assert.deepEqual(
    definesEdges.filter((edge) => !idSet.has(edge.source) || !idSet.has(edge.target)),
    [],
  );
  assert.equal(callEdge?.target, "frontend/src/api.loadProfile");
});

test("discovers Express endpoints and composes imported router mount paths", async () => {
  setActiveWorkspace("dynamic_project");
  const root = getActiveWorkspace();
  const files = {
    "server.js": [
      'import express from "express";',
      'import { apiRouter } from "./routes.js";',
      "const app = express();",
      'app.use("/api/v1", apiRouter);',
      'app.get("/health", (req, res) => res.send("ok"));',
    ].join("\n"),
    "routes.js": [
      'import { Router } from "express";',
      "export const apiRouter = Router();",
      'apiRouter.get("/items", (req, res) => res.json([]));',
      'apiRouter.post(`/items/:id`, (req, res) => res.send("ok"));',
      'apiRouter.get(`/computed/${version}`, handler);',
    ].join("\n"),
  };
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = path.join(root, ...relativePath.split("/"));
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, contents);
  }

  const endpoints = await discoverEndpoints();
  assert.deepEqual(
    endpoints.map(({ method, path: routePath, file }) => ({ method, path: routePath, file })),
    [
      { method: "GET", path: "/api/v1/items", file: "dynamic_project/routes.js" },
      { method: "POST", path: "/api/v1/items/:id", file: "dynamic_project/routes.js" },
      { method: "GET", path: "/health", file: "dynamic_project/server.js" },
    ],
  );
});

function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const [filePath, contents] of files) {
    const name = Buffer.from(filePath);
    const data = Buffer.from(contents);
    const crc = crc32(data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localParts.push(localHeader, name, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(centralHeader, name);
    localOffset += localHeader.length + name.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

async function findAvailablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => {
    server.close((err) => err ? reject(err) : resolve());
  });
  return port;
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
