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
  listUploadedProjects,
  activateUploadedProject,
  deleteUploadedProject,
} from "../services/projectManager.js";

export const projectRouter = Router();

const upload = multer({
  dest: `${process.cwd()}/.upload-tmp`,
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
});

function parseUploadedFile(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (err) {
      const tooLarge = err.code === "LIMIT_FILE_SIZE";
      res.status(tooLarge ? 413 : 400).json({
        error: {
          code: err.code ?? "INVALID_UPLOAD",
          message: tooLarge ? "Upload exceeds the 50 MB limit" : err.message,
        },
      });
      return;
    }
    next();
  });
}

/**
 * Upload a .zip project, extract it, and install dependencies.
 */
projectRouter.post("/project/upload", parseUploadedFile, async (req, res) => {
  if (req.file === undefined) {
    res.status(400).json({ error: { code: "NO_FILE", message: "No file uploaded" } });
    return;
  }
  try {
    if (!req.file.originalname.toLowerCase().endsWith(".zip")) {
      res.status(400).json({ error: { code: "NOT_ZIP", message: "Only .zip files are accepted" } });
      return;
    }
    const info = await uploadProject(req.file.path);
    await installDeps();
    res.json({ success: true, message: "Project uploaded and dependencies installed.", path: info.path });
  } catch (err) {
    res.status(500).json({ error: { code: err.code ?? "UPLOAD_FAILED", message: err.message } });
  } finally {
    try {
      await fs.unlink(req.file.path);
    } catch (err) {
      if (err.code !== "ENOENT") {
        console.error(`[project] failed to remove upload temp file: ${err.message}`);
      }
    }
  }
});

/**
 * Start the uploaded project in the background on port 3001.
 */
projectRouter.post("/project/start", async (req, res) => {
  try {
    const { port, previewPort, pid } = await startProject();
    res.json({ port, previewPort, pid: pid ?? null });
  } catch (err) {
    res.status(500).json({ error: { code: err.code ?? "START_FAILED", message: err.message } });
  }
});

/**
 * Stop the background dynamic project.
 */
projectRouter.post("/project/stop", async (req, res) => {
  try {
    res.json(await stopProject());
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

/**
 * List uploaded projects managed by AultAI.
 */
projectRouter.get("/project/uploads", async (_req, res) => {
  try {
    res.json({ projects: await listUploadedProjects() });
  } catch (err) {
    res.status(500).json({ error: { code: "PROJECT_LIST_FAILED", message: err.message } });
  }
});

/**
 * Activate one saved upload as the current workspace.
 */
projectRouter.post("/project/uploads/:id/open", async (req, res) => {
  try {
    res.json(await activateUploadedProject(req.params.id));
  } catch (err) {
    const status = err.code === "INVALID_PROJECT_ID" ? 400
      : err.code === "PROJECT_NOT_FOUND" ? 404
        : 500;
    res.status(status).json({ error: { code: err.code ?? "PROJECT_OPEN_FAILED", message: err.message } });
  }
});

/**
 * Delete a selected uploaded project directory.
 */
projectRouter.delete("/project/uploads/:id", async (req, res) => {
  try {
    res.json(await deleteUploadedProject(req.params.id));
  } catch (err) {
    const status = err.code === "INVALID_PROJECT_ID" ? 400
      : err.code === "PROJECT_NOT_FOUND" ? 404
        : 500;
    res.status(status).json({ error: { code: err.code ?? "PROJECT_DELETE_FAILED", message: err.message } });
  }
});
