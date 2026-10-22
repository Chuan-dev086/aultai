import { Router } from "express";
import { analyzeProject, explainNode } from "../services/analyzer.js";
import { AnalyzeResponseSchema } from "../models.js";
import { z } from "zod";

export const analysisRouter = Router();

/**
 * Run project analysis (heuristics + LLM pass).
 */
analysisRouter.post("/analyze", async (req, res) => {
  try {
    const { issues, mode } = await analyzeProject();
    res.json(AnalyzeResponseSchema.parse({ issues, mode }));
  } catch (err) {
    res.status(500).json({ error: { code: "ANALYZE_FAILED", message: err.message } });
  }
});

/**
 * Explain a single graph node.
 */
analysisRouter.post("/node/:id/explain", async (req, res) => {
  try {
    const params = z.object({ id: z.string() }).parse(req.params);
    const { explanation } = await explainNode(params.id);
    res.json({ explanation });
  } catch (err) {
    if (err.code === "NOT_FOUND") {
      res.status(404).json({
        error: { code: "NOT_FOUND", message: `Node not found: ${req.params.id}` },
      });
      return;
    }
    res.status(500).json({ error: { code: "EXPLAIN_FAILED", message: err.message } });
  }
});
