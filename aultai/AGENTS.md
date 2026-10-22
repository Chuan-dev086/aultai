# AGENTS.md — AultAI Shared Project Context (Node / Express / JavaScript Edition)

## Project Identity

AultAI is an AI-assisted software development tool prototype that helps engineers
understand code, locate bugs, review AI-generated fixes, automate regression testing,
and measure performance. The demo subject is a small e-commerce checkout backend.

## Tech Stack (mandatory — do not substitute)

- Language: plain JavaScript (ESM, `.js` / `.jsx`), Node 20 LTS.
  NO TypeScript, NO `.ts` / `.tsx` files, NO `tsconfig.json`, NO `tsc` in the
  toolchain, NO type annotations in code.
- Backend framework: Express 4.x
- Runtime input validation: Zod (used strictly at runtime — no inferred types,
  no compile-time type checking)
- Dev runtime: Node 20's `node --watch` (do not add nodemon unless `--watch` is
  unavailable, and never both)
- Code parsing: @babel/parser with `plugins: ["jsx", "classProperties"]`
  (do NOT enable the "typescript" plugin)
- Test execution: Vitest, invoked via subprocess with `--reporter=json`
- Load testing: autocannon
- Frontend: React 18 + JavaScript (JSX in `.jsx` files) + Vite 5, Tailwind CSS 3,
  React Flow 11, Recharts 2
- Monorepo: npm workspaces (3 packages)
- AI: a single provider-agnostic `llm.js` with a MOCK MODE fallback

## Repository Layout (final shape; created incrementally per phase)

aultai/
package.json # root, defines npm workspaces
AGENTS.md
README.md
packages/
backend/
package.json
src/
index.js # Express app entrypoint
config.js # WORKSPACE_DIR, MOCK_AI, PORT
models.js # Zod schemas + JSDoc typedefs
routes/
graph.js analysis.js fixes.js tests.js perf.js
services/
parser.js graphBuilder.js analyzer.js fixer.js
testgen.js testrunner.js perf.js llm.js sandbox.js
workspace/
shop-api/ # the sample e-commerce app under analysis
package.json # "type": "module"
src/
models.js pricing.js vouchers.js inventory.js
checkout.js api.js
tests/
test_checkout.test.js # ground truth (never modified by AultAI)
frontend/
package.json
vite.config.js
tailwind.config.js
index.html
src/
App.jsx
api/client.js
types.js # JSDoc @typedef declarations for API shapes
components/
CodeGraph.jsx NodeInspector.jsx IssuesPanel.jsx
FixReview.jsx DiffViewer.jsx TestLab.jsx
PerfLab.jsx FileTree.jsx

## Sample E-Commerce App (packages/workspace/shop-api) Spec

Language: plain JavaScript (ESM). It is a real Express app with real tests — not
pseudocode. Every exported function MUST have a JSDoc block with `@param` and
`@returns`. This JSDoc is what the parser exposes in the NodeInspector.

Files and responsibilities:

- src/models.js : Product, CartItem, Cart, Voucher (code, type: "percent" | "fixed",
  value, expiresAt: Date, minSpend), Order, OrderTotal.
  Use Zod schemas for runtime input validation at the API boundary.
- src/pricing.js : lineTotal(), subtotal(), tax(), shipping()
- src/vouchers.js : validateVoucher(voucher, now), applyVoucher(subtotal, voucher, now)
- src/inventory.js: checkStock(), reserveStock()
- src/checkout.js : calculateCheckoutTotal(cart, voucher, now), placeOrder()
- src/api.js : Express router: POST /cart/checkout, GET /products, GET /health
- tests/test_checkout.test.js: Vitest test suite

Data (must be identical across code and tests):

- Products priced 19.90, 49.90, 129.00
- Vouchers:
  SAVE10 : type "percent", value 10, expiresAt: null (never expires), minSpend: 50
  MINUS50 : type "fixed", value 50, expiresAt: null (never expires), minSpend: 0
  EXPIRED10 : type "percent", value 10, expiresAt in the past, minSpend: 0
  SAVE10 and MINUS50 never expire so BUG 1 is reachable independently of BUG 2.
  In `src/models.js` the Zod Voucher schema must use `expiresAt: z.date().nullable()`
  and `minSpend: z.number().nonnegative()`, and the JSDoc must say `Date | null`
  for `expiresAt`.
- Tax rate and shipping rules: define them as named constants in pricing.js and use
  those same constants in the tests (no magic numbers).

Clock rule: `now: Date` is an EXPLICIT parameter threaded through validateVoucher,
applyVoucher, and calculateCheckoutTotal. Nothing inside those three functions
calls `new Date()` or `Date.now()`. Tests pass fixed dates so results are
deterministic.

## Two Bugs That MUST Be Planted (core of the demo — do not omit, do not "helpfully" fix)

BUG 1 (authoritative location: checkout.js; vouchers.js.applyVoucher is legacy dead code):
A fixed-amount voucher is subtracted from the grand total WITHOUT
(a) capping the discount at the discountable subtotal, and
(b) flooring the grand total at zero.
Result: MINUS50 applied to a 19.90 cart produces -23.11.
Correct logic:
const discount = Math.min(voucher.value, discountableSubtotal)
const total = Math.max(0, discountableSubtotal + tax + shipping - discount)
The buggy version computes:
const total = discountableSubtotal + taxAmount + shippingAmount - voucher.value
with no clamp and no floor.
**BUG 1 — authoritative location**: The live BUG 1 is in
`packages/workspace/shop-api/src/checkout.js`, in the inline calculation
`discountableSubtotal + taxAmount + shippingAmount - voucher.value` inside
`calculateCheckoutTotal`. The `applyVoucher` function in `vouchers.js` is
legacy dead code — Phase 3's analyzer MUST ignore it, Phase 4's fixer MUST
NOT modify it, Phase 5's tests do not exercise it. Only fix the checkout.js
inline path.

