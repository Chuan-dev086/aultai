import express from "express";
import cors from "cors";
import path from "node:path";
import { PORT, WORKSPACE_DIR } from "./config.js";
import { graphRouter } from "./routes/graph.js";
import { analysisRouter } from "./routes/analysis.js";
import { fixesRouter } from "./routes/fixes.js";
import { testsRouter } from "./routes/tests.js";
import { perfRouter } from "./routes/perf.js";
import { apiRouter as shopApiRouter } from "../../workspace/shop-api/src/api.js";

export const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", graphRouter);
app.use("/api", analysisRouter);
app.use("/api", fixesRouter);
app.use("/api", testsRouter);
app.use("/api", perfRouter);

// Full-Stack Preview: serve the shop-api demo page and routes from the
// AultAI backend so the Preview tab works with a single server on :3000.
// WORKSPACE_DIR is .../packages/workspace, so the public dir is
// .../packages/workspace/shop-api/public.
app.use("/preview", express.static(path.join(WORKSPACE_DIR, "shop-api", "public")));
app.use("/shop-api", shopApiRouter);

if (process.argv[1] !== undefined && import.meta.url.endsWith("index.js")) {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`AultAI backend listening on port ${PORT}`);
  });
}
