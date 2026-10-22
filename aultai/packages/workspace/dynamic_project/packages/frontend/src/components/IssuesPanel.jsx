const SEVERITY_RANK = { high: 0, medium: 1, low: 2 };

const SEVERITY_STYLE = {
  high: "bg-red-900 text-red-200",
  medium: "bg-amber-900 text-amber-200",
  low: "bg-slate-700 text-slate-300",
};

/**
 * IssuesPanel — sorted list of analysis issues.
 * @param {object} props
 * @param {import("../../types.js").Issue[]} props.issues
 * @param {string} props.mode "live" or "mock".
 * @param {(issue: import("../../types.js").Issue) => void} props.onIssueClick
 * @returns {import("react").JSX.Element} The issues panel.
 */
export default function IssuesPanel({ issues, mode, onIssueClick }) {
  const sorted = [...(issues ?? [])].sort((a, b) => {
    const sev = (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9);
    if (sev !== 0) {
      return sev;
    }
    if (a.file !== b.file) {
      return a.file < b.file ? -1 : 1;
    }
    return a.lineno - b.lineno;
  });

  return (
    <div className="flex flex-col gap-2 p-3">
      {mode === "mock" && (
        <span className="inline-block w-fit rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
          MOCK MODE
        </span>
      )}
      {sorted.length === 0 && <p className="text-sm text-slate-500">No issues found</p>}
      {sorted.map((issue) => (
        <button
          key={issue.id}
          type="button"
          onClick={() => onIssueClick(issue)}
          className="rounded border border-slate-800 bg-slate-900 p-2 text-left hover:border-slate-600"
        >
          <span
            className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${SEVERITY_STYLE[issue.severity] ?? SEVERITY_STYLE.low}`}
          >
            {issue.severity}
          </span>
          <p className="mt-1 text-sm text-slate-200">{issue.title}</p>
          <p className="mt-0.5 font-mono text-xs text-slate-500">
            {issue.file}:{issue.lineno}
          </p>
          <p className="mt-0.5 truncate font-mono text-xs text-slate-400">{issue.evidence}</p>
        </button>
      ))}
    </div>
  );
}
