import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { WORKSPACE_DIR } from "../config.js";
import { AISolutionSchema } from "../models.js";
import { getActiveSubdir, readFile, safePath, writeFile } from "./sandbox.js";
import { requestAI } from "./aiService.js";

const proposals = new Map();
const SECRET_FILE = /(^|\/)\.env(?:\.|$)|(^|\/)id_rsa(?:\.|$)/i;

/**
 * Request a fix proposal for a supplied code excerpt and error.
 * @param {{ file: string, code: string, error: string }} input Context from the developer.
 * @returns {Promise<import("../models.js").AISolution>} Reviewable proposal.
 */
export async function generateSolution(input) {
  const active = getActiveSubdir();
  const file = normalizeProjectFile(input.file);
  const relPath = `${active}/${file}`;
  if (SECRET_FILE.test(file)) {
    throw aiError("AI_INVALID_REQUEST", "Secret or environment files cannot be sent to the AI provider.");
  }
  await safePath(relPath);
  const current = await readFile(relPath);
  const result = await requestAI({
    task: "fix",
    context: {
      project: active,
      file,
      code: input.code,
      error: input.error,
    },
  });
  const proposalId = randomUUID();
  const parsedProposal = AISolutionSchema.safeParse({
    proposalId,
    file,
    originalCode: result.originalCode,
    proposedCode: result.proposedCode,
    unifiedDiff: makeDiff(file, result.originalCode, result.proposedCode),
    explanation: result.explanation,
    rationaleSteps: result.rationaleSteps,
    risk: result.risk,
  });
  if (!parsedProposal.success) {
    throw aiError("AI_INVALID_RESPONSE", "The AI response did not match the fix proposal format.");
  }
  const proposal = parsedProposal.data;
  if (
    proposal.originalCode.length === 0 ||
    proposal.proposedCode.length === 0 ||
    !input.code.includes(proposal.originalCode) ||
    !current.includes(proposal.originalCode)
  ) {
    throw aiError(
      "AI_INVALID_RESPONSE",
      "The proposed patch does not match the supplied code and current file; no change was made. Retry with the exact current source.",
    );
  }
  proposals.set(proposalId, {
    relPath,
    originalCode: proposal.originalCode,
    proposedCode: proposal.proposedCode,
    appliedContent: null,
    applied: false,
  });
  return proposal;
}

/**
 * Apply a previously reviewed proposal only after an explicit user action.
 * @param {string} proposalId Proposal identifier.
 * @returns {Promise<{ applied: true, backupPath: string }>} Apply result.
 */
export async function applySolution(proposalId) {
  const proposal = getProposal(proposalId);
  if (proposal.applied) {
    throw aiError("PATCH_CONFLICT", "This proposal has already been applied.");
  }
  const current = await readFile(proposal.relPath);
  const first = current.indexOf(proposal.originalCode);
  if (first === -1 || first !== current.lastIndexOf(proposal.originalCode)) {
    throw aiError("PATCH_CONFLICT", `The source in ${proposal.relPath} changed or the patch is ambiguous.`);
  }
  const backupPath = await safePath(`${proposal.relPath}.bak`);
  try {
    await fs.stat(backupPath);
    throw aiError("PATCH_CONFLICT", `A backup already exists for ${proposal.relPath}; preserve or revert it before applying another patch.`);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  await writeFile(`${proposal.relPath}.bak`, current);
  proposal.appliedContent =
    current.slice(0, first) + proposal.proposedCode + current.slice(first + proposal.originalCode.length);
  await writeFile(proposal.relPath, proposal.appliedContent);
  proposal.applied = true;
  return { applied: true, backupPath: `${proposal.relPath}.bak` };
}

/**
 * Revert a previously applied proposal.
 * @param {string} proposalId Proposal identifier.
 * @returns {Promise<{ reverted: true }>} Revert result.
 */
export async function revertSolution(proposalId) {
  const proposal = getProposal(proposalId);
  if (!proposal.applied) {
    throw aiError("PATCH_CONFLICT", "This proposal has not been applied.");
  }
  if (await readFile(proposal.relPath) !== proposal.appliedContent) {
    throw aiError("PATCH_CONFLICT", "The source changed after the proposal was applied. Revert was stopped to preserve those edits.");
  }
  const backup = await readFile(`${proposal.relPath}.bak`);
  await writeFile(proposal.relPath, backup);
  await fs.unlink(await safePath(`${proposal.relPath}.bak`));
  proposal.appliedContent = null;
  proposal.applied = false;
  return { reverted: true };
}

function getProposal(proposalId) {
  const proposal = proposals.get(proposalId);
  if (proposal === undefined) {
    throw aiError("PROPOSAL_NOT_FOUND", "AI proposal was not found or the backend restarted.");
  }
  return proposal;
}

function normalizeProjectFile(file) {
  if (
    typeof file !== "string" ||
    file.length === 0 ||
    file.includes("\0") ||
    /^[a-zA-Z]:/.test(file) ||
    file.startsWith("/") ||
    file.startsWith("\\")
  ) {
    throw aiError("AI_INVALID_REQUEST", "File must be a relative path inside the active project.");
  }
  const normalized = file.replace(/\\/g, "/");
  const segments = normalized.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw aiError("AI_INVALID_REQUEST", "File must be a normalized path inside the active project.");
  }
  const root = path.resolve(WORKSPACE_DIR, getActiveSubdir());
  const target = path.resolve(root, ...segments);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw aiError("AI_INVALID_REQUEST", "File must be inside the active project.");
  }
  return segments.join("/");
}

function makeDiff(file, originalCode, proposedCode) {
  return [
    `--- a/${file}`,
    `+++ b/${file}`,
    "@@",
    ...originalCode.split(/\r?\n/).map((line) => `-${line}`),
    ...proposedCode.split(/\r?\n/).map((line) => `+${line}`),
  ].join("\n");
}

function aiError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}
