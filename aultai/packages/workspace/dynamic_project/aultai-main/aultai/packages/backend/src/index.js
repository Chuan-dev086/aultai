import express from "express";
import cors from "cors";
import { PORT } from "./config.js";
import { graphRouter } from "./routes/graph.js";
import { analysisRouter } from "./routes/analysis.js";
import { fixesRouter } from "./routes/fixes.js";
import { testsRouter } from "./routes/tests.js";
import { perfRouter } from "./routes/perf.js";
import { projectRouter } from "./routes/project.js";
import { getShopApiPort, shopApiProxy, startShopApi } from "./services/shopApiProcess.js";

export const app = express();

app.use(cors());

// Full-Stack Preview: the shop-api demo runs in its own child process and is
// proxied here, so the Preview tab works through a single server on :3000.
// The proxies are mounted before express.json() so request bodies pass through.
app.use("/preview", shopApiProxy("/preview"));
app.use("/shop-api", shopApiProxy(""));

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

if (process.argv[1] !== undefined && import.meta.url.endsWith("index.js")) {
  const server = app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`AultAI backend listening on port ${PORT}`);
    startShopApi()
      .then(() => {
        // eslint-disable-next-line no-console
        console.log(`shop-api demo running on port ${getShopApiPort()} (proxied at /shop-api and /preview)`);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error(`shop-api demo failed to start: ${err.message}`);
      });
  });
  server.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error(
      err.code === "EADDRINUSE" || err.code === "EACCES"
        ? `Port ${PORT} is not available. Close the other program using it, or start with a different port, e.g. PORT=4000.`
        : `Server error: ${err.message}`,
    );
    process.exit(1);
  });
}
