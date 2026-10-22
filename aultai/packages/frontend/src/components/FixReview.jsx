import { useEffect, useState } from "react";
import { applyFix, generateFix } from "../api/client.js";
import DiffViewer from "./DiffViewer.jsx";

const RISK_STYLE = {
  low: "bg-green-900 text-green-200",
  medium: "bg-amber-900 text-amber-200",
  high: "bg-red-900 text-red-200",
};

/**
 * FixReview — review a generated fix proposal and explicitly apply it.
 * @param {object} props
 * @param {import("../../types.js").Issue} props.issue The issue being fixed.
 * @param {(id: string) => void} props.onNodeClick Jump to an impacted node.
 * @param {() => void} props.onClose Close the modal without applying.
 * @param {(issue: import("../../types.js").Issue) => void} props.onApplied Fix applied.
 * @returns {import("react").JSX.Element} The fix review panel.
 */
export default function FixReview({ issue, onNodeClick, onClose, onApplied }) {
  const [proposalState, setProposalState] = useState(null);
  const proposal = proposalState?.issueId === issue.id ? proposalState.value : null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setProposalState(null);
    setLoading(true);
    setError(null);
    setApplying(false);
    generateFix(issue.id, issue)
      .then((p) => {
        if (!cancelled) {
          setProposalState({ issueId: issue.id, value: p });
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [issue.id]);

  /**
   * Apply the proposed fix (explicit user action).
   * @returns {Promise<void>}
   */
  async function onApply() {
    setApplying(true);
    try {
      await applyFix(issue.id);
      onApplied(issue);
    } catch (err) {
      setError(err);
      setApplying(false);
    }
  }

  async function onRetryProposal() {
    setLoading(true);
    setError(null);
    try {
      const nextProposal = await generateFix(issue.id, issue, true);
      setProposalState({ issueId: issue.id, value: nextProposal });
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2 p-6" aria-label="Loading">
        <div className="h-5 w-2/3 animate-pulse rounded bg-slate-800" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-slate-800" />
        <div className="h-48 animate-pulse rounded bg-slate-800" />
      </div>
    );
  }

  if (error !== null && proposal === null) {
    return (
      <div className="m-6 rounded border border-red-900 bg-red-950 p-3 text-sm text-red-300">
        <p className="font-semibold">Failed to generate fix for {issue.id}</p>
        <p className="mt-1 font-mono text-xs">{error.message}</p>
        <button
          type="button"
          onClick={onRetryProposal}
          className="mt-3 rounded bg-amber-700 px-3 py-1 text-sm text-white hover:bg-amber-600"
        >
          Retry generation
        </button>
        <button
          type="button"
          onClick={onClose}
          className="ml-2 mt-3 rounded bg-slate-700 px-3 py-1 text-sm text-white hover:bg-slate-600"
        >
          Discard
        </button>
      </div>
    );
  }

  if (proposal === null) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div>
        <p className="font-mono text-xs text-slate-500">
          {issue.file}:{issue.lineno}
        </p>
        <h2 className="text-base font-bold text-slate-100">{issue.title}</h2>
        <span
          className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${RISK_STYLE[proposal.risk] ?? RISK_STYLE.low}`}
        >
          risk: {proposal.risk}
        </span>
      </div>

      {proposal.warning !== null && (
        <div className="rounded border border-amber-800 bg-amber-950 p-3 text-sm text-amber-200">
          <p>Unverified AI suggestion: {proposal.warning}</p>
          <button
            type="button"
            onClick={onRetryProposal}
            className="mt-2 rounded bg-amber-800 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700"
          >
            Retry AI fix
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Original</h3>
          <pre className="overflow-x-auto rounded border border-slate-700 bg-slate-950 p-2 font-mono text-xs text-slate-200">
            {proposal.originalCode}
          </pre>
        </div>
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Proposed</h3>
          <pre className="overflow-x-auto rounded border border-slate-700 bg-slate-950 p-2 font-mono text-xs text-green-300">
            {proposal.proposedCode}
          </pre>
        </div>
      </div>

      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Diff</h3>
        <DiffViewer diff={proposal.unifiedDiff} />
      </div>

      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Explanation</h3>
        <p className="text-sm text-slate-300">{proposal.explanation}</p>
        <ul className="mt-1 list-disc pl-5 text-sm text-slate-400">
          {proposal.rationaleSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Impacted nodes</h3>
        <div className="flex flex-wrap gap-1">
          {proposal.impactedNodes.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onNodeClick(id)}
              className="rounded bg-slate-800 px-2 py-0.5 font-mono text-xs text-sky-400 hover:bg-slate-700"
            >
              {id}
            </button>
          ))}
        </div>
      </div>

      {error !== null && (
        <p className="rounded border border-red-900 bg-red-950 p-2 font-mono text-xs text-red-300">
          {error.message}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onApply}
          disabled={applying || !proposal.sourceVerified}
          title={proposal.sourceVerified ? undefined : "Cannot apply an unverified patch."}
          className="rounded bg-green-700 px-3 py-1 text-sm text-white hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {!proposal.sourceVerified ? "Apply Fix (unavailable)" : applying ? "Applying…" : "Apply Fix"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded bg-slate-700 px-3 py-1 text-sm text-white hover:bg-slate-600"
        >
          Discard
        </button>
      </div>
    </div>
  );
}
