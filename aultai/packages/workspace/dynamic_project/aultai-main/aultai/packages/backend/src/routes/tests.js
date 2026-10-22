import { Router } from "express";
import { generateTests } from "../services/testgen.js";
import { runTests } from "../services/testrunner.js";
import { GenerateTestsResponseSchema, TestRunResultSchema } from "../models.js";

export const testsRouter = Router();

/**
 * Generate a regression test suite (mock) and write it to
 * shop-api/tests/test_generated.test.js.
 */
testsRouter.post("/tests/generate", async (req, res) => {
  try {
    const result = await generateTests();
    res.json(GenerateTestsResponseSchema.parse(result));
  } catch (err) {
    res.status(500).json({ error: { code: "GENERATE_FAILED", message: err.message } });
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
