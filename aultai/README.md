# AultAI — AI-Powered SDLC Tool

AultAI helps engineers understand code, locate bugs, and review AI-generated fixes — demonstrated against a small e-commerce checkout backend with two intentionally planted bugs: a fixed-amount voucher that drives the order total negative (BUG 1: `MINUS50` on a 19.90 cart yields `-23.11`) and an inverted voucher-expiry comparison that accepts expired vouchers while rejecting valid ones (BUG 2).

## Layout

- `packages/workspace/shop-api` — demo subject: Express checkout app + Vitest ground truth (never modified by AultAI, except the one allowed `public/index.html` preview page)
- `packages/backend` — Express API: code graph (`@babel/parser`), heuristic + AI analysis, reviewed fix proposals with explicit apply/revert (`.bak` backups), child-process test runs, and autocannon load tests against the active local project
- `packages/frontend` — React + Vite + Tailwind + React Flow: graph explorer, node inspector, issues, fix review, test lab, full-stack preview, perf lab, guided demo stepper

## Setup

Requirements: Node 20 LTS (Node 26.5.0 was used during development and is a recorded deviation).

```sh
npm install
```

### Gemini AI

Live AI features use Gemini 3.1 Flash-Lite through the backend. Free-tier availability and quotas depend on the Google AI account and may change; AultAI reports provider/quota failures instead of presenting mock output as live AI. The API key is read only by the backend process and must never be added to frontend code or committed files.

Set the environment in the same PowerShell window used to start AultAI:

```powershell
$env:AI_PROVIDER = "gemini"
$env:GEMINI_API_KEY = "<your Google AI API key>"
$env:GEMINI_MODEL = "gemini-3.1-flash-lite"
```

`GEMINI_MODEL` is optional; the backend defaults to `gemini-3.1-flash-lite`. Without a configured provider, Analyze and Inspector retain deterministic offline behavior, while live-only AI actions explain that a backend key is needed. Code sent for AI requests is limited to relevant context and has likely secrets redacted. Review every suggested patch; AultAI only applies it after an explicit approval.

Start the backend (port 3000 — serves the API, the `/preview` page, and the `/shop-api` checkout routes):

```sh
node packages/backend/src/index.js
```

Start the frontend (port 5173, proxies `/api`, `/shop-api`, `/preview` to the backend):

```sh
npm run dev -w packages/frontend
```

Run the shop-api ground truth directly (optional; expects exactly 2 failures proving the planted bugs):

```sh
npm test -w packages/workspace/shop-api
```

## 5-Minute Demo Script

Follow the DemoStepper in the top bar:

1. **Explore (Graph)** — Browse the dagre-laid-out call graph; click `checkout.calculateCheckoutTotal` to inspect its source, docstring, callers, and callees. Filter by file or search by node id.
2. **Diagnose (Analyze)** — Click Analyze. Offline mock mode returns the two planted checkout issues; with Gemini configured, Analyze also examines the active project's JavaScript/JSX source and returns validated findings.
3. **Review (Issue modal)** — Click an issue to open FixReview: original vs proposed code, unified diff, rationale, impacted nodes. Click Apply Fix (explicit action, creates a `.bak`); Undo reverts.
4. **Test (Tests tab)** — Generate test suggestions, then Run Tests to execute the active project's test command. AI explanations use the recorded test-run output; suggestions are not reported as executed tests.
5. **Verify (Preview/Perf)** — Preview tab: view the shop-api demo or start an uploaded project preview in the embedded iframe. Perf tab: run a local load test against the active project's backend and compare RPS / p95 / error rate; AI recommendations analyze the measured result only.

The **AI Solution** tab demonstrates the MVP workflow: submit source and an error, review the explanation and patch, explicitly approve it, and run the active project's real test command. AI proposals are never applied automatically.

## Notes

- **Local-only backend:** The backend binds to `127.0.0.1` and rejects API mutations from non-local browser origins. Do not expose it through a network proxy: uploading or starting a project runs scripts from that project with the backend user's permissions, and Run Tests executes the active project's test command. Only upload and run projects you trust.
- **Project replacement:** Re-uploading stops AultAI-managed dynamic-project and test processes before replacing `dynamic_project`. Processes started outside AultAI can still hold Windows file locks and must be closed separately.
- **MOCK MODE:** Without a backend AI provider key, Analyze and Inspector use clearly labeled deterministic/offline behavior and test generation returns labeled mock suggestions. Live-only fix generation, test-result explanation, and performance recommendations report that an AI provider must be configured. Provider failures, rate limits, invalid responses, and timeouts are surfaced rather than silently replaced with mock results.
- **Safety rules:** AultAI never auto-applies fixes (apply is an explicit user action with `.bak` backup + revert), never `eval`s analyzed code (parsing is `@babel/parser` only), and runs Vitest in a child process, never in-process.
