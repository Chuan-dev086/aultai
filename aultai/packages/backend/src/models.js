import { z } from "zod";

/**
 * @typedef {Object} Node
 * @property {string} id
 * @property {string} type
 * @property {string} [name]
 * @property {string} [file]
 * @property {number} [lineno]
 * @property {number} [end_lineno]
 * @property {string} [signature]
 * @property {string | null} [docstring]
 * @property {string} [source]
 * @property {number} [depth]
 */

/**
 * @typedef {Object} Edge
 * @property {string} source
 * @property {string} target
 * @property {string} type
 */

/**
 * @typedef {Object} GraphResponse
 * @property {Node[]} nodes
 * @property {Edge[]} edges
 */

/**
 * @typedef {Object} NodeDetail
 * @property {string} id
 * @property {string} type
 * @property {string[]} callers
 * @property {string[]} callees
 */

/**
 * @typedef {Object} ProjectInfo
 * @property {{ path: string, node_count: number }[]} files
 * @property {number} node_count
 * @property {number} edge_count
 */

/**
 * @typedef {Object} Issue
 * @property {string} id
 * @property {string} title
 * @property {"low" | "medium" | "high"} severity
 * @property {string} node_id
 * @property {string} file
 * @property {number} lineno
 * @property {string} evidence
 * @property {string} explanation
 * @property {string} suggested_action
 */

/**
 * @typedef {Object} AnalyzeResponse
 * @property {Issue[]} issues
 * @property {"live" | "mock"} mode
 */

/**
 * @typedef {Object} FixProposal
 * @property {string} id
 * @property {string} issueId
 * @property {string} file
 * @property {string} originalCode
 * @property {string} proposedCode
 * @property {string} unifiedDiff
 * @property {string} explanation
 * @property {string[]} rationaleSteps
 * @property {string[]} impactedNodes
 * @property {"low" | "medium" | "high"} risk
 */

/**
 * @typedef {Object} ApplyResponse
 * @property {boolean} applied
 * @property {string} backupPath
 */

/**
 * @typedef {Object} RevertResponse
 * @property {boolean} reverted
 */

export const NodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string().optional(),
  file: z.string().optional(),
  lineno: z.number().optional(),
  end_lineno: z.number().optional(),
  signature: z.string().optional(),
  docstring: z.string().nullable().optional(),
  source: z.string().optional(),
  depth: z.number().optional(),
});

export const EdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  type: z.string(),
});

export const GraphResponseSchema = z.object({
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
});

export const NodeDetailSchema = NodeSchema.extend({
  callers: z.array(z.string()),
  callees: z.array(z.string()),
});

export const ProjectInfoSchema = z.object({
  files: z.array(
    z.object({
      path: z.string(),
      node_count: z.number(),
    }),
  ),
  node_count: z.number(),
  edge_count: z.number(),
});

export const IssueSchema = z.object({
  id: z.string(),
  title: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  node_id: z.string(),
  file: z.string(),
  lineno: z.number(),
  evidence: z.string(),
  explanation: z.string(),
  suggested_action: z.string(),
});

export const AnalyzeResponseSchema = z.object({
  issues: z.array(IssueSchema),
  mode: z.enum(["live", "mock"]),
});

export const FixProposalSchema = z.object({
  id: z.string(),
  issueId: z.string(),
  file: z.string(),
  originalCode: z.string(),
  proposedCode: z.string(),
  unifiedDiff: z.string(),
  explanation: z.string(),
  rationaleSteps: z.array(z.string()),
  impactedNodes: z.array(z.string()),
  risk: z.enum(["low", "medium", "high"]),
});

export const ApplyResponseSchema = z.object({
  applied: z.literal(true),
  backupPath: z.string(),
});

export const RevertResponseSchema = z.object({
  reverted: z.literal(true),
});
