import { useEffect, useState } from "react";
import {
  activateUploadedProject,
  deleteUploadedProject,
  fetchUploadedProjects,
  startUploadedProject,
} from "../api/client.js";

/**
 * Header menu for reviewing and removing saved project uploads.
 * @param {(info: { name: string, port: number | null }) => Promise<void>} props.onProjectChange
 * @returns {import("react").JSX.Element}
 */
export default function UploadedProjectManager({ onProjectChange }) {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [opening, setOpening] = useState(null);
  const [error, setError] = useState(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchUploadedProjects();
      setProjects(result.projects);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) void refresh();
  }, [open]);

  async function onDelete(project) {
    const confirmed = window.confirm(
      `Permanently delete "${project.name}" (${project.id}) and all its files? This cannot be undone.`,
    );
    if (!confirmed) return;
    setDeleting(project.id);
    setError(null);
    try {
      const result = await deleteUploadedProject(project.id);
      await refresh();
      if (result.workspaceChanged) {
        await onProjectChange({ name: result.active, port: null });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(null);
    }
  }

  async function onOpen(project, start) {
    setOpening(project.id);
    setError(null);
    try {
      await activateUploadedProject(project.id);
      await refresh();
      let info = { name: "dynamic_project", port: null, previewPort: null };
      if (start) {
        try {
          const result = await startUploadedProject();
          info = {
            name: "dynamic_project",
            port: result.port,
            previewPort: result.previewPort,
          };
        } catch (err) {
          await onProjectChange(info);
          throw new Error(`Project opened, but could not start: ${err.message}`);
        }
      }
      await onProjectChange(info);
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setOpening(null);
    }
  }

  return (
    <div className="relative ml-auto">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="shrink-0 rounded border border-slate-700 bg-slate-800 px-3 py-1 text-sm text-white hover:bg-slate-700"
      >
        Uploaded Projects
      </button>
      {open && (
        <section
          aria-label="Uploaded projects"
          className="absolute right-0 top-full z-50 mt-2 w-[min(26rem,calc(100vw-2rem))] rounded border border-slate-700 bg-slate-900 p-3 shadow-xl"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-100">Uploaded projects</h2>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              className="rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          {error !== null && (
            <p role="alert" className="mb-2 rounded border border-red-900 bg-red-950 p-2 text-xs text-red-300">
              {error}
            </p>
          )}
          {deleting !== null && (
            <p role="status" className="mb-2 text-xs text-slate-400">
              Removing the project. Windows may take a few seconds to release files that are in use.
            </p>
          )}
          {!loading && projects.length === 0 && (
            <p className="text-xs text-slate-400">No uploaded projects found.</p>
          )}
          <ul className="max-h-80 space-y-2 overflow-y-auto">
            {projects.map((project) => (
              <li key={project.id} className="rounded border border-slate-800 p-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-all text-sm font-medium text-slate-100">{project.name}</p>
                    <p className="break-all font-mono text-[10px] text-slate-500">{project.id}</p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      Uploaded {new Date(project.uploadedAt).toLocaleString()}
                      {project.current && <span className="ml-2 text-indigo-300">Current upload</span>}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void onOpen(project, false)}
                    disabled={opening !== null || deleting !== null || project.current}
                    className="rounded bg-indigo-700 px-2 py-1 text-xs text-white hover:bg-indigo-600 disabled:opacity-50"
                  >
                    {opening === project.id ? "Opening…" : project.current ? "Current" : "Open"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void onOpen(project, true)}
                    disabled={opening !== null || deleting !== null}
                    className="rounded bg-green-700 px-2 py-1 text-xs text-white hover:bg-green-600 disabled:opacity-50"
                  >
                    {opening === project.id ? "Opening…" : "Open & Start"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDelete(project)}
                    disabled={deleting !== null || opening !== null}
                    className="ml-auto rounded bg-red-900 px-2 py-1 text-xs text-red-100 hover:bg-red-800 disabled:opacity-50"
                  >
                    {deleting === project.id ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[10px] text-slate-500">
            Deleting permanently removes the upload and its installed dependencies.
          </p>
        </section>
      )}
    </div>
  );
}
