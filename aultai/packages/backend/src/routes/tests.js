import { Router } from "express";
import { generateTests } from "../services/testgen.js";
import { getLastTestRun, runTests } from "../services/testrunner.js";
import { AITestExplanationSchema, GenerateTestsResponseSchema, TestRunResultSchema } from "../models.js";
import { requestAI } from "../services/aiService.js";
import { getActiveSubdir } from "../services/sandbox.js";
import { sendAIError } from "./aiErrors.js";

export const testsRouter = Router();

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
    res.status(500).json({ error: { code: "RUN_FAILED", message: err.message } });
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
