import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const PORT = Number(process.env.PORT ?? 3000);

// NOTE: the repo path contains a space ("hackathon 2026") — keep it quoted
// wherever WORKSPACE_DIR is interpolated into shell commands.
export const WORKSPACE_DIR = "C:\\Users\\User\\Desktop\\hackathon 2026\\aultai\\packages\\workspace";

export const MOCK_AI = process.env.MOCK_AI !== "0";

export const SHOP_API_DIR = path.join(WORKSPACE_DIR, "shop-api");

export { here };
