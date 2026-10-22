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
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
  CUSTOM_AI_API_KEY: process.env.CUSTOM_AI_API_KEY,
  CUSTOM_AI_BASE_URL: process.env.CUSTOM_AI_BASE_URL,
  CUSTOM_AI_MODEL: process.env.CUSTOM_AI_MODEL,
};
const originalFetch = globalThis.fetch;
process.env.WORKSPACE_DIR = workspaceDir;
process.env.AI_PROVIDER = "gemini";
process.env.GEMINI_API_KEY = "test-gemini-key";
process.env.GEMINI_MODEL = "gemini-3.1-flash-lite";

const { requestAI } = await import("../src/services/aiService.js");
const { applySolution, generateSolution, revertSolution } = await import("../src/services/aiSolution.js");
const { applyFix, generateFix } = await import("../src/services/fixer.js");
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

test("structured AI tasks request JSON schemas for all required response fields", async () => {
  const cases = [
    {
      task: "explain",
      response: { explanation: "This function handles requests." },
      required: ["explanation"],
    },
    {
      task: "generate_tests",
      response: { tests: [{ name: "returns a value", code: "assert.equal(value(), 1);" }] },
      required: ["tests"],
    },
    {
      task: "analyze_perf",
      response: { summary: "The endpoint responds consistently.", recommendations: [] },
      required: ["summary", "recommendations"],
    },
    {
      task: "explain_test_results",
      response: { summary: "All tests passed.", failure_explanations: [] },
      required: ["summary", "failure_explanations"],
    },
  ];
  const requestSchemas = [];
  const systemInstructions = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    requestSchemas.push(body.generationConfig.responseSchema);
    systemInstructions.push(body.systemInstruction.parts[0].text);
    const response = cases[requestSchemas.length - 1].response;
    return jsonResponse({
      candidates: [{ content: { parts: [{ text: JSON.stringify(response) }] } }],
    });
  };

  for (const item of cases) {
    const result = await requestAI({ task: item.task, context: { sample: true } });
    assert.deepEqual(result, item.response);
  }
  assert.deepEqual(
    requestSchemas.map((schema) => schema.required),
    cases.map((item) => item.required),
  );
  assert.match(systemInstructions[1], /<project>\/\.aultai-tests\/<run-id>\//);
  assert.match(systemInstructions[1], /use \.\.\/\.\.\/frontend\/src\/utils\.js/);
  assert.equal(requestSchemas.every((schema) => schema.type === "OBJECT"), true);
});

test("DeepSeek sends requests directly with its default Flash model and JSON mode", async () => {
  let call;
  process.env.AI_PROVIDER = "deepseek";
  process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
  delete process.env.DEEPSEEK_MODEL;
  globalThis.fetch = async (url, options) => {
    call = { url: String(url), options };
    return jsonResponse({
      choices: [{
        finish_reason: "stop",
        message: { content: '{"explanation":"DeepSeek response parsed."}' },
      }],
    });
  };

  try {
    const result = await requestAI({ task: "explain", context: { code: "const x = 1;" } });
    const body = JSON.parse(call.options.body);
    assert.equal(result.explanation, "DeepSeek response parsed.");
    assert.equal(call.url, "https://api.deepseek.com/chat/completions");
    assert.match(call.options.headers.authorization, /^Bearer .+/);
    assert.equal(call.url.includes("test-deepseek-key"), false);
    assert.equal(body.model, "deepseek-flash");
    assert.deepEqual(body.thinking, { type: "disabled" });
    assert.deepEqual(body.response_format, { type: "json_object" });
    assert.equal(body.messages[0].role, "system");
  } finally {
    process.env.AI_PROVIDER = "gemini";
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_MODEL;
  }
});

