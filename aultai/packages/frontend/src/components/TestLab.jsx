import { useState } from "react";
import { explainTestResults, generateTests, runTests } from "../api/client.js";

/**
 * TestLab — propose tests, run the active project's suite, and explain results.
 * @returns {import("react").JSX.Element} The testing lab panel.
 */
export default function TestLab() {
  const [generated, setGenerated] = useState(null);
  const [result, setResult] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [explanation, setExplanation] = useState(null);
  const [explaining, setExplaining] = useState(false);

  /**
   * Generate test suggestions.
   * @returns {Promise<void>}
   */
  async function onGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const out = await generateTests();
      setGenerated(out);
    } catch (err) {
      setError(err);
    } finally {
      setGenerating(false);
    }
  }

  /**
   * Run the active project's test command.
   * @returns {Promise<void>}
   */
  async function onRun() {
    setRunning(true);
    setError(null);
    try {
      const out = await runTests();
      setResult(out);
      setExplanation(null);
    } catch (err) {
      setError(err);
    } finally {
      setRunning(false);
    }

  }

  async function onExplainResults() {
    setExplaining(true);
    setError(null);
    try {
      setExplanation(await explainTestResults());
    } catch (err) {
      setError(err);
    } finally {
      setExplaining(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onGenerate}
          disabled={generating}
          className="rounded bg-indigo-700 px-3 py-1 text-sm text-white hover:bg-indigo-600 disabled:opacity-50"
        >
          {generating ? "Generating…" : "Generate Tests"}
        </button>
        <button
          type="button"
          onClick={onRun}
          disabled={running}
          className="rounded bg-green-700 px-3 py-1 text-sm text-white hover:bg-green-600 disabled:opacity-50"
        >
          {running ? "Running…" : "Run Tests"}
        </button>
      </div>
      {error !== null && (
        <p className="rounded border border-red-900 bg-red-950 p-2 font-mono text-xs text-red-300">
          {error.message}
        </p>
      )}
      {generated !== null && (
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {generated.mode === "live" ? "AI test suggestions" : "Offline mock test suggestions"} ({generated.tests.length})
          </h3>
          <pre className="max-h-64 overflow-y-auto rounded border border-slate-700 bg-slate-950 p-2 font-mono text-xs text-slate-200">
            {generated.tests.map((t) => t.code).join("\n\n")}
          </pre>
        </div>
      )}
      {result !== null && (
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Results: {result.passed}/{result.total} passed ({result.duration_ms}ms)
          </h3>
          <button
            type="button"
            onClick={onExplainResults}
            disabled={explaining}
            className="mb-2 rounded bg-indigo-700 px-3 py-1 text-sm text-white hover:bg-indigo-600 disabled:opacity-50"
          >
            {explaining ? "Explaining…" : "Explain Real Test Results with AI"}
          </button>
          {explanation !== null && (
            <div className="mb-3 rounded border border-slate-700 bg-slate-900 p-3 text-sm text-slate-300">
              <p>{explanation.summary}</p>
              {explanation.failure_explanations.map((item) => (
                <p key={item.testName} className="mt-2">
                  <span className="font-mono text-amber-300">{item.testName}: </span>{item.explanation}
                </p>
              ))}
            </div>
          )}
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="py-1 pr-2">Test</th>
                <th className="py-1 pr-2">Status</th>
                <th className="py-1">ms</th>
              </tr>
            </thead>
            <tbody>
              {result.tests.map((t) => (
                <tr key={t.name} className="border-t border-slate-800">
                  <td className="py-1 pr-2 font-mono text-xs text-slate-200" title={t.error ?? ""}>
                    {t.name}
                  </td>
                  <td
                    className={`py-1 pr-2 text-xs font-semibold ${t.status === "passed" ? "text-green-400" : "text-red-400"}`}
                  >
                    {t.status}
                  </td>
                  <td className="py-1 font-mono text-xs text-slate-400">{t.duration_ms}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
