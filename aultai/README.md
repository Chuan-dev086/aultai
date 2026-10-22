# AultAI — AI-Powered SDLC Tool

AultAI helps engineers understand code, locate bugs, and review AI-generated fixes — demonstrated against a small e-commerce checkout backend with two intentionally planted bugs: a fixed-amount voucher that drives the order total negative (BUG 1: `MINUS50` on a 19.90 cart yields `-23.11`) and an inverted voucher-expiry comparison that accepts expired vouchers while rejecting valid ones (BUG 2).

## Layout

- `packages/workspace/shop-api` — demo subject: Express checkout app + Vitest ground truth (never modified by AultAI, except the one allowed `public/index.html` preview page)
- `packages/backend` — Express API: code graph (`@babel/parser`), heuristic + LLM analysis with mock fallback, fix proposals with explicit apply/revert (`.bak` backups), child-process Vitest runs, autocannon load tests
- `packages/frontend` — React + Vite + Tailwind + React Flow: graph explorer, node inspector, issues, fix review, test lab, full-stack preview, perf lab, guided demo stepper

## Setup

Requirements: Node 20 LTS (Node 26.5.0 was used during development and is a recorded deviation).

```sh
npm install
```

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
2. **Diagnose (Analyze)** — Click Analyze. The backend returns exactly 2 high-severity issues (BUG 1 in `checkout.js:40`, BUG 2 in `vouchers.js:9`) in MOCK MODE.
3. **Review (Issue modal)** — Click an issue to open FixReview: original vs proposed code, unified diff, rationale, impacted nodes. Click Apply Fix (explicit action, creates a `.bak`); Undo reverts.
4. **Test (Tests tab)** — Generate the 8-test regression suite, then Run Tests. With bugs present expect failures; after applying the BUG 1 fix the floor-at-zero tests pass.
5. **Verify (Preview/Perf)** — Preview tab: checkout 1× 19.90 with MINUS50 in the live iframe and watch the red "Total cannot be negative!" banner. Perf tab: hammer `POST /shop-api/cart/checkout` with autocannon and compare RPS / p95 / error rate across runs.

## Notes

- **MOCK MODE:** Without `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` set, all AI calls (`llm.js`) return deterministic offline responses — the demo works fully offline. Set either key to attempt live provider calls (failures fall back to mock, never throw).
- **Safety rules:** AultAI never auto-applies fixes (apply is an explicit user action with `.bak` backup + revert), never `eval`s analyzed code (parsing is `@babel/parser` only), and runs Vitest in a child process, never in-process.
