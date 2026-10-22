import { useState } from "react";

/**
 * PreviewLab — live iframe of the active project plus a note.
 * @param {object} props
 * @param {string} props.projectName Active project ("shop-api" or "dynamic_project").
 * @param {number | null} props.previewPort Port of the running dynamic app, if any.
 * @returns {import("react").JSX.Element} The preview lab panel.
 */
export default function PreviewLab({ projectName, previewPort }) {
  const [reloadKey, setReloadKey] = useState(0);
  const dynamic = projectName !== "shop-api" && previewPort !== null;
  // Relative URL so it works through the Vite proxy, whatever port the backend uses.
  const src = dynamic ? `http://localhost:${previewPort}` : "/preview/";
  return (
    <div className="flex h-full gap-4 p-4">
      <div className="w-[60%] shrink-0">
        <iframe
          key={reloadKey}
          title="project preview"
          src={src}
          className="h-full min-h-[480px] w-full rounded border border-slate-700 bg-white"
        />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          API Inspector
        </h3>
        <p className="font-mono text-xs text-slate-200">
          Current Project: {projectName === "shop-api" ? "shop-api" : "Uploaded"}
        </p>
        <p className="mt-1 text-sm text-slate-300">
          Interact with the checkout below to see the BUG 1 and BUG 2 in real-time.
        </p>
        <p className="mt-2 font-mono text-xs text-slate-500">
          Preview: {src}
          <br />
          Checkout: POST /cart/checkout
        </p>
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          className="mt-3 rounded bg-slate-700 px-3 py-1 text-sm text-white hover:bg-slate-600"
        >
          Reload preview
        </button>
      </div>
    </div>
  );
}
