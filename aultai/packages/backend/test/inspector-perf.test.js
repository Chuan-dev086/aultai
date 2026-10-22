import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { app } from "../src/index.js";

let server;
let baseUrl;

before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

test("Inspector can load detail for every selectable graph node", async () => {
  const graphResponse = await fetch(`${baseUrl}/api/graph`);
  assert.equal(graphResponse.status, 200);
  const { nodes, edges } = await graphResponse.json();
  const nodeIds = new Set(nodes.map((node) => node.id));
  assert.equal(nodeIds.size, nodes.length, "graph node IDs must be unique");

  const details = await Promise.all(
    nodes.map(async (node) => {
      const response = await fetch(`${baseUrl}/api/node/${encodeURIComponent(node.id)}`);
      assert.equal(response.status, 200, `Inspector request failed for ${node.id}`);
      const detail = await response.json();
      assert.equal(detail.id, node.id);
      assert.ok(Array.isArray(detail.callers));
      assert.ok(Array.isArray(detail.callees));
      return detail;
    }),
  );

  for (const detail of details) {
    assert.ok(detail.callers.every((id) => edges.some((edge) => edge.type === "calls" && edge.source === id && edge.target === detail.id)));
    assert.ok(detail.callees.every((id) => edges.some((edge) => edge.type === "calls" && edge.source === detail.id && edge.target === id)));
  }
});

test("Perf API rejects targets outside the active project", async () => {
  for (const request of [
    { endpoint: "https://example.com/" },
    { endpoint: "/api/project/start" },
    { endpoint: "//example.com/" },
    { endpoint: "/shop-api/cart/checkout", concurrency: 101 },
  ]) {
    const response = await fetch(`${baseUrl}/api/perf/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code.startsWith("INVALID_PERF"), true);
  }
});

test("Review API returns a fix proposal without applying it", async () => {
  const response = await fetch(`${baseUrl}/api/fix`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ issueId: "issue-bug1-checkout-no-floor" }),
  });
  assert.equal(response.status, 200);
  const proposal = await response.json();
  assert.equal(proposal.issueId, "issue-bug1-checkout-no-floor");
  assert.ok(proposal.originalCode.length > 0);
  assert.ok(proposal.proposedCode.length > 0);
});
