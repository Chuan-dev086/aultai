/**
 * Style one diff line by its leading marker.
 * @param {string} line A single unified-diff line.
 * @returns {string} Tailwind class string for the line.
 */
function lineClass(line) {
  if (line.startsWith("+") && !line.startsWith("+++")) {
    return "bg-green-900/30 text-green-400";
  }
  if (line.startsWith("-") && !line.startsWith("---")) {
    return "bg-red-900/30 text-red-400";
  }
  if (line.startsWith("@@")) {
    return "text-cyan-400";
  }
  return "text-slate-400";
}

/**
 * DiffViewer — render a unified diff with per-line coloring.
 * @param {object} props
 * @param {string} props.diff Unified diff text.
 * @returns {import("react").JSX.Element} The colored diff.
 */
export default function DiffViewer({ diff }) {
  const lines = (diff ?? "").split("\n");
  return (
    <pre className="overflow-x-auto rounded border border-slate-700 bg-slate-950 p-2 font-mono text-xs">
      {lines.map((line, i) => (
        <div key={i} className={lineClass(line)}>
          {line === "" ? " " : line}
        </div>
      ))}
    </pre>
  );
}
