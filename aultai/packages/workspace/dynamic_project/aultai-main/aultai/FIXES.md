# Bug fixes (pre-presentation)

The two **planted** demo bugs in `packages/workspace/shop-api` (BUG 1 in
`checkout.js`, BUG 2 in `vouchers.js`) and the ground-truth tests are
**unchanged on purpose**. `npm test` still reports exactly 2 failures.

These real bugs in AultAI itself were fixed:

| # | Problem | Where | Fix |
|---|---|---|---|
| 1 | Whole app failed (`GRAPH_FAILED`) on any computer except the original author's, because the workspace path was hard-coded to `C:\Users\User\Desktop\hackathon 2026\...` | `backend/src/config.js` | Path is resolved relative to the backend folder (override with `WORKSPACE_DIR`) |
| 2 | After **Apply Fix**, the live Preview still showed `-23.11` — the backend had loaded the shop code once at startup | `backend/src/index.js`, new `services/shopApiProcess.js`, `routes/fixes.js` | shop-api runs in its own child process (as AGENTS.md rule 8 requires) on a free port; it restarts after Apply/Undo. Preview now shows 6.99 after the fix |
| 3 | **Analyze** kept reporting BUG 1 after it was fixed (mock issues were hard-coded) | `services/analyzer.js` | Mock issues are reported only while the buggy line is still in the file; line numbers are re-located |
| 4 | Issues list didn't refresh after Apply / Undo | `frontend/src/App.jsx` | Re-runs analysis after Apply and Undo |
| 5 | One failed Analyze replaced the whole UI with an error screen | `frontend/src/App.jsx` | Shows a dismissible red banner instead |
| 6 | Setting `ANTHROPIC_API_KEY` broke Fix Review ("live-mode generation is not implemented") and used a retired Claude model | `services/fixer.js`, `services/llm.js` | Curated fixes work in both modes; model is configurable (`ANTHROPIC_MODEL`, `OPENAI_MODEL`) |
| 7 | Perf error rate always 0% — HTTP 4xx/5xx responses weren't counted | `services/perf.js` | Counts non-2xx responses and timeouts as errors |
| 8 | Dangling graph edge for `test_checkout.test.js` (module ids with dots were cut at the first dot) | `services/graphBuilder.js` | Module looked up by file, not by splitting the id |
| 9 | JSDoc missing for `export const fn = () => {}` in the inspector | `services/parser.js` | JSDoc read from the export statement |
| 10 | `/api/project/status` reported `shop-api` while an uploaded project was active | `services/projectManager.js` | Reports the real active workspace |
| 11 | Bug explanation said the fixed total is 0.00; the specified fix gives 6.99 | `services/analyzer.js` | Text corrected |
| 12 | Preview page showed `NaN` when the server rejected a checkout; label said "Mug" (product is "Basic Tee") | `shop-api/public/index.html` (the one allowed file) | Shows the server's error message; label fixed |
| 13 | Clicking a graph node while on the Issues tab didn't show its details | `frontend/src/App.jsx` | Switches to the Inspector tab |
| 14 | Preview iframe hard-coded `http://localhost:3000`; no way to reload it | `frontend/.../PreviewLab.jsx` | Uses the Vite proxy; **Reload preview** button added |
| 15 | Review step did nothing before Analyze had been run | `frontend/src/App.jsx` | Runs Analyze first if needed |
| 16 | `zod` was used by the backend but not declared in its package.json | `backend/package.json` | Declared |
| 17 | `import.meta.dirname` crashes on Node 20 before 20.11 | `shop-api/src/api.js` (server setup line only, not the planted bugs) | Uses `fileURLToPath` |
| 18 | Backend crashed with an unclear error if port 3000 was taken; Ctrl+C could leave the shop-api running | `backend/src/index.js`, `shopApiProcess.js` | Clear message; child is stopped on exit |

### Round 2 (Windows start-up problems)

| # | Problem | Fix |
|---|---|---|
| 19 | Two terminals had to be started in the right order; a mistake left a dead error screen | `npm start` / `start-windows.bat` start everything in one window; the page now retries every 2 s until the backend answers |
| 20 | If port 3000 was busy (e.g. another project still running) the backend couldn't start | The launcher picks the next free port and points the frontend at it (`AULTAI_BACKEND_PORT` in `vite.config.js`) |
| 21 | Nested folders after "Extract All" made it easy to run commands from the wrong place | `start-windows.bat` in both `aultai-main` and `aultai-main/aultai` always runs from the right folder |
| 22 | The shop-api preview server could fail to start from OneDrive or symlinked folders | The backend imports the shop-api app directly instead of relying on its "run directly?" check |

## Known, not changed

- `npm audit` lists warnings in development tools (Vite, Vitest, Tailwind, autocannon's uuid). Clearing them needs major-version upgrades, which is too risky right before a demo. They don't affect the running app.
- With an API key set, the Analyze step can also list extra AI-found issues; only the two demo bugs have automatic fix proposals.
