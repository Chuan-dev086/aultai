# AultAI (Phase 0)

AI-assisted software development tool prototype. Phase 0 scaffolds the
monorepo and the sample e-commerce checkout backend under analysis.

## Layout

- `packages/workspace/shop-api` — sample e-commerce app (Express + Vitest)
- `packages/backend` — AultAI backend skeleton
- `packages/frontend` — AultAI frontend skeleton (Vite + React)

## Run

```sh
npm install
npm test -w packages/workspace/shop-api
node packages/backend/src/index.js
```

## Notes

- The `shop-api` ground-truth tests assert correct behavior; exactly 2 fail
  in Phase 0 because two bugs are intentionally planted (see AGENTS.md).
- Node 20 LTS is the declared runtime (see AGENTS.md); Node 26.5.0 was used
  for Phase 0 scaffolding and is recorded as a deviation in the Stage Report.
