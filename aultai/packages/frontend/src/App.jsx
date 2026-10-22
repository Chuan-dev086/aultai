import { useEffect, useState } from "react";
import { analyze, fetchGraph, fetchProjectStatus, loadProject, revertFix, startUploadedProject } from "./api/client.js";
import FileTree from "./components/FileTree.jsx";
import CodeGraph from "./components/CodeGraph.jsx";
import NodeInspector from "./components/NodeInspector.jsx";
import IssuesPanel from "./components/IssuesPanel.jsx";
import FixReview from "./components/FixReview.jsx";
import TestLab from "./components/TestLab.jsx";
import PreviewLab from "./components/PreviewLab.jsx";
import PerfLab from "./components/PerfLab.jsx";
import DemoStepper from "./components/DemoStepper.jsx";
import ProjectUploader from "./components/ProjectUploader.jsx";
import AISolutionLab from "./components/AISolutionLab.jsx";
import UploadedProjectManager from "./components/UploadedProjectManager.jsx";

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
  const [mainTab, setMainTab] = useState("graph");
  const [activeProject, setActiveProject] = useState({ name: "shop-api", port: null });

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadProject(), fetchGraph(), fetchProjectStatus()])
      .then(([info, g, status]) => {
        if (!cancelled) {
          setProject(info);
          setGraph(g);
          setActiveProject({
            name: status.active,
            port: status.running ? status.port : null,
            previewPort: status.running ? status.previewPort : null,
          });
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

  useEffect(() => {
    if (
      selectedNodeId !== null &&
      graph !== null &&
      !graph.nodes.some((node) => node.id === selectedNodeId)
    ) {
      setSelectedNodeId(null);
    }
  }, [graph, selectedNodeId]);

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
   * Navigate from an inspector relationship to its node in the full graph.
   * @param {string} id Related node id.
   * @returns {void}
   */
  function onRelatedNodeClick(id) {
    setActiveFile(null);
    setMainTab("graph");
    setRightTab("inspector");
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
   * Active project changed: reload Graph + Issues for the new workspace.
   * @param {{ name: string, port: number | null }} info New project info.
   * @returns {Promise<void>}
   */
  async function onProjectChange(info) {
    setBanner(null);
    let proj;
    let g;
    try {
      [proj, g] = await Promise.all([loadProject(), fetchGraph()]);
    } catch (err) {
      setBanner({
        message: `Could not load ${info.name}: ${err.message}. The previous project data is still shown.`,
        issueId: null,
        tone: "error",
      });
      return;
    }
    setActiveProject(info);
    setActiveFile(null);
    setSelectedNodeId(null);
    setSelectedIssueId(null);
    setActiveFixIssue(null);
    setMainTab("graph");
    setProject(proj);
    setGraph(g);
    setIssues([]);
    setAnalyzeMode(null);

    try {
      const analysis = await analyze();
      setIssues(analysis.issues);
      setAnalyzeMode(analysis.mode);
    } catch (err) {
      setBanner({
        message: `Switched to ${info.name} and loaded its files and graph, but AI analysis failed: ${err.message}. Retry Analyze when the provider is available.`,
        issueId: null,
        tone: "warning",
      });
    }
  }

  async function onStartPreviewProject() {
    try {
      const out = await startUploadedProject();
      setActiveProject({
        name: "dynamic_project",
        port: out.port,
        previewPort: out.previewPort,
      });
      setBanner({ message: `Uploaded project running on port ${out.port}`, issueId: null, tone: "success" });
    } catch (err) {
      setBanner({ message: `Could not start uploaded project: ${err.message}`, issueId: null, tone: "error" });
    }
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
      setBanner({ message: `Analyze failed: ${err.message}`, issueId: null, tone: "error" });
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
   * Guided demo stepper: jump to the tab/action for each step.
   * @param {string} stepId One of explore|diagnose|review|test|verify.
   * @returns {Promise<void>}
   */
  async function onStepClick(stepId) {
    if (stepId === "explore") {
      setMainTab("graph");
    } else if (stepId === "diagnose") {
      setMainTab("graph");
      await onAnalyze();
    } else if (stepId === "review") {
      setMainTab("graph");
      if (issues.length > 0) {
        setActiveFixIssue(issues[0]);
      }
    } else if (stepId === "test") {
      setMainTab("tests");
    } else if (stepId === "verify") {
      setMainTab("preview");
    }
  }

  /**
   * Derive the active stepper step from the current main tab.
   * @returns {string} Step id matching the visible tab.
   */
  function activeStep() {
    if (mainTab === "tests") {
      return "test";
    }
    if (mainTab === "preview" || mainTab === "perf") {
      return "verify";
    }
    if (activeFixIssue !== null) {
      return "review";
    }
    if (analyzeMode !== null) {
      return "diagnose";
    }
    return "explore";
  }

  /**
   * Fix applied: close the modal, show a banner, refresh the graph.
   * @param {import("./types.js").Issue} issue The issue that was fixed.
   * @returns {Promise<void>}
   */
  async function onFixApplied(issue) {
    setActiveFixIssue(null);
    try {
      const g = await fetchGraph();
      setGraph(g);
      setBanner({ message: `Fix applied for ${issue.id}`, issueId: issue.id });
    } catch (err) {
      setBanner({
        message: `Fix applied for ${issue.id}, but the code graph could not refresh: ${err.message}. The displayed graph may be outdated.`,
        issueId: issue.id,
        tone: "warning",
      });
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
    const issueId = banner.issueId;
    try {
      await revertFix(issueId);
    } catch (err) {
      setBanner({ message: `Undo failed: ${err.message}`, issueId, tone: "error" });
      return;
    }
    try {
      const g = await fetchGraph();
      setGraph(g);
      setBanner({ message: `Fix reverted for ${issueId}`, issueId: null, tone: "success" });
    } catch (err) {
      setBanner({
        message: `Fix reverted for ${issueId}, but the code graph could not refresh: ${err.message}. The displayed graph may be outdated.`,
        issueId: null,
        tone: "warning",
      });
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
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-800 px-4 py-2">
        <h1 className="shrink-0 text-lg font-bold">AultAI</h1>
        <DemoStepper activeStep={activeStep()} onStepClick={onStepClick} />
        <p className="whitespace-nowrap text-xs text-slate-500">
          {project.files.length} files / {project.node_count} nodes / {project.edge_count} edges
        </p>
        <button
          type="button"
          onClick={onAnalyze}
          disabled={analyzing}
          className="shrink-0 rounded bg-indigo-700 px-3 py-1 text-sm text-white hover:bg-indigo-600 disabled:opacity-50"
        >
          {analyzing ? "Analyzing…" : "Analyze"}
        </button>
        <p className="text-[10px] text-slate-500">
          Live AI sends relevant code, test, or performance context to the configured provider after likely-secret redaction.
        </p>
        <UploadedProjectManager onProjectChange={onProjectChange} />
      </header>
      {banner !== null && (
        <div className={`flex items-center gap-3 border-b px-4 py-1 text-sm ${
          banner.tone === "error"
            ? "border-red-800 bg-red-950 text-red-200"
            : banner.tone === "warning"
              ? "border-amber-800 bg-amber-950 text-amber-200"
              : "border-green-800 bg-green-950 text-green-200"
        }`}>
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
            className="text-xs underline"
          >
            Dismiss
          </button>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <aside className="w-[260px] shrink-0 overflow-y-auto border-r border-slate-800">
          <FileTree files={project.files} activeFile={activeFile} onFileClick={onFileClick} />
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex gap-1 border-b border-slate-800 p-2">
            {[
              ["graph", "Graph"],
              ["tests", "Tests"],
              ["preview", "Preview"],
              ["perf", "Perf"],
              ["projects", "Projects"],
              ["ai", "AI Solution"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMainTab(id)}
                className={`rounded px-2 py-1 text-sm ${mainTab === id ? "bg-slate-700 text-white" : "text-slate-400 hover:bg-slate-800"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {mainTab === "graph" && (
              <CodeGraph
                nodes={graph.nodes}
                edges={graph.edges}
                activeFile={activeFile}
                selectedNodeId={selectedNodeId}
                onNodeClick={onNodeClick}
                onClearSelection={onClearSelection}
              />
            )}
            {mainTab === "tests" && <TestLab />}
            {mainTab === "preview" && (
              <PreviewLab
                projectName={activeProject.name}
                previewPort={activeProject.previewPort ?? activeProject.port}
                onStart={onStartPreviewProject}
              />
            )}
            {mainTab === "perf" && (
              <PerfLab projectName={activeProject.name} projectRunning={activeProject.name === "shop-api" || activeProject.port !== null} />
            )}
            {mainTab === "projects" && <ProjectUploader onProjectChange={onProjectChange} />}
            {mainTab === "ai" && (
              <AISolutionLab
                project={project}
                issues={issues}
                activeFile={activeFile}
                projectName={activeProject.name}
              />
            )}
          </div>
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
              <NodeInspector nodeId={selectedNodeId} onRelatedNodeClick={onRelatedNodeClick} />
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
              key={activeFixIssue.id}
              issue={activeFixIssue}
              onNodeClick={(id) => {
                setActiveFile(null);
                onNodeClick(id);
                setRightTab("inspector");
                setMainTab("graph");
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
