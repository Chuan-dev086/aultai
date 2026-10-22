import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const PORT = Number(process.env.PORT ?? 3000);

// Resolve the workspace relative to this file instead of hardcoding an
// absolute path, so the repo works on any machine / OS.
// here        = packages/backend/src
// ..          = packages/backend
// ../..       = packages
// ../../workspace = packages/workspace
// An explicit WORKSPACE_DIR env var still takes precedence if set.
export const WORKSPACE_DIR =
  process.env.WORKSPACE_DIR || path.resolve(here, "..", "..", "workspace");

export const MOCK_AI = process.env.MOCK_AI !== "0";

export const SHOP_API_DIR = path.join(WORKSPACE_DIR, "shop-api");

export { here };
