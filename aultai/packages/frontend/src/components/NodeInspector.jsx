import { useEffect, useState } from "react";
import { explainNode, fetchNode } from "../api/client.js";

/**
 * Clickable list of related node ids.
 * @param {object} props
 * @param {string} props.title List heading.
 * @param {string[]} props.ids Related node ids.
 * @param {(id: string) => void} props.onNodeClick
 * @returns {import("react").JSX.Element} The list.
 */
function RelatedList({ title, ids, onNodeClick }) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title} ({ids.length})
      </h3>
      {ids.length === 0 ? (
        <p className="text-sm text-slate-500">none</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {ids.map((id) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => onNodeClick(id)}
                className="font-mono text-xs text-sky-400 hover:underline"
              >
                {id}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * NodeInspector — detail panel for the selected graph node.
 * @param {object} props
 * @param {string | null} props.nodeId
 * @param {(id: string) => void} props.onNodeClick
 * @returns {import("react").JSX.Element} The inspector panel.
 */
export default function NodeInspector({ nodeId, onNodeClick }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [explanation, setExplanation] = useState(null);
  const [explaining, setExplaining] = useState(false);
  const [explainError, setExplainError] = useState(null);

  useEffect(() => {
    if (nodeId === null) {
      setDetail(null);
      setError(null);
      setLoading(false);
      setExplanation(null);
      setExplainError(null);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setExplanation(null);
    setExplainError(null);
    fetchNode(nodeId)
      .then((d) => {
        if (!cancelled) {
          setDetail(d);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err);
          setDetail(null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [nodeId]);

  if (nodeId === null) {
    return <p className="p-4 text-sm text-slate-500">Click a node to inspect</p>;
  }
  if (loading) {
    return (
      <div className="flex flex-col gap-2 p-4" aria-label="Loading">
        <div className="h-4 w-2/3 animate-pulse rounded bg-slate-800" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-slate-800" />
        <div className="h-32 animate-pulse rounded bg-slate-800" />
      </div>
    );
  }
  if (error !== null) {
    return (
      <div className="m-4 rounded border border-red-900 bg-red-950 p-3 text-sm text-red-300">
        <p className="font-semibold">Failed to load {nodeId}</p>
        <p className="mt-1 font-mono text-xs">{error.message}</p>
      </div>
    );
  }
  if (detail === null) {
    return <p className="p-4 text-sm text-slate-500">No data</p>;
  }

  /**
   * Request an AI explanation for the current node.
   * @returns {Promise<void>}
   */
  async function onExplain() {
    setExplaining(true);
    setExplainError(null);
    try {
      const result = await explainNode(detail.id);
      setExplanation(result.explanation);
    } catch (err) {
      setExplainError(err);
    } finally {
      setExplaining(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-4">
      <div>
        <p className="font-mono text-xs text-slate-500">
          {(detail.file ?? "unknown") + ":" + (detail.lineno ?? "?")}
        </p>
        <div className="flex items-center gap-2">
          <h2 className="break-all font-mono text-sm font-bold text-slate-100">{detail.id}</h2>
          <button
            type="button"
            onClick={onExplain}
            disabled={explaining}
            className="shrink-0 rounded bg-sky-800 px-2 py-0.5 text-xs text-sky-100 hover:bg-sky-700 disabled:opacity-50"
          >
            {explaining ? "…" : "Explain"}
          </button>
        </div>
        {explaining && <p className="mt-1 text-xs text-slate-500">Explaining…</p>}
        {explainError !== null && (
          <p className="mt-1 font-mono text-xs text-red-400">{explainError.message}</p>
        )}
        {explanation !== null && (
          <p className="mt-1 rounded border border-slate-700 bg-slate-900 p-2 text-sm text-slate-300">
            {explanation}
          </p>
        )}
        <span className="mt-1 inline-block rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-200">
          {detail.type}
        </span>
      </div>
      {detail.signature !== undefined && detail.signature !== null && (
        <pre className="overflow-x-auto rounded bg-slate-800 p-2 font-mono text-xs text-slate-200">
          {detail.signature}
        </pre>
      )}
      {detail.docstring !== undefined && detail.docstring !== null && (
        <pre className="overflow-x-auto whitespace-pre rounded bg-slate-800 p-2 font-mono text-xs text-slate-400">
          {detail.docstring}
        </pre>
      )}
      {detail.source !== undefined && detail.source !== null && (
        <pre className="overflow-x-auto rounded bg-slate-950 p-2 font-mono text-xs text-slate-200">
          {detail.source}
        </pre>
      )}
      <RelatedList title="Callers" ids={detail.callers ?? []} onNodeClick={onNodeClick} />
      <RelatedList title="Callees" ids={detail.callees ?? []} onNodeClick={onNodeClick} />
    </div>
  );
}
