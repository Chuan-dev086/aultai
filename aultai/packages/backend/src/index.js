import express from "express";
import cors from "cors";
import { PORT } from "./config.js";
import { graphRouter } from "./routes/graph.js";
import { analysisRouter } from "./routes/analysis.js";

export const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", graphRouter);
app.use("/api", analysisRouter);

if (process.argv[1] !== undefined && import.meta.url.endsWith("index.js")) {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`AultAI backend listening on port ${PORT}`);
  });
}