BUG 2 (vouchers.js):
The expiry comparison is INVERTED. The current buggy code must read:
if (voucher.expiresAt !== null && voucher.expiresAt > now) {
throw new Error("Voucher expired")
}
so that expired vouchers are ACCEPTED and valid vouchers are REJECTED.
Correct logic: throw if `voucher.expiresAt !== null && voucher.expiresAt <= now`.

Both bugs must be reachable through calculateCheckoutTotal() so tests catch them.

### Full-Stack Preview Additions (Exempt from "do not modify shop-api" rule)

To support the Full-Stack Preview demo, exactly ONE new file is allowed under
`packages/workspace/shop-api`:

- `public/index.html` : a single-file, vanilla HTML/JS page.
  - It must serve a minimal UI with a "Checkout" button.
  - The button must `fetch("/cart/checkout")` with a hardcoded payload:
    1x 19.90 product and the `MINUS50` voucher.
  - The UI must display the returned total in large text, and if the total is
    negative, show a red error banner: "Error: Total cannot be negative!"
  - This file is part of the demo subject (the buggy app), not AultAI itself.

## Hard Rules

1. Build only what the current phase asks for. Do not pre-implement later modules.
   Do not "conveniently" refactor already-accepted code.
2. Do not modify files accepted in a prior phase unless the current phase explicitly
   requires it.
3. Do not perform unrequested "optimizations / beautification / modernization."
   This explicitly includes: do NOT add ESLint / Prettier / Husky / editorconfig
   configs, do NOT convert to CommonJS, do NOT rename files, do NOT extract helpers
   "for cleanliness," unless the current phase asks.
4. Do not introduce dependencies outside the declared stack. If you believe one is
   needed, STOP and describe it in the Stage Report — do not install it silently.
5. All file reads and writes must go through `services/sandbox.js` and stay within
   WORKSPACE_DIR. `sandbox.js` must resolve paths and reject traversal
   (`..`, absolute paths outside WORKSPACE_DIR, symlinks escaping the directory).
6. Never `eval`, `new Function()`, or `vm.runInNewContext()` on analyzed code.
   Parsing uses @babel/parser only.
7. Never auto-apply an AI fix. `apply` is always an explicit user action. Always
   create a `.bak` next to the modified file before writing, and support revert.
8. Never run arbitrary code from the analyzed project in the same process.
   Test execution runs Vitest in a child process with a timeout.
9. At the end of each phase, output a Stage Report (format defined per phase) and
   STOP, waiting for review. Do not proceed to the next phase on your own.

10. Git repo root is the parent of `aultai/` (`C:\Users\User\Desktop\hackathon 2026`).
    The `aultai/` folder is a subdirectory. Run read-only git commands
    (`git status`, `git diff`, `git log`) from the parent directory and use
    `aultai/...` path prefixes in the output.

## General Code Style (JavaScript edition)

- ESM only (`import` / `export`). Every package's `package.json` sets `"type": "module"`.
- Every EXPORTED function has a JSDoc block. Required tags: `@param` for each arg,
  `@returns`. Optional: `@throws`. Example:
  /\*\*

* Calculate the final checkout total for a cart, applying an optional voucher.
* @param {import('./models.js').Cart} cart
* @param {import('./models.js').Voucher | null} voucher
* @param {Date} now
* @returns {number} The final total in the same currency unit as the cart.
  \*/
  export function calculateCheckoutTotal(cart, voucher, now) { ... }

- Use `const` by default; `let` only when reassignment is required. Never `var`.
- Use `===` and `!==`; never `==` or `!=` (except for `== null` when intentional,
  and even then prefer an explicit check).
- `async` / `await` only. No `.then()` chains.
- No bare `catch`. Route handlers wrap errors and return
  `{ error: { code, message } }` JSON with an appropriate HTTP status.
- Keep files under ~300 lines. Split aggressively.
- Frontend: functional components + hooks. All API access goes through
  `api/client.js`. Shape documentation lives in `types.js` as JSDoc `@typedef`s
  (for example `@typedef {Object} Node` with `@property` lines). No type annotations
  in code — only JSDoc comments.

## What "Node-appropriate" means for this project

- Write idiomatic modern JavaScript. Do NOT try to mimic Python idioms
  (`snake_case`, `__init__`, `self`, `len()`) or TypeScript idioms (interface
  declarations, `as`, generics, enums).
- Do NOT port Python AST concepts literally. The parser in `services/parser.js`
  targets @babel/parser AST nodes: `Program`, `VariableDeclaration`,
  `VariableDeclarator`, `FunctionDeclaration`, `FunctionExpression`,
  `ArrowFunctionExpression`, `ClassDeclaration`, `ClassMethod`, `ImportDeclaration`,
  `CallExpression`, `MemberExpression`, `Identifier`. JSDoc comments are extracted
  via `ast.comments` (enable `attachComment: true` when parsing).
- Module resolution for the call graph: static `import` / `export` only in the
  sample app. If a call target cannot be resolved, create an `external` node —
  do not drop the edge.
- Runtime validation (Zod) is for API inputs only. Do not use it as a substitute
  for good JSDoc documentation, and do not claim "type safety" anywhere — there
  is none at compile time.

## Optional (only if you later decide you want static checking)

If the human later asks for static checking, the recommended approach is
`// @ts-check` at the top of files plus JSDoc — this does NOT change runtime, does
NOT require `.ts` files, and does NOT require a build step. Do NOT add it unless
explicitly requested.