test("OpenRouter sends the selected free model and structured JSON request", async () => {
  let call;
  process.env.AI_PROVIDER = "openrouter";
  process.env.OPENROUTER_API_KEY = "test-openrouter-key";
  delete process.env.OPENROUTER_MODEL;
  globalThis.fetch = async (url, options) => {
    call = { url: String(url), options };
    return jsonResponse({
      choices: [{
        finish_reason: "stop",
        message: { content: '{"explanation":"OpenRouter response parsed."}' },
      }],
    });
  };

  try {
    const result = await requestAI({ task: "explain", context: { code: "const x = 1;" } });
    const body = JSON.parse(call.options.body);
    assert.equal(result.explanation, "OpenRouter response parsed.");
    assert.equal(call.url, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(call.options.headers.authorization, "Bearer test-openrouter-key");
    assert.equal(call.url.includes("test-openrouter-key"), false);
    assert.equal(body.model, "recursive/flint-v1.0:free");
    assert.equal(body.max_tokens, 8192);
    assert.deepEqual(body.reasoning, { effort: "low", exclude: true });
    assert.deepEqual(body.response_format, { type: "json_object" });
    assert.equal(body.messages[0].role, "system");
  } finally {
    process.env.AI_PROVIDER = "gemini";
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_MODEL;
  }
});

test("custom OpenAI-compatible provider uses the configured endpoint, model, and bearer token", async () => {
  let call;
  process.env.AI_PROVIDER = "custom";
  process.env.CUSTOM_AI_API_KEY = "college-test-token";
  process.env.CUSTOM_AI_BASE_URL = "https://api.college.example/v1/";
  process.env.CUSTOM_AI_MODEL = "college-meta-reasoner";
  globalThis.fetch = async (url, options) => {
    call = { url: String(url), options };
    return jsonResponse({
      choices: [{
        finish_reason: "stop",
        message: { content: '{"explanation":"Custom provider response parsed."}' },
      }],
    });
  };

  try {
    const result = await requestAI({ task: "explain", context: { code: "const x = 1;" } });
    const body = JSON.parse(call.options.body);
    assert.equal(result.explanation, "Custom provider response parsed.");
    assert.equal(call.url, "https://api.college.example/v1/chat/completions");
    assert.equal(call.options.headers.authorization, "Bearer college-test-token");
    assert.equal(call.url.includes("college-test-token"), false);
    assert.equal(body.model, "college-meta-reasoner");
    assert.deepEqual(body.response_format, { type: "json_object" });
    assert.equal(body.messages[0].role, "system");
  } finally {
    process.env.AI_PROVIDER = "gemini";
    delete process.env.CUSTOM_AI_API_KEY;
    delete process.env.CUSTOM_AI_BASE_URL;
    delete process.env.CUSTOM_AI_MODEL;
  }
});

test("custom provider rejects non-HTTPS base URLs before sending the token", async () => {
  process.env.AI_PROVIDER = "custom";
  process.env.CUSTOM_AI_API_KEY = "college-test-token";
  process.env.CUSTOM_AI_BASE_URL = "http://api.college.example/v1";
  process.env.CUSTOM_AI_MODEL = "college-meta-reasoner";
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return jsonResponse({});
  };

  try {
    await assert.rejects(
      requestAI({ task: "explain", context: { code: "const x = 1;" } }),
      (err) => err.code === "AI_PROVIDER_NOT_CONFIGURED" && err.message.includes("HTTPS"),
    );
    assert.equal(fetchCalled, false);
  } finally {
    process.env.AI_PROVIDER = "gemini";
    delete process.env.CUSTOM_AI_API_KEY;
    delete process.env.CUSTOM_AI_BASE_URL;
    delete process.env.CUSTOM_AI_MODEL;
  }
});

