import { useEffect, useState } from "react";
import { analyze, fetchGraph, loadProject, revertFix } from "./api/client.js";
import FileTree from "./components/FileTree.jsx";
import CodeGraph from "./components/CodeGraph.jsx";
import NodeInspector from "./components/NodeInspector.jsx";
import IssuesPanel from "./components/IssuesPanel.jsx";
import FixReview from "./components/FixReview.jsx";

export default function App() {
  const [project, setProject] = useState(null);
  const [graph, setGraph] = useState(null);
  const [activeFile, setActiveFile] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState([]);
  const [issues, setIssues] = useState([]);
  const [analyzeMode, setAnalyzeMode] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedIssueId, setSelectedIssueId] = useState(null);
  const [rightTab, setRightTab] = useState("inspector");
  const [activeFixIssue, setActiveFixIssue] = useState(null);
  const [banner, setBanner] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadProject(), fetchGraph()])
      .then(([info, g]) => {
        if (!cancelled) {
          setProject(info);
          setGraph(g);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setErrors([
            {
              endpoint: err.code !== undefined ? String(err.code) : "loadProject/fetchGraph",
              message: err.message,
            },
          ]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Select a file in the tree (null clears the filter).
   * @param {string | null} path File path or null.
   * @returns {void}
   */
  function onFileClick(path) {
    setActiveFile(path);
  }

  /**
   * Select a node (from graph or inspector link).
   * @param {string} id Node id.
   * @returns {void}
   */
  function onNodeClick(id) {
    setSelectedNodeId(id);
  }

  /**
   * Clear the current node selection (canvas click).
   * @returns {void}
   */
  function onClearSelection() {
    setSelectedNodeId(null);
  }

  /**
   * Run analysis and open the Issues tab.
   * @returns {Promise<void>}
   */
  async function onAnalyze() {
    setAnalyzing(true);
    try {
      const result = await analyze();
      setIssues(result.issues);
      setAnalyzeMode(result.mode);
      setRightTab("issues");
    } catch (err) {
      setErrors([
        {
          endpoint: err.code !== undefined ? String(err.code) : "analyze",
          message: err.message,
        },
      ]);
    } finally {
      setAnalyzing(false);
    }
  }

  /**
   * Open the FixReview modal for an issue (from the Issues panel).
   * @param {import("./types.js").Issue} issue The clicked issue.
   * @returns {void}
   */
  function onIssueClick(issue) {
    setSelectedIssueId(issue.id);
    setActiveFixIssue(issue);
  }

  /**
   * Fix applied: close the modal, show a banner, refresh the graph.
   * @param {import("./types.js").Issue} issue The issue that was fixed.
   * @returns {Promise<void>}
   */
  async function onFixApplied(issue) {
    setActiveFixIssue(null);
    setBanner({ message: `Fix applied for ${issue.id}`, issueId: issue.id });
    try {
      const g = await fetchGraph();
      setGraph(g);
    } catch {
      // Banner stays even if the graph refresh fails.
    }
  }

  /**
   * Undo the last applied fix via revertFix.
   * @returns {Promise<void>}
   */
  async function onUndo() {
    if (banner === null) {
      return;
    }
    try {
      await revertFix(banner.issueId);
      const g = await fetchGraph();
      setGraph(g);
      setBanner({ message: `Fix reverted for ${banner.issueId}`, issueId: null });
    } catch (err) {
      setBanner({ message: `Revert failed: ${err.message}`, issueId: null });
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-400">
        Loading project…
      </div>
    );
  }

  if (errors.length > 0) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <div className="rounded border border-red-900 bg-red-950 p-4 text-sm text-red-300">
          {errors.map((e) => (
            <p key={e.endpoint} className="font-mono text-xs">
              {e.endpoint}: {e.message}
            </p>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-200">
      <header className="flex items-center gap-4 border-b border-slate-800 px-4 py-2">
        <h1 className="text-lg font-bold">AultAI</h1>
        <p className="text-xs text-slate-500">
          {project.files.length} files / {project.node_count} nodes / {project.edge_count} edges
        </p>
        <button
          type="button"
          onClick={onAnalyze}
          disabled={analyzing}
          className="rounded bg-indigo-700 px-3 py-1 text-sm text-white hover:bg-indigo-600 disabled:opacity-50"
        >
          {analyzing ? "Analyzing…" : "Analyze"}
        </button>
      </header>
      {banner !== null && (
        <div className="flex items-center gap-3 border-b border-green-800 bg-green-950 px-4 py-1 text-sm text-green-200">
          <span>{banner.message}</span>
          {banner.issueId !== null && (
            <button
              type="button"
              onClick={onUndo}
              className="rounded bg-slate-700 px-2 py-0.5 text-xs text-white hover:bg-slate-600"
            >
              Undo
            </button>
          )}
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="text-xs text-green-400 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <aside className="w-[260px] shrink-0 overflow-y-auto border-r border-slate-800">
          <FileTree files={project.files} activeFile={activeFile} onFileClick={onFileClick} />
        </aside>
        <main className="min-w-0 flex-1">
          <CodeGraph
            nodes={graph.nodes}
            edges={graph.edges}
            activeFile={activeFile}
            selectedNodeId={selectedNodeId}
            onNodeClick={onNodeClick}
            onClearSelection={onClearSelection}
          />
        </main>
        <aside className="flex w-[360px] shrink-0 flex-col overflow-hidden border-l border-slate-800">
          <div className="flex gap-1 border-b border-slate-800 p-2">
            <button
              type="button"
              onClick={() => setRightTab("inspector")}
              className={`rounded px-2 py-1 text-sm ${rightTab === "inspector" ? "bg-slate-700 text-white" : "text-slate-400 hover:bg-slate-800"}`}
            >
              Inspector
            </button>
            <button
              type="button"
              onClick={() => setRightTab("issues")}
              className={`rounded px-2 py-1 text-sm ${rightTab === "issues" ? "bg-slate-700 text-white" : "text-slate-400 hover:bg-slate-800"}`}
            >
              Issues ({issues.length})
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {rightTab === "inspector" ? (
              <NodeInspector nodeId={selectedNodeId} onNodeClick={onNodeClick} />
            ) : (
              <IssuesPanel issues={issues} mode={analyzeMode} onIssueClick={onIssueClick} />
            )}
          </div>
        </aside>
      </div>
      {activeFixIssue !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded border border-slate-700 bg-slate-900">
            <FixReview
              issue={activeFixIssue}
              onNodeClick={(id) => {
                onNodeClick(id);
                setActiveFixIssue(null);
              }}
              onClose={() => setActiveFixIssue(null)}
              onApplied={onFixApplied}
            />
          </div>
        </div>
      )}
    </div>
  );
}
