import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const PORT = Number(process.env.PORT ?? 3000);

// Resolved relative to this file (packages/backend/src -> packages/workspace),
// so the project works from any folder on any machine. Override with the
// WORKSPACE_DIR environment variable if needed. The path may contain spaces —
// keep it quoted wherever it is interpolated into shell commands.
export const WORKSPACE_DIR = process.env.WORKSPACE_DIR ?? path.resolve(here, "..", "..", "workspace");

export const MOCK_AI = process.env.MOCK_AI !== "0";

export const SHOP_API_DIR = path.join(WORKSPACE_DIR, "shop-api");

export { here };
