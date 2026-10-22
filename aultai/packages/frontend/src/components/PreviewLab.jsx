/**
 * PreviewLab — live iframe of the active project plus a note.
 * @param {object} props
 * @param {string} props.projectName Active project ("shop-api" or "dynamic_project").
 * @param {number | null} props.previewPort Port of the running dynamic frontend, if any.
 * @param {() => void} props.onStart Start the uploaded project.
 * @returns {import("react").JSX.Element} The preview lab panel.
 */
export default function PreviewLab({ projectName, previewPort, onStart }) {
  const dynamic = projectName !== "shop-api";
  const src = dynamic ? `http://127.0.0.1:${previewPort}` : "http://localhost:3000/preview";
  return (
    <div className="flex h-full gap-4 p-4">
      <div className="w-[60%] shrink-0">
        {dynamic && previewPort === null ? (
          <div className="flex h-full min-h-[480px] flex-col items-center justify-center gap-3 rounded border border-slate-700 bg-slate-900 p-6 text-center">
            <p className="text-sm text-slate-300">The uploaded project is installed but not running.</p>
            <button
              type="button"
              onClick={onStart}
              className="rounded bg-green-700 px-3 py-1 text-sm text-white hover:bg-green-600"
            >
              Start Project Preview
            </button>
          </div>
        ) : (
          <iframe
            title="project preview"
            src={src}
            className="h-full min-h-[480px] w-full rounded border border-slate-700 bg-white"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
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
        <p className="mt-2 font-mono text-xs text-slate-500">
          {previewPort !== null || projectName === "shop-api" ? `Preview: ${src}` : "Start the uploaded project to preview it."}
          {projectName === "shop-api" && (
            <>
              <br />
              Checkout: POST /cart/checkout
            </>
          )}
        </p>
      </div>
    </div>
  );
}
