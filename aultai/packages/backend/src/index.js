import express from "express";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { PORT, WORKSPACE_DIR } from "./config.js";
import { graphRouter } from "./routes/graph.js";
import { analysisRouter } from "./routes/analysis.js";
import { fixesRouter } from "./routes/fixes.js";
import { testsRouter } from "./routes/tests.js";
import { perfRouter } from "./routes/perf.js";
import { projectRouter } from "./routes/project.js";
import { aiRouter } from "./routes/ai.js";
import {
  startShopApi,
  stopShopApi,
  forceStopShopApi,
  watchShopApiSource,
  SHOP_API_PORT,
} from "./services/shopApiProcess.js";

export const app = express();

const LOCAL_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

app.use("/api", (req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD") {
    next();
    return;
  }
  const origin = req.get("origin");
  const fetchSite = req.get("sec-fetch-site");
  if (
    (origin !== undefined && !LOCAL_ORIGINS.has(origin)) ||
    fetchSite === "cross-site"
  ) {
    res.status(403).json({
      error: { code: "LOCAL_ORIGIN_REQUIRED", message: "API mutations are only available to the local AultAI frontend." },
    });
    return;
  }
  next();
});

// Proxy /shop-api/* to the shop-api worker process so that applying fixes
// (which rewrites shop-api source) takes effect on the next request without
// restarting the whole backend. Must be registered before express.json()
// because the proxy forwards the raw request body untouched.
app.use("/shop-api", (req, res) => {
  const proxyReq = http.request(
    {
      hostname: "127.0.0.1",
      port: SHOP_API_PORT,
      path: req.url,
      method: req.method,
      headers: req.headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );
  proxyReq.on("error", (err) => {
    if (!res.headersSent) {
      res
        .status(502)
        .json({ error: "shop-api unavailable", detail: err.message });
    } else {
      res.destroy();
    }
  });
  req.pipe(proxyReq);
});

app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", graphRouter);
app.use("/api", analysisRouter);
app.use("/api", fixesRouter);
app.use("/api", testsRouter);
app.use("/api", perfRouter);
app.use("/api", projectRouter);
app.use("/api", aiRouter);

// Full-Stack Preview: serve the shop-api demo page from the backend so the
// Preview tab works with a single server on :3000.
app.use(
  "/preview",
  express.static(path.join(WORKSPACE_DIR, "shop-api", "public")),
);

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const workerReady = startShopApi().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(`[shop-api] failed to start: ${err.message}`);
  });

  app.listen(PORT, "127.0.0.1", () => {
    // eslint-disable-next-line no-console
    console.log(`AultAI backend listening on port ${PORT}`);
    workerReady.then(() => {
      watchShopApiSource();
    });
  });

  const shutdown = async () => {
    // eslint-disable-next-line no-console
    console.log("\nShutting down...");
    await stopShopApi();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("exit", forceStopShopApi);
}
