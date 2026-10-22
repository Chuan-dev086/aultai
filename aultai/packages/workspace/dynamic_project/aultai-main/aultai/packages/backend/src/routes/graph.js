import { Router } from "express";
import { buildGraph } from "../services/graphBuilder.js";
import { GraphResponseSchema, NodeDetailSchema, ProjectInfoSchema } from "../models.js";

export const graphRouter = Router();

/**
 * Summarize the project: files plus node/edge counts.
 */
graphRouter.get("/project/load", async (req, res) => {
  try {
    const { nodes, edges, files } = await buildGraph();
    const info = ProjectInfoSchema.parse({
      files: files.map((f) => ({ path: f.path, node_count: f.node_count })),
      node_count: nodes.length,
      edge_count: edges.length,
    });
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: { code: "GRAPH_FAILED", message: err.message } });
  }
});

/**
 * Return the full code graph.
 */
graphRouter.get("/graph", async (req, res) => {
  try {
    const { nodes, edges } = await buildGraph();
    res.json(GraphResponseSchema.parse({ nodes, edges }));
  } catch (err) {
    res.status(500).json({ error: { code: "GRAPH_FAILED", message: err.message } });
  }
});

/**
 * Return a single node with its callers and callees.
 */
graphRouter.get("/node/:id", async (req, res) => {
  try {
    const { nodes, edges } = await buildGraph();
    const node = nodes.find((n) => n.id === req.params.id);
    if (node === undefined) {
      res.status(404).json({
        error: { code: "NOT_FOUND", message: `Node not found: ${req.params.id}` },
      });
      return;
    }
    const callers = edges.filter((e) => e.type === "calls" && e.target === node.id).map((e) => e.source);
    const callees = edges.filter((e) => e.type === "calls" && e.source === node.id).map((e) => e.target);
    res.json(NodeDetailSchema.parse({ ...node, callers, callees }));
  } catch (err) {
    res.status(500).json({ error: { code: "GRAPH_FAILED", message: err.message } });
  }
});
