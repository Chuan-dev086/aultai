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

### AI provider

Live AI features use a provider configured for the backend. Gemini is the default option; direct DeepSeek API and OpenRouter are also supported. Provider availability and quotas can change, and AultAI reports provider failures instead of presenting mock output as live AI. The API key is read only by the backend process and must never be added to frontend code or committed files.

For Google Gemini 3.1 Flash-Lite, set these variables in the same PowerShell window used to start the backend:

```powershell
$env:AI_PROVIDER = "gemini"
$env:GEMINI_API_KEY = "<your Google AI API key>"
$env:GEMINI_MODEL = "gemini-3.1-flash-lite"
```

To use Recursive: Flint (free) through OpenRouter instead, set an OpenRouter key and select OpenRouter:

```powershell
$env:AI_PROVIDER = "openrouter"
$env:OPENROUTER_API_KEY = "<your OpenRouter API key>"
$env:OPENROUTER_MODEL = "recursive/flint-v1.0:free"
```

To use a key created on DeepSeek's platform directly, select DeepSeek (not OpenRouter):

```powershell
$env:AI_PROVIDER = "deepseek"
$env:DEEPSEEK_API_KEY = "<your DeepSeek API key>"
$env:DEEPSEEK_MODEL = "deepseek-flash"
```

To try a college-provided OpenAI-compatible API, configure its HTTPS base URL, model name, and Bearer token:

```powershell
$env:AI_PROVIDER = "custom"
$env:CUSTOM_AI_BASE_URL = "https://your-college-api.example/v1"
$env:CUSTOM_AI_MODEL = "your-model-name"
$env:CUSTOM_AI_API_KEY = "your-college-token"
```

The custom provider appends `/chat/completions` to the base URL, sends the token as a Bearer credential, and requests JSON mode for structured AultAI responses. The API must support the OpenAI-compatible Chat Completions format and `response_format: { "type": "json_object" }`. Use the exact base URL and model name from the college's instructions; do not include the token in the URL. `GEMINI_MODEL`, `OPENROUTER_MODEL`, and `DEEPSEEK_MODEL` are optional; each defaults to the model shown above. OpenRouter's free-model availability and limits are not guaranteed. Structured outputs are independently validated by AultAI; the model may still return unusable results. Providers receive relevant project context for AI requests, after likely-secret redaction. Review every suggested patch; AultAI only applies it after an explicit approval and exact source verification.

AI request progress is logged in the backend terminal with the task, provider/model, attempt statuses, response finish reason, and response field names. Logs do not include API keys, prompts, source code, or generated code. Fix generation retries once when the selected provider omits required fields or returns source that does not match the current file. A remaining source mismatch is shown as an unverified suggestion; AultAI disables applying it and offers a manual retry.

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

1. **Explore (Graph)** — Browse and rearrange the dagre-laid-out call graph; drag nodes, zoom in/out, and click `checkout.calculateCheckoutTotal` to inspect its source, docstring, callers, and callees. All files shows the full project graph and warns that large graphs may render slowly. Select a file to focus on its nodes plus directly connected symbols and imported modules from other files.
2. **Diagnose (Analyze)** — Click Analyze. Offline mock mode returns the two planted checkout issues; with a live AI provider configured, Analyze also examines the active project's JavaScript/JSX source and returns validated findings.
3. **Review (Issue modal)** — Click an issue to open FixReview: original vs proposed code, unified diff, rationale, impacted nodes. Click Apply Fix (explicit action, creates a `.bak`); Undo reverts.
4. **Test (Tests tab)** — Run Tests executes the active project's `npm test` script. For projects without a test script, generate runnable Node.js test modules and explicitly choose **Save and Run Generated Tests**; this saves them under `.aultai-tests/<run-id>` and executes them with Node's built-in test runner. Review generated code before running it because it executes with the same permissions as the backend user. AI explanations use the recorded test-run output.
5. **Verify (Preview/Perf)** — Preview tab: view the shop-api demo or start an uploaded project preview in the embedded iframe. The API Inspector statically lists supported Express-style routes with their HTTP methods and source locations; computed route paths and routes from other frameworks may not be detected. Use the viewport presets or width slider to check responsive layouts. Perf tab: run a local load test against the active project's backend and compare RPS / p95 / error rate; AI recommendations analyze the measured result only.

The **AI Solution** tab can start from a detected issue or a source file in the active project. It loads the selected file and, for issues, fills the description from the finding; review or edit that context, request a proposal, inspect the diff, explicitly approve it, and run the active project's real test command. AI proposals are never applied automatically.

## Notes

- **Local-only backend:** The backend binds to `127.0.0.1` and rejects API mutations from non-local browser origins. Do not expose it through a network proxy: uploading or starting a project runs scripts from that project with the backend user's permissions, and Run Tests executes the active project's test command. Only upload and run projects you trust.
- **Uploaded projects:** Each upload is extracted into a new managed version directory. Use **Uploaded Projects** in the top bar to review saved uploads and permanently delete one; deleting the current upload stops it and switches the workspace to `shop-api` first.
- **MOCK MODE:** Without a backend AI provider key, Analyze and Inspector use clearly labeled deterministic/offline behavior and test generation returns labeled mock suggestions. Live-only fix generation, test-result explanation, and performance recommendations report that an AI provider must be configured. Provider failures, rate limits, invalid responses, and timeouts are surfaced rather than silently replaced with mock results.
- **Safety rules:** AultAI never auto-applies fixes (apply is an explicit user action with `.bak` backup + revert), never `eval`s analyzed code (parsing is `@babel/parser` only), and runs Vitest in a child process, never in-process.
