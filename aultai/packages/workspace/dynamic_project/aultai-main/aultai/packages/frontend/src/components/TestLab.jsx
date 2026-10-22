import { useState } from "react";
import { generateTests, runTests } from "../api/client.js";

/**
 * TestLab — generate and run the shop-api regression suite.
 * @returns {import("react").JSX.Element} The testing lab panel.
 */
export default function TestLab() {
  const [generated, setGenerated] = useState(null);
  const [result, setResult] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Generate the mock regression suite.
   * @returns {Promise<void>}
   */
  async function onGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const out = await generateTests();
      setGenerated(out.tests);
    } catch (err) {
      setError(err);
    } finally {
      setGenerating(false);
    }
  }

  /**
   * Run the shop-api Vitest suite.
   * @returns {Promise<void>}
   */
  async function onRun() {
    setRunning(true);
    setError(null);
    try {
      const out = await runTests();
      setResult(out);
    } catch (err) {
      setError(err);
    } finally {
      setRunning(false);
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
            Generated tests ({generated.length})
          </h3>
          <pre className="max-h-64 overflow-y-auto rounded border border-slate-700 bg-slate-950 p-2 font-mono text-xs text-slate-200">
            {generated.map((t) => t.code).join("\n\n")}
          </pre>
        </div>
      )}
      {result !== null && (
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Results: {result.passed}/{result.total} passed ({result.duration_ms}ms)
          </h3>
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
