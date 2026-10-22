import { Router } from "express";
import { z } from "zod";
import { generateTests } from "../services/testgen.js";
import { getLastTestRun, runGeneratedTests, runTests } from "../services/testrunner.js";
import { AITestExplanationSchema, GenerateTestsResponseSchema, TestRunResultSchema } from "../models.js";
import { requestAI } from "../services/aiService.js";
import { getActiveSubdir } from "../services/sandbox.js";
import { sendAIError } from "./aiErrors.js";

export const testsRouter = Router();

const GeneratedTestsBody = z.object({
  tests: z.array(z.object({
    name: z.string().min(1).max(300),
    code: z.string().min(1).max(10000),
  })).min(1).max(20),
});

/**
 * Return test-case suggestions without writing project files.
 */
testsRouter.post("/tests/generate", async (req, res) => {
  try {
    const result = await generateTests();
    res.json(GenerateTestsResponseSchema.parse(result));
  } catch (err) {
    sendAIError(res, err, "GENERATE_FAILED");
  }
});

/**
 * Run the shop-api Vitest suite in a child process and return per-test results.
 */
testsRouter.post("/tests/run", async (req, res) => {
  try {
    const result = await runTests();
    res.json(TestRunResultSchema.parse(result));
  } catch (err) {
    const status = err.code === "TEST_COMMAND_NOT_CONFIGURED" ? 409 : 500;
    res.status(status).json({ error: { code: err.code ?? "RUN_FAILED", message: err.message } });
  }
});

/**
 * Run generated tests only after the user explicitly approves them in the UI.
 */
testsRouter.post("/tests/run-generated", async (req, res) => {
  const parsed = GeneratedTestsBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "INVALID_GENERATED_TESTS",
        message: parsed.error.issues.map((issue) => issue.message).join("; "),
      },
    });
    return;
  }
  try {
    const result = await runGeneratedTests(parsed.data.tests);
    res.json({
      ...TestRunResultSchema.parse(result),
      generatedTestDirectory: result.generatedTestDirectory,
    });
  } catch (err) {
    const status = err.code === "TEST_COMMAND_NOT_CONFIGURED" ? 400 : 500;
    res.status(status).json({ error: { code: err.code ?? "RUN_FAILED", message: err.message } });
  }
});

/**
 * Explain the most recent test run without inventing or modifying results.
 */
testsRouter.post("/tests/explain", async (req, res) => {
  try {
    const result = getLastTestRun();
    if (result === null) {
      res.status(409).json({ error: { code: "NO_TEST_RESULTS", message: "Run tests before asking AI to explain their results." } });
      return;
    }
    const explanation = await requestAI({
      task: "explain_test_results",
      context: { project: getActiveSubdir(), testRun: result },
    });
    res.json(AITestExplanationSchema.parse(explanation));
  } catch (err) {
    sendAIError(res, err, "TEST_EXPLANATION_FAILED");
  }
});
