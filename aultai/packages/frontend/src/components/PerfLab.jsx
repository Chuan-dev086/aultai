import { useEffect, useState } from "react";
import { analyzePerfResult, runPerfTest } from "../api/client.js";

const DEFAULT_PAYLOAD = {
  cart: { items: [{ productId: "p1", quantity: 1 }] },
  voucher: { code: "MINUS50", type: "fixed", value: 50, expiresAt: null, minSpend: 0 },
};

/**
 * Format a comparison arrow between the current and previous run.
 * @param {number} current Current value (higher is better when `higherBetter`).
 * @param {number | undefined} previous Previous value, if any.
 * @param {boolean} higherBetter Whether higher means improvement.
 * @returns {string} "▲", "▼", or "" when equal/missing.
 */
function arrowFor(current, previous, higherBetter) {
  if (previous === undefined || previous === null || current === previous) {
    return "";
  }
  const better = higherBetter ? current > previous : current < previous;
  return better ? "▲" : "▼";
}

/**
 * Color class for a comparison arrow.
 * @param {string} arrow The arrow from arrowFor.
 * @returns {string} Tailwind color class.
 */
function arrowClass(arrow) {
  if (arrow === "▲") {
    return "text-green-400";
  }
  if (arrow === "▼") {
    return "text-red-400";
  }
  return "text-slate-500";
}

/**
 * PerfLab — configure, run, and display load tests.
 * @returns {import("react").JSX.Element} The perf lab panel.
 */
export default function PerfLab({ projectName, projectRunning }) {
  const [endpoint, setEndpoint] = useState(projectName === "shop-api" ? "/shop-api/cart/checkout" : "/");
  const [method, setMethod] = useState(projectName === "shop-api" ? "POST" : "GET");
  const [concurrency, setConcurrency] = useState(10);
  const [duration, setDuration] = useState(5);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [previous, setPrevious] = useState(null);
  const [error, setError] = useState(null);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    setEndpoint(projectName === "shop-api" ? "/shop-api/cart/checkout" : "/");
    setMethod(projectName === "shop-api" ? "POST" : "GET");
    setResult(null);
    setPrevious(null);
    setAiAnalysis(null);
  }, [projectName]);

  /**
   * Run a load test with the current config.
   * @returns {Promise<void>}
   */
  async function onRun() {
    setRunning(true);
    setError(null);
    try {
      const out = await runPerfTest({
        project: projectName,
        endpoint,
        method,
        payload: method === "GET" || method === "HEAD" ? null : DEFAULT_PAYLOAD,
        concurrency: Number(concurrency),
        duration: Number(duration),
      });
      setPrevious(result);
      setResult(out);
      setAiAnalysis(null);
    } catch (err) {
      setError(err);
    } finally {
      setRunning(false);
    }

  }

  async function onAnalyzeResult() {
    setAnalyzing(true);
    setError(null);
    try {
      setAiAnalysis(await analyzePerfResult());
    } catch (err) {
      setError(err);
    } finally {
      setAnalyzing(false);
    }
  }

  const cards =
    result === null
      ? []
      : [
          {
            label: "RPS",
            value: String(result.rps),
            arrow: arrowFor(result.rps, previous?.rps, true),
          },
          {
            label: "P95 Latency (ms)",
            value: String(result.latency.p95),
            arrow: arrowFor(result.latency.p95, previous?.latency.p95, false),
          },
          {
            label: "Error Rate (%)",
            value: String(result.errorRate),
            arrow: arrowFor(result.errorRate, previous?.errorRate, false),
          },
        ];

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          Endpoint
          <input
            type="text"
            value={endpoint}
            onChange={(ev) => setEndpoint(ev.target.value)}
            className="w-64 rounded bg-slate-800 px-2 py-1 font-mono text-xs text-slate-200"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          Method
          <select
            value={method}
            onChange={(ev) => setMethod(ev.target.value)}
            className="rounded bg-slate-800 px-2 py-1 text-sm text-slate-200"
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          Concurrency ({concurrency})
          <input
            type="range"
            min="1"
            max="100"
            value={concurrency}
            onChange={(ev) => setConcurrency(Number(ev.target.value))}
            className="w-48"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          Duration (s)
          <input
            type="number"
            min="1"
            max="60"
            value={duration}
            onChange={(ev) => setDuration(Number(ev.target.value))}
            className="w-24 rounded bg-slate-800 px-2 py-1 text-slate-200"
          />
        </label>
        <button
          type="button"
          onClick={onRun}
          disabled={running || !projectRunning}
          className="rounded bg-green-700 px-3 py-1 text-sm text-white hover:bg-green-600 disabled:opacity-50"
        >
          {running ? "Running…" : "Run Perf Test"}
        </button>
      </div>
      {!projectRunning && (
        <p className="text-sm text-amber-300">Start the uploaded project in Preview or Projects before running a performance test.</p>
      )}
      {running && <p className="text-sm text-slate-500">Hammering {endpoint}…</p>}
      {error !== null && (
        <p className="rounded border border-red-900 bg-red-950 p-2 font-mono text-xs text-red-300">
          {error.message}
        </p>
      )}
      {result !== null && (
        <div>
          <div className="grid grid-cols-3 gap-2">
            {cards.map((c) => (
              <div key={c.label} className="rounded border border-slate-700 bg-slate-900 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">{c.label}</p>
                <p className="text-2xl font-bold text-slate-100">
                  {c.value} <span className={`text-lg ${arrowClass(c.arrow)}`}>{c.arrow}</span>
                </p>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">Latency (ms)</p>
            <div className="flex h-32 items-end gap-2 rounded border border-slate-700 bg-slate-900 p-2">
              {[
                ["p50", result.latency.p50],
                ["p95", result.latency.p95],
                ["p99", result.latency.p99],
              ].map(([label, value]) => {
                const max = Math.max(result.latency.p99, 1);
                const height = Math.max(4, Math.round((value / max) * 100));
                return (
                  <div key={label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                    <span className="font-mono text-xs text-slate-300">{value}</span>
                    <div className="w-full rounded bg-indigo-600" style={{ height: `${height}%` }} />
                    <span className="text-xs text-slate-500">{label}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="mt-2 font-mono text-xs text-slate-500">
            {result.project} — {result.totalRequests} requests, {result.errors} errors, {result.concurrency} conns,{" "}
            {result.duration}s, {result.timestamp}
          </p>
          <button
            type="button"
            onClick={onAnalyzeResult}
            disabled={analyzing}
            className="mt-3 rounded bg-indigo-700 px-3 py-1 text-sm text-white hover:bg-indigo-600 disabled:opacity-50"
          >
            {analyzing ? "Analyzing…" : "Analyze Metrics with AI"}
          </button>
          {aiAnalysis !== null && (
            <div className="mt-3 rounded border border-slate-700 bg-slate-900 p-3">
              <p className="text-sm text-slate-200">{aiAnalysis.summary}</p>
              <ul className="mt-2 list-disc pl-5 text-sm text-slate-300">
                {aiAnalysis.recommendations.map((recommendation) => <li key={recommendation}>{recommendation}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
