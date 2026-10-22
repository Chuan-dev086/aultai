/**
 * FileTree — vertical list of workspace files with node counts.
 * @param {object} props
 * @param {import("../../types.js").ProjectFile[] | null} props.files
 * @param {string | null} props.activeFile
 * @param {(path: string | null) => void} props.onFileClick
 * @returns {import("react").JSX.Element} The file list.
 */
export default function FileTree({ files, activeFile, onFileClick }) {
  const list = files ?? [];
  return (
    <nav aria-label="Files" className="flex flex-col gap-1 p-3">
      <button
        type="button"
        onClick={() => onFileClick(null)}
        className={`rounded px-3 py-2 text-left text-sm ${
          activeFile === null
            ? "bg-slate-700 text-white"
            : "text-slate-300 hover:bg-slate-800"
        }`}
      >
        All files
      </button>
      {list.map((f) => (
        <button
          key={f.path}
          type="button"
          onClick={() => onFileClick(f.path)}
          className={`flex items-baseline justify-between gap-2 rounded px-3 py-2 text-left text-sm ${
            activeFile === f.path
              ? "bg-slate-700 text-white"
              : "text-slate-300 hover:bg-slate-800"
          }`}
        >
          <span className="truncate font-mono text-xs">{f.path}</span>
          <span className="shrink-0 text-xs text-slate-500">{f.node_count}</span>
        </button>
      ))}
    </nav>
  );
}
