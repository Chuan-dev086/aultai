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
