import { Router } from "express";
import { z } from "zod";
import { AISolutionRequestSchema, AISolutionSchema } from "../models.js";
import { applySolution, generateSolution, revertSolution } from "../services/aiSolution.js";
import { sendAIError } from "./aiErrors.js";

export const aiRouter = Router();

const ProposalIdSchema = z.object({ proposalId: z.string().uuid() });

aiRouter.post("/ai/solution", async (req, res) => {
  try {
    const input = AISolutionRequestSchema.parse(req.body);
    const result = await generateSolution(input);
    res.json(AISolutionSchema.parse(result));
  } catch (err) {
    sendAIError(res, err, "AI_SOLUTION_FAILED");
  }
});

aiRouter.post("/ai/solution/apply", async (req, res) => {
  try {
    const { proposalId } = ProposalIdSchema.parse(req.body);
    res.json(await applySolution(proposalId));
  } catch (err) {
    sendAIError(res, err, "AI_APPLY_FAILED");
  }
});

aiRouter.post("/ai/solution/revert", async (req, res) => {
  try {
    const { proposalId } = ProposalIdSchema.parse(req.body);
    res.json(await revertSolution(proposalId));
  } catch (err) {
    sendAIError(res, err, "AI_REVERT_FAILED");
  }
});
