import { Router } from "express";
import { buildGraph } from "../services/graphBuilder.js";
import { GraphResponseSchema, NodeDetailSchema, ProjectInfoSchema } from "../models.js";
import { getActiveSubdir, readFile } from "../services/sandbox.js";
import { discoverEndpoints } from "../services/endpoints.js";

export const graphRouter = Router();

const MAX_AI_FILE_CHARS = 30000;
const SOURCE_FILE_EXTENSION = /\.(?:c|m)?(?:j|t)sx?$/i;

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
 * Discover statically declared API endpoints in the active project.
 */
graphRouter.get("/project/endpoints", async (req, res) => {
  try {
    res.json({ endpoints: await discoverEndpoints() });
  } catch (err) {
    res.status(500).json({
      error: { code: "ENDPOINT_DISCOVERY_FAILED", message: err.message },
    });
  }
});

/**
 * Read a source file from the active project for the AI Solution workbench.
 */
graphRouter.get("/project/file", async (req, res) => {
  const active = getActiveSubdir();
  const file = typeof req.query.path === "string" ? req.query.path : "";
  const normalized = file.replace(/\\/g, "/");
  if (
    normalized === "" ||
    normalized.includes("\0") ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized) ||
    normalized.split("/").some((segment) => segment === "" || segment === "." || segment === "..") ||
    !SOURCE_FILE_EXTENSION.test(normalized)
  ) {
    res.status(400).json({ error: { code: "INVALID_FILE", message: "Choose a JavaScript or TypeScript source file inside the active project." } });
    return;
  }

  try {
    const content = await readFile(`${active}/${normalized}`);
    if (content.length > MAX_AI_FILE_CHARS) {
      res.status(413).json({
        error: {
          code: "FILE_TOO_LARGE",
          message: `This file is over ${MAX_AI_FILE_CHARS.toLocaleString()} characters. Choose a smaller file or paste the relevant excerpt manually.`,
        },
      });
      return;
    }
    res.json({ file: normalized, code: content });
  } catch (err) {
    const status = err.code === "ENOENT" ? 404 : 400;
    res.status(status).json({
      error: {
        code: err.code === "ENOENT" ? "FILE_NOT_FOUND" : "INVALID_FILE",
        message: err.code === "ENOENT" ? "That source file was not found in the active project." : err.message,
      },
    });
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
