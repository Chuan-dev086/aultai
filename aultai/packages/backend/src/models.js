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

/**
 * @typedef {Object} GeneratedTestCase
 * @property {string} name
 * @property {string} code
 */

/**
 * @typedef {Object} GenerateTestsResponse
 * @property {GeneratedTestCase[]} tests
 * @property {"live" | "mock"} mode
 */

/**
 * @typedef {Object} SingleTestResult
 * @property {string} name
 * @property {"passed" | "failed"} status
 * @property {number} duration_ms
 * @property {string | null} error
 */

/**
 * @typedef {Object} TestRunResult
 * @property {number} total
 * @property {number} passed
 * @property {number} failed
 * @property {number} duration_ms
 * @property {SingleTestResult[]} tests
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

export const AISolutionRequestSchema = z.object({
  file: z.string().min(1).max(512),
  code: z.string().min(1).max(30000),
  error: z.string().min(1).max(8000),
});

export const AISolutionSchema = z.object({
  proposalId: z.string(),
  file: z.string(),
  originalCode: z.string().min(1),
  proposedCode: z.string().min(1),
  unifiedDiff: z.string(),
  explanation: z.string(),
  rationaleSteps: z.array(z.string()),
  risk: z.enum(["low", "medium", "high"]),
});

export const AITestExplanationSchema = z.object({
  summary: z.string(),
  failure_explanations: z.array(
    z.object({
      testName: z.string(),
      explanation: z.string(),
    }),
  ),
});

export const AIPerfAnalysisSchema = z.object({
  summary: z.string(),
  recommendations: z.array(z.string()),
});

export const ApplyResponseSchema = z.object({
  applied: z.literal(true),
  backupPath: z.string(),
});

export const RevertResponseSchema = z.object({
  reverted: z.literal(true),
});

export const GeneratedTestCaseSchema = z.object({
  name: z.string(),
  code: z.string(),
});

export const GenerateTestsResponseSchema = z.object({
  tests: z.array(GeneratedTestCaseSchema),
  mode: z.enum(["live", "mock"]),
});

export const SingleTestResultSchema = z.object({
  name: z.string(),
  status: z.enum(["passed", "failed"]),
  duration_ms: z.number(),
  error: z.string().nullable(),
});

export const TestRunResultSchema = z.object({
  total: z.number(),
  passed: z.number(),
  failed: z.number(),
  duration_ms: z.number(),
  tests: z.array(SingleTestResultSchema),
});

/**
 * @typedef {Object} PerfLatency
 * @property {number} p50
 * @property {number} p95
 * @property {number} p99
 */

/**
 * @typedef {Object} PerfResult
 * @property {string} id
 * @property {"shop-api" | "dynamic_project"} project
 * @property {string} endpoint
 * @property {number} concurrency
 * @property {number} duration
 * @property {number} rps
 * @property {PerfLatency} latency
 * @property {number} totalRequests
 * @property {number} errors
 * @property {number} errorRate
 * @property {string} timestamp
 */

export const PerfLatencySchema = z.object({
  p50: z.number(),
  p95: z.number(),
  p99: z.number(),
});

export const PerfResultSchema = z.object({
  id: z.string(),
  project: z.enum(["shop-api", "dynamic_project"]),
  endpoint: z.string(),
  concurrency: z.number(),
  duration: z.number(),
  rps: z.number(),
  latency: PerfLatencySchema,
  totalRequests: z.number(),
  errors: z.number(),
  errorRate: z.number(),
  timestamp: z.string(),
});