test("OpenRouter empty reasoning-only responses report the finish reason without logging reasoning", async () => {
  process.env.AI_PROVIDER = "openrouter";
  process.env.OPENROUTER_API_KEY = "test-openrouter-key";
  const logLines = [];
  const originalInfo = console.info;
  const originalWarn = console.warn;
  console.info = (line) => logLines.push(String(line));
  console.warn = (line) => logLines.push(String(line));
  globalThis.fetch = async () => jsonResponse({
    choices: [{
      finish_reason: "length",
      message: {
        content: "",
        reasoning: "private internal reasoning that must not be logged",
      },
    }],
    usage: {
      completion_tokens: 8192,
      completion_tokens_details: { reasoning_tokens: 8192 },
    },
  });

  try {
    await assert.rejects(
      requestAI({ task: "analyze", context: { code: "const x = 1;" } }),
      (err) => err.code === "AI_INVALID_RESPONSE" &&
        err.message.includes("response token limit") &&
        err.message.includes("Retry Analyze"),
    );
  } finally {
    console.info = originalInfo;
    console.warn = originalWarn;
    process.env.AI_PROVIDER = "gemini";
    delete process.env.OPENROUTER_API_KEY;
  }

  assert.equal(logLines.some((line) => line.includes('"finishReasons":["length"]') &&
    line.includes('"reasoningTokens":8192')), true);
  assert.equal(logLines.some((line) => line.includes("private internal reasoning")), false);
});

test("Gemini quota failures are surfaced as a stable error", async () => {
  globalThis.fetch = async () => new Response("{}", { status: 429 });
  await assert.rejects(
    requestAI({ task: "explain", context: { code: "const x = 1;" } }),
    (err) => err.code === "AI_QUOTA_EXHAUSTED" && err.message.includes("quota"),
  );
});

test("DeepSeek payment-required responses explain that billing is needed", async () => {
  process.env.AI_PROVIDER = "deepseek";
  process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
  globalThis.fetch = async () => new Response('{"error":{"message":"Insufficient Balance"}}', {
    status: 402,
    headers: { "content-type": "application/json" },
  });

  try {
    await assert.rejects(
      requestAI({ task: "analyze", context: { code: "const x = 1;" } }),
      (err) => err.code === "AI_PAYMENT_REQUIRED" &&
        err.message.includes("account balance or billing") &&
        err.message.includes("DeepSeek"),
    );
  } finally {
    process.env.AI_PROVIDER = "gemini";
    delete process.env.DEEPSEEK_API_KEY;
  }
});

test("Gemini transient server errors are retried before returning a response", async () => {
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    if (attempts < 3) {
      return new Response("{}", { status: 503, headers: { "retry-after": "0.001" } });
    }
    return jsonResponse({
      candidates: [{ content: { parts: [{ text: '{"explanation":"Recovered after retry."}' }] } }],
    });
  };

  const result = await requestAI({ task: "explain", context: { code: "const x = 1;" } });
  assert.equal(result.explanation, "Recovered after retry.");
  assert.equal(attempts, 3);
});

test("fix requests enforce and safely log the required response fields", async () => {
  let requestBody;
  const logLines = [];
  const originalInfo = console.info;
  const originalWarn = console.warn;
  console.info = (line) => logLines.push(String(line));
  console.warn = (line) => logLines.push(String(line));
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return jsonResponse({
      candidates: [{
        content: { parts: [{ text: '{"proposedCode":"secret-source-snippet"}' }] },
      }],
    });
  };
  try {
    await assert.rejects(
      requestAI({
        task: "fix",
        context: { code: "secret-source-snippet", error: "expected behavior" },
      }),
      (err) => err.code === "AI_INVALID_RESPONSE" &&
        err.message.includes("explanation") &&
        err.message.includes("rationaleSteps"),
    );
  } finally {
    console.info = originalInfo;
    console.warn = originalWarn;
  }

  assert.deepEqual(requestBody.generationConfig.responseSchema.required, [
    "explanation",
    "originalCode",
    "proposedCode",
    "rationaleSteps",
    "risk",
  ]);
  assert.equal(logLines.some((line) => line.includes("response_shape_received") && line.includes('"missingFields":["explanation","originalCode","rationaleSteps","risk"]')), true);
  assert.equal(logLines.some((line) => line.includes("secret-source-snippet")), false);
});

