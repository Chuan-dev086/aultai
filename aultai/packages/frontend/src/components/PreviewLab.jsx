/**
 * PreviewLab — live iframe of the buggy shop-api preview page plus a note.
 * @returns {import("react").JSX.Element} The preview lab panel.
 */
export default function PreviewLab() {
  return (
    <div className="flex h-full gap-4 p-4">
      <div className="w-[60%] shrink-0">
        <iframe
          title="shop-api preview"
          src="http://localhost:3000/preview"
          className="h-full min-h-[480px] w-full rounded border border-slate-700 bg-white"
        />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          API Inspector
        </h3>
        <p className="text-sm text-slate-300">
          Interact with the checkout below to see the BUG 1 and BUG 2 in real-time.
        </p>
        <p className="mt-2 font-mono text-xs text-slate-500">
          Preview: http://localhost:3000/preview
          <br />
          Checkout: POST /cart/checkout
        </p>
      </div>
    </div>
  );
}
