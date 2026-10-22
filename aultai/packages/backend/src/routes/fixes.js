import { Router } from "express";
import { z } from "zod";
import { generateFix, applyFix, revertFix } from "../services/fixer.js";
import { FixProposalSchema } from "../models.js";

export const fixesRouter = Router();

const IssueIdBody = z.object({ issueId: z.string() });

/**
 * Generate a fix proposal for an issue (no files touched).
 */
fixesRouter.post("/fix", async (req, res) => {
  try {
    const { issueId } = IssueIdBody.parse(req.body);
    const proposal = await generateFix(issueId);
    res.json(FixProposalSchema.parse(proposal));
  } catch (err) {
    res.status(500).json({ error: { code: "FIX_FAILED", message: err.message } });
  }
});

/**
 * Apply a fix: backup + patch the workspace file (explicit user action).
 */
fixesRouter.post("/fix/apply", async (req, res) => {
  try {
    const { issueId } = IssueIdBody.parse(req.body);
    const result = await applyFix(issueId);
    res.json(result);
  } catch (err) {
    if (err.code === "PATCH_CONFLICT") {
      res.status(400).json({ error: { code: "PATCH_CONFLICT", message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: "APPLY_FAILED", message: err.message } });
  }
});

/**
 * Revert a fix: restore the .bak over the workspace file.
 */
fixesRouter.post("/fix/revert", async (req, res) => {
  try {
    const { issueId } = IssueIdBody.parse(req.body);
    const result = await revertFix(issueId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: { code: "REVERT_FAILED", message: err.message } });
  }
});
