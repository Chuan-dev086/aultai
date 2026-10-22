import { useEffect, useState } from "react";
import { fetchProjectEndpoints } from "../api/client.js";

/**
 * PreviewLab — live, resizable iframe preview of the active project.
 * @param {object} props
 * @param {string} props.projectName Active project ("shop-api" or "dynamic_project").
 * @param {number | null} props.previewPort Port of the running dynamic frontend, if any.
 * @param {() => void} props.onStart Start the uploaded project.
 * @returns {import("react").JSX.Element} The preview lab panel.
 */
export default function PreviewLab({ projectName, previewPort, onStart }) {
  const [expanded, setExpanded] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [viewportWidth, setViewportWidth] = useState(null);
  const [endpoints, setEndpoints] = useState([]);
  const [endpointsLoading, setEndpointsLoading] = useState(true);
  const [endpointsError, setEndpointsError] = useState(null);
  const dynamic = projectName !== "shop-api";
  const src = dynamic ? `http://127.0.0.1:${previewPort}` : "http://localhost:3000/preview";
  const running = !dynamic || previewPort !== null;

  useEffect(() => {
    let cancelled = false;
    setEndpointsLoading(true);
    setEndpointsError(null);
    fetchProjectEndpoints()
      .then(({ endpoints: discovered }) => {
        if (!cancelled) {
          setEndpoints(discovered);
          setEndpointsLoading(false);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setEndpointsError(error.message);
          setEndpointsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectName]);

  return (
    <div className={`flex min-h-0 flex-col bg-slate-950 ${expanded ? "fixed inset-0 z-[60]" : "h-full"}`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-900 px-3 py-2">
        <span className="mr-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Preview
        </span>
        {[
          ["Fit", null],
          ["Mobile", 390],
          ["Tablet", 768],
          ["Desktop", 1280],
        ].map(([label, width]) => (
          <button
            key={label}
            type="button"
            onClick={() => setViewportWidth(width)}
            aria-pressed={viewportWidth === width}
            className={`rounded px-2 py-1 text-xs ${
              viewportWidth === width
                ? "bg-indigo-700 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
        <label className="ml-1 flex items-center gap-2 text-xs text-slate-400">
          Width
          <input
            aria-label="Preview width"
            type="range"
            min="320"
            max="1600"
            step="10"
            value={viewportWidth ?? 1280}
            onChange={(event) => setViewportWidth(Number(event.target.value))}
            className="w-28 accent-indigo-500"
          />
          <span className="w-12 font-mono">{viewportWidth === null ? "Fit" : `${viewportWidth}px`}</span>
        </label>
        {expanded && (
          <button
            type="button"
            onClick={() => setInspectorOpen((open) => !open)}
            aria-pressed={inspectorOpen}
            className="ml-auto rounded bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700"
          >
            {inspectorOpen ? "Hide side panel" : "Show side panel"}
          </button>
        )}
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className={`${expanded ? "" : "ml-auto"} rounded bg-indigo-700 px-2 py-1 text-xs text-white hover:bg-indigo-600`}
        >
          {expanded ? "Exit full screen" : "Full screen"}
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 items-stretch justify-center overflow-auto bg-slate-800 p-2">
          {running ? (
            <iframe
              title="project preview"
              src={src}
              className="h-full min-h-[480px] max-w-full shrink-0 border border-slate-700 bg-white"
              style={{ width: viewportWidth === null ? "100%" : `${viewportWidth}px` }}
            />
          ) : (
            <div className="flex min-h-[480px] w-full flex-col items-center justify-center gap-3 rounded border border-slate-700 bg-slate-900 p-6 text-center">
              <p className="text-sm text-slate-300">The uploaded project is installed but not running.</p>
              <button
                type="button"
                onClick={onStart}
                className="rounded bg-green-700 px-3 py-1 text-sm text-white hover:bg-green-600"
              >
                Start Project Preview
              </button>
            </div>
          )}
        </div>
        {(!expanded || inspectorOpen) && (
          <aside className="w-72 shrink-0 overflow-y-auto border-l border-slate-800 bg-slate-950 p-4">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              API Inspector
            </h3>
            <p className="font-mono text-xs text-slate-200">
              Current Project: {projectName === "shop-api" ? "shop-api" : `Uploaded${previewPort === null ? " (stopped)" : ""}`}
            </p>
            {projectName === "shop-api" && (
              <p className="mt-1 text-sm text-slate-300">
                Interact with the checkout below to see the BUG 1 and BUG 2 in real-time.
              </p>
            )}
            <p className="mt-2 break-words font-mono text-xs text-slate-500">
              {running ? `Preview: ${src}` : "Start the uploaded project to preview it."}
            </p>
            <div className="mt-5">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                API Endpoints
              </h3>
              {endpointsLoading ? (
                <p className="text-xs text-slate-500">Discovering endpoints…</p>
              ) : endpointsError !== null ? (
                <p className="text-xs text-red-400">Could not load endpoints: {endpointsError}</p>
              ) : endpoints.length === 0 ? (
                <p className="text-xs text-slate-500">No supported static endpoints found.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {endpoints.map((endpoint) => (
                    <li
                      key={`${endpoint.method}:${endpoint.path}:${endpoint.file}:${endpoint.line}`}
                      className="rounded border border-slate-800 bg-slate-900 p-2"
                    >
                      <div className="flex items-start gap-2">
                        <span className="rounded bg-indigo-950 px-1.5 py-0.5 font-mono text-[10px] font-bold text-indigo-300">
                          {endpoint.method}
                        </span>
                        <span className="break-all font-mono text-xs text-slate-200">{endpoint.path}</span>
                      </div>
                      <p className="mt-1 break-all font-mono text-[10px] text-slate-500">
                        {endpoint.file}:{endpoint.line}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
