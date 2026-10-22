import { useEffect, useRef, useState } from "react";
import {
  applyAISolution,
  fetchProjectFile,
  requestAISolution,
  revertAISolution,
  runTests,
} from "../api/client.js";
import DiffViewer from "./DiffViewer.jsx";

/**
 * Complete code/error -> reviewed proposal -> explicit apply -> real tests flow.
 * @param {object} props
 * @param {import("../types.js").ProjectInfo | null} props.project Active project file list.
 * @param {import("../types.js").Issue[]} props.issues Current analysis issues.
 * @param {string | null} props.activeFile Currently selected file path.
 * @param {string} props.projectName Active project root name.
 * @returns {import("react").JSX.Element} AI solution workbench.
 */
export default function AISolutionLab({ project, issues, activeFile, projectName }) {
  const [file, setFile] = useState("");
  const [selectedIssueId, setSelectedIssueId] = useState("");
  const [code, setCode] = useState("");
  const [errorText, setErrorText] = useState("");
  const [loadingFile, setLoadingFile] = useState(false);
  const [proposal, setProposal] = useState(null);
  const [requesting, setRequesting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [runningTests, setRunningTests] = useState(false);
  const [applied, setApplied] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [message, setMessage] = useState(null);
  const contextChosenByUser = useRef(false);
  const fileLoadId = useRef(0);

  useEffect(() => {
    if (contextChosenByUser.current) {
      return;
    }
    if (selectedIssueId === "" && issues.length > 0) {
      void onSelectIssue(issues[0], false);
      return;
    }
    if (file !== "") {
      return;
    }
    if (activeFile !== null) {
      void onSelectFile(projectRelativePath(activeFile, projectName), { userInitiated: false });
      return;
    }
    const firstFile = project?.files?.[0]?.path;
    if (firstFile !== undefined) {
      void onSelectFile(projectRelativePath(firstFile, projectName), { userInitiated: false });
    }
  }, [activeFile, file, issues, project, projectName, selectedIssueId]);

  async function onSelectFile(nextFile, { clearIssueContext = true, userInitiated = true } = {}) {
    if (userInitiated) {
      contextChosenByUser.current = true;
    }
    const loadId = ++fileLoadId.current;
    setFile(nextFile);
    setCode("");
    setMessage(null);
    if (clearIssueContext) {
      setSelectedIssueId("");
      setErrorText("");
    }
    if (nextFile === "") {
      return;
    }
    setLoadingFile(true);
    try {
      const source = await fetchProjectFile(nextFile);
      if (fileLoadId.current === loadId) {
        setCode(source.code);
      }
    } catch (err) {
      if (fileLoadId.current === loadId) {
        setMessage({ tone: "error", text: err.message });
      }
    } finally {
      if (fileLoadId.current === loadId) {
        setLoadingFile(false);
      }
    }
  }

  async function onSelectIssue(issue, userInitiated = true) {
    if (userInitiated) {
      contextChosenByUser.current = true;
    }
    setSelectedIssueId(issue.id);
    setErrorText([
      `Issue: ${issue.title}`,
      `Severity: ${issue.severity}`,
      `Line: ${issue.lineno}`,
      `Evidence: ${issue.evidence}`,
      `Explanation: ${issue.explanation}`,
      `Suggested action: ${issue.suggested_action}`,
    ].join("\n"));
    await onSelectFile(projectRelativePath(issue.file, projectName), {
      clearIssueContext: false,
      userInitiated: false,
    });
  }

  async function onRequestProposal(event) {
    event.preventDefault();
    setRequesting(true);
    setMessage(null);
    setProposal(null);
    setApplied(false);
    setTestResult(null);
    try {
      setProposal(await requestAISolution({ file, code, error: errorText }));
    } catch (err) {
      setMessage({ tone: "error", text: err.message });
    } finally {
      setRequesting(false);
    }
  }

  async function onApply() {
    setApplying(true);
    setMessage(null);
    try {
      await applyAISolution(proposal.proposalId);
      setApplied(true);
      setMessage({ tone: "success", text: "Approved patch applied. Run tests to verify the actual project result." });
    } catch (err) {
      setMessage({ tone: "error", text: err.message });
    } finally {
      setApplying(false);
    }
  }

  async function onRunTests() {
    setRunningTests(true);
    setMessage(null);
    try {
      setTestResult(await runTests());
    } catch (err) {
      setMessage({ tone: "error", text: err.message });
    } finally {
      setRunningTests(false);
    }
  }

  async function onRevert() {
    setMessage(null);
    try {
      await revertAISolution(proposal.proposalId);
      setApplied(false);
      setMessage({ tone: "success", text: "Patch reverted from its backup." });
    } catch (err) {
      setMessage({ tone: "error", text: err.message });
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h2 className="text-base font-semibold text-slate-100">AI-powered solution</h2>
        <p className="mt-1 text-sm text-slate-400">
          Choose a detected issue or source file. AultAI fills in the file path and source; review the context, then ask for a proposal.
        </p>
        <p className="mt-1 text-xs text-amber-300">
          Code context is sent to the configured AI provider after backend secret redaction. Do not submit sensitive code.
        </p>
      </div>
      <form onSubmit={onRequestProposal} className="flex flex-col gap-3">
        {issues.length > 0 && (
          <label className="flex flex-col gap-1 text-sm text-slate-300">
            Start from a detected issue
            <select
              value={selectedIssueId}
              onChange={(event) => {
                const selected = issues.find((issue) => issue.id === event.target.value);
                if (selected !== undefined) {
                  void onSelectIssue(selected);
                } else {
                  contextChosenByUser.current = true;
                  setSelectedIssueId("");
                  setErrorText("");
                }
              }}
              className="rounded bg-slate-800 px-2 py-2 text-sm text-slate-200"
            >
              <option value="">Choose an issue (optional)</option>
              {issues.map((issue) => (
                <option key={issue.id} value={issue.id}>
                  [{issue.severity.toUpperCase()}] {issue.title} — {issue.file}:{issue.lineno}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          Or choose a source file
          <select
            value={file}
            onChange={(event) => {
              void onSelectFile(event.target.value);
            }}
            className="rounded bg-slate-800 px-2 py-2 font-mono text-xs text-slate-200"
          >
            <option value="">Choose a file</option>
            {(project?.files ?? [])
              .filter((entry) => /\.(?:c|m)?(?:j|t)sx?$/i.test(entry.path))
              .map((entry) => {
                const projectFile = projectRelativePath(entry.path, projectName);
                return <option key={entry.path} value={projectFile}>{projectFile}</option>;
              })}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          Project-relative file path
          <input
            required
            readOnly
            value={file}
            placeholder="Choose a file above"
            className="rounded bg-slate-800 px-2 py-1 font-mono text-xs text-slate-200 read-only:cursor-not-allowed"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          Code
          <textarea
            required
            value={code}
            onChange={(event) => setCode(event.target.value)}
            rows={10}
            maxLength={30000}
            placeholder={loadingFile ? "Loading source file…" : "Choose a source file above to load its current code."}
            className="rounded bg-slate-900 p-2 font-mono text-xs text-slate-200"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          Error or bug description
          <textarea
            required
            value={errorText}
            onChange={(event) => setErrorText(event.target.value)}
            rows={3}
            maxLength={8000}
            placeholder="Paste the error message or describe the unexpected behavior."
            className="rounded bg-slate-900 p-2 font-mono text-xs text-slate-200"
          />
        </label>
        <button
          type="submit"
          disabled={requesting || loadingFile || file.trim() === "" || code.trim() === "" || errorText.trim() === ""}
          className="self-start rounded bg-indigo-700 px-3 py-1 text-sm text-white hover:bg-indigo-600 disabled:opacity-50"
        >
          {requesting ? "Analyzing…" : loadingFile ? "Loading source…" : "Explain and Propose a Fix"}
        </button>
      </form>
      {message !== null && (
        <p className={`rounded border p-2 text-sm ${message.tone === "error" ? "border-red-900 bg-red-950 text-red-300" : "border-green-900 bg-green-950 text-green-300"}`}>
          {message.text}
        </p>
      )}
      {proposal !== null && (
        <section className="flex flex-col gap-3 rounded border border-slate-700 bg-slate-900 p-4">
          <div>
            <p className="font-mono text-xs text-slate-500">{proposal.file}</p>
            <span className="mt-1 inline-block rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-200">
              Risk: {proposal.risk}
            </span>
          </div>
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Explanation</h3>
            <p className="text-sm text-slate-300">{proposal.explanation}</p>
            <ul className="mt-1 list-disc pl-5 text-sm text-slate-400">
              {proposal.rationaleSteps.map((step) => <li key={step}>{step}</li>)}
            </ul>
          </div>
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Proposed change</h3>
            <DiffViewer diff={proposal.unifiedDiff} />
          </div>
          <pre className="max-h-72 overflow-auto rounded bg-slate-950 p-2 font-mono text-xs text-green-300">
            {proposal.proposedCode}
          </pre>
          <div className="flex flex-wrap gap-2">
            {!applied ? (
              <button
                type="button"
                onClick={onApply}
                disabled={applying}
                className="rounded bg-green-700 px-3 py-1 text-sm text-white hover:bg-green-600 disabled:opacity-50"
              >
                {applying ? "Applying…" : "Approve and Apply"}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onRunTests}
                  disabled={runningTests}
                  className="rounded bg-indigo-700 px-3 py-1 text-sm text-white hover:bg-indigo-600 disabled:opacity-50"
                >
                  {runningTests ? "Running…" : "Run Project Tests"}
                </button>
                <button
                  type="button"
                  onClick={onRevert}
                  className="rounded bg-slate-700 px-3 py-1 text-sm text-white hover:bg-slate-600"
                >
                  Revert
                </button>
              </>
            )}
          </div>
          {testResult !== null && (
            <div className="rounded border border-slate-700 bg-slate-950 p-3">
              <h3 className="text-sm font-semibold text-slate-200">
                Real test result: {testResult.passed}/{testResult.total} passed, {testResult.failed} failed ({testResult.duration_ms} ms)
              </h3>
              {testResult.tests.map((test) => (
                <p key={test.name} className={`mt-1 font-mono text-xs ${test.status === "passed" ? "text-green-400" : "text-red-400"}`}>
                  {test.status}: {test.name}{test.error ? ` — ${test.error}` : ""}
                </p>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function projectRelativePath(file, projectName) {
  if (typeof file !== "string") {
    return "";
  }
  const normalized = file.replace(/\\/g, "/");
  const prefix = `${projectName}/`;
  return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized;
}
