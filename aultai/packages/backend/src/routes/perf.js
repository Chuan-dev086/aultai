import { Router } from "express";
import { z } from "zod";
import { runLoadTest, getLastRun } from "../services/perf.js";
import { AIPerfAnalysisSchema, PerfResultSchema } from "../models.js";
import { requestAI } from "../services/aiService.js";
import { sendAIError } from "./aiErrors.js";
import { getActiveSubdir } from "../services/sandbox.js";

export const perfRouter = Router();

const RunBody = z.object({
  project: z.enum(["shop-api", "dynamic_project"]).optional(),
  endpoint: z.string().min(1).max(2048).optional(),
  method: z.enum(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]).optional(),
  payload: z.unknown().optional(),
  concurrency: z.number().int().min(1).max(100).optional(),
  duration: z.number().int().min(1).max(60).optional(),
});

/**
 * Run a load test against the local backend.
 */
perfRouter.post("/perf/run", async (req, res) => {
  try {
    const parsed = RunBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: "INVALID_PERF_REQUEST",
          message: parsed.error.issues.map((issue) => issue.message).join("; "),
        },
      });
      return;
    }
    const body = parsed.data;
    const result = await runLoadTest(body);
    res.json(PerfResultSchema.parse(result));
  } catch (err) {
    const status = err.code === "PROJECT_NOT_RUNNING" || err.code === "ACTIVE_PROJECT_CHANGED" ? 409
      : err.code === "INVALID_PERF_ENDPOINT" || err.code === "INVALID_PERF_REQUEST" ? 400
        : 500;
    res.status(status).json({ error: { code: err.code ?? "PERF_FAILED", message: err.message } });
  }
});

/**
 * Return the most recent load-test result.
 */
perfRouter.get("/perf/last", (req, res) => {
  try {
    const last = getLastRun();
    if (last === null) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "No perf runs yet" } });
      return;
    }
    res.json(PerfResultSchema.parse(last));
  } catch (err) {
    res.status(500).json({ error: { code: "PERF_FAILED", message: err.message } });
  }
});

/**
 * Analyze only the most recently measured performance result.
 */
perfRouter.post("/perf/analyze", async (req, res) => {
  try {
    const result = getLastRun();
    if (result === null || result.project !== getActiveSubdir()) {
      res.status(409).json({ error: { code: "NO_PERF_RESULTS", message: "Run a performance test before requesting AI analysis." } });
      return;
    }
    const analysis = await requestAI({
      task: "analyze_perf",
      context: { measuredResult: result },
    });
    res.json(AIPerfAnalysisSchema.parse(analysis));
  } catch (err) {
    sendAIError(res, err, "PERF_ANALYSIS_FAILED");
  }
});