test("Gemini reports 503 after the bounded retry attempts are exhausted", async () => {
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    return new Response("{}", { status: 503, headers: { "retry-after": "0.001" } });
  };
  await assert.rejects(
    requestAI({ task: "explain", context: { code: "const x = 1;" } }),
    (err) => err.code === "AI_PROVIDER_UNAVAILABLE" && err.message.includes("HTTP 503 after 3 attempts"),
  );
  assert.equal(attempts, 3);
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

test("provider errors with a numeric code are normalized without a secondary error", async () => {
  globalThis.fetch = async () => {
    const error = new Error("temporary connection failure");
    error.code = 503;
    throw error;
  };
  await assert.rejects(
    requestAI({ task: "explain", context: { code: "const x = 1;" } }),
    (err) => err.code === "AI_PROVIDER_UNAVAILABLE" &&
      err.message.includes("temporary connection failure"),
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
  let requestBody;
  await fs.writeFile(
    path.join(workspaceDir, "dynamic_project", "src", "example.js"),
    "export function value() {\n  return 1;\n}\n",
  );
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return jsonResponse({
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              issues: [{
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
  };

  const result = await analyzeProject();
  assert.equal(requestBody.generationConfig.responseMimeType, "application/json");
  assert.deepEqual(requestBody.generationConfig.responseSchema.required, ["issues"]);
  assert.equal(requestBody.generationConfig.responseSchema.properties.issues.type, "ARRAY");
  assert.equal(result.mode, "live");
  assert.equal(result.issues.some((issue) => issue.title === "Unexpected constant result" && issue.file === "dynamic_project/src/example.js"), true);
  setActiveWorkspace("shop-api");
});

test("fix generation retries a mismatched source snippet and returns it as unverified", async () => {
  setActiveWorkspace("dynamic_project");
  const file = path.join(workspaceDir, "dynamic_project", "src", "mismatch.js");
  const source = "export function currentValue() {\n  return 1;\n}\n";
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, source);
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    return jsonResponse({
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              explanation: "Change the function result.",
              originalCode: "return 2;",
              proposedCode: "return 3;",
              rationaleSteps: ["Update the returned value."],
              risk: "low",
            }),
          }],
        },
      }],
    });
  };
  const issue = {
    id: "ai-mismatch-retry-test",
    title: "Wrong return value",
    severity: "medium",
    node_id: "mismatch.currentValue",
    file: "dynamic_project/src/mismatch.js",
    lineno: 2,
    evidence: "return 1;",
    explanation: "Expected a different value.",
    suggested_action: "Return the expected value.",
  };

  const proposal = await generateFix(issue.id, issue);
  assert.equal(attempts, 2);
  assert.equal(proposal.sourceVerified, false);
  assert.match(proposal.warning, /did not exactly and uniquely match/);
  assert.equal(await fs.readFile(file, "utf8"), source);
  await assert.rejects(
    applyFix(issue.id),
    (err) => err.code === "PATCH_CONFLICT" && err.message.includes("unverified"),
  );
  assert.equal(await fs.readFile(file, "utf8"), source);
  setActiveWorkspace("shop-api");
});

test("concurrent requests for the same issue share a single Gemini fix request", async () => {
  setActiveWorkspace("dynamic_project");
  const file = path.join(workspaceDir, "dynamic_project", "src", "shared-fix.js");
  const source = "export function currentValue() {\n  return 1;\n}\n";
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, source);
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return jsonResponse({
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              explanation: "Return the updated value.",
              originalCode: "return 1;",
              proposedCode: "return 2;",
              rationaleSteps: ["Update the return value."],
              risk: "low",
            }),
          }],
        },
      }],
    });
  };
  const issue = {
    id: "ai-shared-fix-test",
    title: "Unexpected return value",
    severity: "medium",
    node_id: "shared-fix.currentValue",
    file: "dynamic_project/src/shared-fix.js",
    lineno: 2,
    evidence: "return 1;",
    explanation: "Expected 2.",
    suggested_action: "Return 2.",
  };

  const [first, second] = await Promise.all([
    generateFix(issue.id, issue),
    generateFix(issue.id, issue),
  ]);
  assert.equal(attempts, 1);
  assert.equal(first, second);
  assert.equal(first.sourceVerified, true);
  setActiveWorkspace("shop-api");
});

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}
