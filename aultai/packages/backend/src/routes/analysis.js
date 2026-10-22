import { Router } from "express";
import { analyzeProject, explainNode } from "../services/analyzer.js";
import { AnalyzeResponseSchema } from "../models.js";
import { z } from "zod";
import { sendAIError } from "./aiErrors.js";

export const analysisRouter = Router();

/**
 * Run project analysis (heuristics + LLM pass).
 */
analysisRouter.post("/analyze", async (req, res) => {
  try {
    const { issues, mode } = await analyzeProject();
    res.json(AnalyzeResponseSchema.parse({ issues, mode }));
  } catch (err) {
    sendAIError(res, err, "ANALYZE_FAILED");
  }
});

/**
 * Explain a single graph node.
 */
analysisRouter.post("/node/:id/explain", async (req, res) => {
  try {
    const params = z.object({ id: z.string() }).parse(req.params);
    res.json(await explainNode(params.id));
  } catch (err) {
    if (err.code === "NOT_FOUND") {
      res.status(404).json({
        error: { code: "NOT_FOUND", message: `Node not found: ${req.params.id}` },
      });
      return;
    }
    sendAIError(res, err, "EXPLAIN_FAILED");
  }
});
