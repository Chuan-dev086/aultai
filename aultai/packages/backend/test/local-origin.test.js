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

test("rejects API mutations from cross-site browser origins", async () => {
  const response = await fetch(`${baseUrl}/api/project/start`, {
    method: "POST",
    headers: {
      origin: "https://attacker.example",
      "sec-fetch-site": "cross-site",
    },
  });

  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "LOCAL_ORIGIN_REQUIRED");
});

test("allows project actions from the local AultAI frontend origin", async () => {
  const response = await fetch(`${baseUrl}/api/project/switch`, {
    method: "POST",
    headers: {
      origin: "http://localhost:5173",
      "sec-fetch-site": "same-site",
    },
  });

  assert.equal(response.status, 200);
  assert.equal((await response.json()).active, "shop-api");
});
