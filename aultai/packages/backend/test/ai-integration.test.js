import assert from "node:assert/strict";
import { after, test } from "node:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "aultai-ai-test-"));
const originalEnv = {
  WORKSPACE_DIR: process.env.WORKSPACE_DIR,
  AI_PROVIDER: process.env.AI_PROVIDER,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMINI_MODEL: process.env.GEMINI_MODEL,
};
const originalFetch = globalThis.fetch;
process.env.WORKSPACE_DIR = workspaceDir;
process.env.AI_PROVIDER = "gemini";
process.env.GEMINI_API_KEY = "test-gemini-key";
process.env.GEMINI_MODEL = "gemini-3.1-flash-lite";

const { requestAI } = await import("../src/services/aiService.js");
const { applySolution, generateSolution, revertSolution } = await import("../src/services/aiSolution.js");
const { setActiveWorkspace } = await import("../src/services/sandbox.js");
const { analyzeProject } = await import("../src/services/analyzer.js");

after(async () => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await fs.rm(workspaceDir, { recursive: true, force: true });
});

test("Gemini adapter keeps the key backend-side and redacts secret context", async () => {
  let call;
  globalThis.fetch = async (url, options) => {
    call = { url: String(url), options };
    return jsonResponse({ candidates: [{ content: { parts: [{ text: '{"explanation":"The value is used here."}' }] } }] });
  };

  const response = await requestAI({
    task: "explain",
    context: { code: 'const token = "sample-secret-value";', apiKey: "AIza012345678901234567890123456789" },
  });

  assert.equal(response.explanation, "The value is used here.");
  assert.match(call.url, /gemini-3\.1-flash-lite:generateContent$/);
  assert.equal(call.url.includes(process.env.GEMINI_API_KEY), false);
  assert.equal(call.options.headers["x-goog-api-key"], process.env.GEMINI_API_KEY);
  const body = JSON.parse(call.options.body);
  const sentContext = body.contents[0].parts[0].text;
  assert.equal(sentContext.includes("sample-secret-value"), false);
  assert.equal(sentContext.includes("AIza012345678901234567890123456789"), false);
});

test("Gemini quota failures are surfaced as a stable error", async () => {
  globalThis.fetch = async () => new Response("{}", { status: 429 });
  await assert.rejects(
    requestAI({ task: "explain", context: { code: "const x = 1;" } }),
    (err) => err.code === "AI_QUOTA_EXHAUSTED" && err.message.includes("quota"),
  );
});

test("Gemini timeouts are surfaced instead of returning mock output", async () => {
  globalThis.fetch = async () => {
    const error = new Error("aborted");
    error.name = "AbortError";
    throw error;
  };
  await assert.rejects(
    requestAI({ task: "explain", context: { code: "const x = 1;" } }),
    (err) => err.code === "AI_TIMEOUT",
  );
});

test("AI fixes remain proposals until explicit approval, and can be reverted", async () => {
  setActiveWorkspace("dynamic_project");
  const file = path.join(workspaceDir, "dynamic_project", "src", "example.js");
  const original = "export function value() {\n  return 1;\n}\n";
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, original);
  globalThis.fetch = async () => jsonResponse({
    candidates: [{
      content: {
        parts: [{
          text: JSON.stringify({
            explanation: "The function returns the wrong value.",
            originalCode: "return 1;",
            proposedCode: "return 2;",
            rationaleSteps: ["Return the expected value."],
            risk: "low",
          }),
        }],
      },
    }],
  });

  const proposal = await generateSolution({
    file: "src/example.js",
    code: original,
    error: "Expected 2 but received 1.",
  });
  assert.equal((await fs.readFile(file, "utf8")), original);
  assert.equal(proposal.originalCode, "return 1;");

  await applySolution(proposal.proposalId);
  assert.equal(await fs.readFile(file, "utf8"), original.replace("return 1;", "return 2;"));
  await revertSolution(proposal.proposalId);
  assert.equal(await fs.readFile(file, "utf8"), original);
  setActiveWorkspace("shop-api");
});

test("AI solution rejects paths outside the active project", async () => {
  await assert.rejects(
    generateSolution({ file: "../package.json", code: "source", error: "failure" }),
    (err) => err.code === "AI_INVALID_REQUEST",
  );
});

test("AI solution revert preserves edits made after applying the proposal", async () => {
  setActiveWorkspace("dynamic_project");
  const file = path.join(workspaceDir, "dynamic_project", "src", "example.js");
  const original = "export function value() {\n  return 1;\n}\n";
  await fs.writeFile(file, original);
  globalThis.fetch = async () => jsonResponse({
    candidates: [{
      content: {
        parts: [{
          text: JSON.stringify({
            explanation: "The function returns the wrong value.",
            originalCode: "return 1;",
            proposedCode: "return 2;",
            rationaleSteps: ["Return the expected value."],
            risk: "low",
          }),
        }],
      },
    }],
  });

  const proposal = await generateSolution({ file: "src/example.js", code: original, error: "Expected 2." });
  await applySolution(proposal.proposalId);
  const changed = `${original.replace("return 1;", "return 2;")}\n// developer edit\n`;
  await fs.writeFile(file, changed);
  await assert.rejects(
    revertSolution(proposal.proposalId),
    (err) => err.code === "PATCH_CONFLICT",
  );
  assert.equal(await fs.readFile(file, "utf8"), changed);
  setActiveWorkspace("shop-api");
});

test("live Analyze examines and validates active-project source", async () => {
  setActiveWorkspace("dynamic_project");
  await fs.writeFile(
    path.join(workspaceDir, "dynamic_project", "src", "example.js"),
    "export function value() {\n  return 1;\n}\n",
  );
  globalThis.fetch = async () => jsonResponse({
    candidates: [{
      content: {
        parts: [{
          text: JSON.stringify({
            issues: [{
              id: "ai-example-issue",
              title: "Unexpected constant result",
              severity: "medium",
              file: "src/example.js",
              lineno: 2,
              evidence: "return 1;",
              explanation: "This result conflicts with the reported expectation.",
              suggested_action: "Return the expected value.",
            }],
          }),
        }],
      },
    }],
  });

  const result = await analyzeProject();
  assert.equal(result.mode, "live");
  assert.equal(result.issues.some((issue) => issue.id === "ai-example-issue" && issue.file === "dynamic_project/src/example.js"), true);
  setActiveWorkspace("shop-api");
});

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}
