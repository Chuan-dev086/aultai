import { useEffect, useState } from "react";
import {
  uploadProject,
  startUploadedProject,
  stopUploadedProject,
  switchToShopApi,
  fetchProjectStatus,
} from "../api/client.js";

/**
 * ProjectUploader — upload a .zip Node project, install, start/stop it.
 * @param {object} props
 * @param {(info: { name: string, port: number | null }) => void} props.onProjectChange
 * @returns {import("react").JSX.Element} The uploader panel.
 */
export default function ProjectUploader({ onProjectChange }) {
  const [file, setFile] = useState(null);
  const [phase, setPhase] = useState("idle");
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);

  function selectZip(candidate) {
    if (candidate === undefined || candidate === null) {
      setFile(null);
      return;
    }
    if (!candidate.name.toLowerCase().endsWith(".zip")) {
      setFile(null);
      setError(new Error("Only .zip files are accepted."));
      return;
    }
    setError(null);
    setFile(candidate);
  }

  useEffect(() => {
    let cancelled = false;
    fetchProjectStatus()
      .then((s) => {
        if (!cancelled) {
          setStatus(s);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Upload the selected zip (extraction + background install on the server).
   * @returns {Promise<void>}
   */
  async function onUpload() {
    if (file === null) {
      return;
    }
    setPhase("uploading");
    setError(null);
    setMessage(null);
    try {
      const out = await uploadProject(file);
      setMessage(out.message);
      setPhase("uploaded");
      onProjectChange({ name: "dynamic_project", port: null });
      try {
        setStatus(await fetchProjectStatus());
      } catch (err) {
        setError(new Error(`Project uploaded, but its status could not be refreshed: ${err.message}`));
      }
    } catch (err) {
      setError(err);
      setPhase("idle");
    }
  }

  /**
   * Start the uploaded project on port 3001.
   * @returns {Promise<void>}
   */
  async function onStart() {
    setPhase("starting");
    setError(null);
    try {
      const out = await startUploadedProject();
      setMessage(`Running on port ${out.port} (pid ${out.pid ?? "?"})`);
      setPhase("running");
      setStatus({ active: "dynamic_project", port: out.port, running: true });
      onProjectChange({ name: "dynamic_project", port: out.port });
    } catch (err) {
      setError(err);
      setPhase("uploaded");
    }
  }

  /**
   * Stop the background project.
   * @returns {Promise<void>}
   */
  async function onStop() {
    setError(null);
    try {
      await stopUploadedProject();
      setMessage("Dynamic project stopped.");
      setPhase("uploaded");
      setStatus({ active: "dynamic_project", port: 3001, running: false });
      onProjectChange({ name: "dynamic_project", port: null });
    } catch (err) {
      setError(err);
    }
  }

  /**
   * Switch back to the bundled shop-api workspace.
   * @returns {Promise<void>}
   */
  async function onSwitchBack() {
    setError(null);
    try {
      await stopUploadedProject();
      const out = await switchToShopApi();
      setMessage(`Active workspace: ${out.active}`);
      setPhase("idle");
      setFile(null);
      setStatus({ active: "shop-api", port: 3000, running: false });
      onProjectChange({ name: "shop-api", port: null });
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Current Project
        </h3>
        <p className="font-mono text-sm text-slate-200">
          {(status?.active ?? "shop-api") + (status?.running ? ` (running :${status.port})` : "")}
        </p>
      </div>
      <label
        onDragOver={(ev) => ev.preventDefault()}
        onDrop={(ev) => {
          ev.preventDefault();
          const dropped = ev.dataTransfer.files?.[0];
          if (dropped !== undefined) {
            selectZip(dropped);
          }
        }}
        className="flex cursor-pointer flex-col items-center gap-2 rounded border border-dashed border-slate-600 bg-slate-900 p-6 text-center"
      >
        <span className="text-sm text-slate-300">
          {file === null ? "Drag a .zip here or click to choose" : file.name}
        </span>
        <input
          type="file"
          accept=".zip"
          className="hidden"
          onChange={(ev) => selectZip(ev.target.files?.[0])}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onUpload}
          disabled={file === null || phase === "uploading"}
          className="rounded bg-indigo-700 px-3 py-1 text-sm text-white hover:bg-indigo-600 disabled:opacity-50"
        >
          {phase === "uploading" ? "Uploading…" : "Upload & Install"}
        </button>
        {(phase === "uploaded" || phase === "running") && (
          <button
            type="button"
            onClick={onStart}
            disabled={phase === "starting" || phase === "running"}
            className="rounded bg-green-700 px-3 py-1 text-sm text-white hover:bg-green-600 disabled:opacity-50"
          >
            {phase === "starting" ? "Starting…" : "Start App"}
          </button>
        )}
        {phase === "running" && (
          <button
            type="button"
            onClick={onStop}
            className="rounded bg-amber-700 px-3 py-1 text-sm text-white hover:bg-amber-600"
          >
            Stop App
          </button>
        )}
        <button
          type="button"
          onClick={onSwitchBack}
          disabled={phase === "uploading" || phase === "starting"}
          className="rounded bg-slate-700 px-3 py-1 text-sm text-white hover:bg-slate-600"
        >
          Back to shop-api
        </button>
      </div>
      {message !== null && <p className="text-sm text-slate-300">{message}</p>}
      {error !== null && (
        <p className="rounded border border-red-900 bg-red-950 p-2 font-mono text-xs text-red-300">
          {error.message}
        </p>
      )}
    </div>
  );
}
