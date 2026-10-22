import { Router } from "express";
import { promises as fs } from "node:fs";
import multer from "multer";
import {
  uploadProject,
  installDeps,
  startProject,
  stopProject,
  switchToShopApi,
  projectStatus,
} from "../services/projectManager.js";

export const projectRouter = Router();

const upload = multer({
  dest: `${process.cwd()}/.upload-tmp`,
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
});

/**
 * Upload a .zip project, extract it, then install deps asynchronously.
 */
projectRouter.post("/project/upload", upload.single("file"), async (req, res) => {
  try {
    if (req.file === undefined) {
      res.status(400).json({ error: { code: "NO_FILE", message: "No file uploaded" } });
      return;
    }
    if (!req.file.originalname.endsWith(".zip")) {
      res.status(400).json({ error: { code: "NOT_ZIP", message: "Only .zip files are accepted" } });
      return;
    }
    const info = await uploadProject(req.file.path);
    await fs.unlink(req.file.path).catch(() => {});
    installDeps()
      .then(() => {})
      .catch(() => {});
    res.json({ success: true, message: `${info.message} Installing dependencies in the background.`, path: info.path });
  } catch (err) {
    res.status(500).json({ error: { code: err.code ?? "UPLOAD_FAILED", message: err.message } });
  }
});

/**
 * Start the uploaded project in the background on port 3001.
 */
projectRouter.post("/project/start", async (req, res) => {
  try {
    const { port, pid } = await startProject();
    res.json({ port, pid: pid ?? null });
  } catch (err) {
    res.status(500).json({ error: { code: err.code ?? "START_FAILED", message: err.message } });
  }
});

/**
 * Stop the background dynamic project.
 */
projectRouter.post("/project/stop", (req, res) => {
  try {
    res.json(stopProject());
  } catch (err) {
    res.status(500).json({ error: { code: "STOP_FAILED", message: err.message } });
  }
});

/**
 * Switch the active workspace back to the bundled shop-api.
 */
projectRouter.post("/project/switch", (req, res) => {
  try {
    res.json(switchToShopApi());
  } catch (err) {
    res.status(500).json({ error: { code: "SWITCH_FAILED", message: err.message } });
  }
});

/**
 * Current project-manager status.
 */
projectRouter.get("/project/status", (req, res) => {
  res.json(projectStatus());
});
