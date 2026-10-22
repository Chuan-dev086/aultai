import { Router } from "express";
import { z } from "zod";
import { runLoadTest, getLastRun } from "../services/perf.js";
import { PerfResultSchema } from "../models.js";

export const perfRouter = Router();

const RunBody = z.object({
  endpoint: z.string().optional(),
  method: z.string().optional(),
  payload: z.unknown().optional(),
  concurrency: z.number().optional(),
  duration: z.number().optional(),
});

/**
 * Run a load test against the local backend.
 */
perfRouter.post("/perf/run", async (req, res) => {
  try {
    const body = RunBody.parse(req.body ?? {});
    const result = await runLoadTest(body);
    res.json(PerfResultSchema.parse(result));
  } catch (err) {
    res.status(500).json({ error: { code: "PERF_FAILED", message: err.message } });
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
