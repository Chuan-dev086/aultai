import { getActiveSubdir, readFile, listJsFiles } from "./sandbox.js";
import { isMockMode } from "./llm.js";
import { requestAI } from "./aiService.js";

/**
 * @typedef {Object} GeneratedTestCase
 * @property {string} name
 * @property {string} code
 */

const MOCK_SUITE = [
  {
    name: "applies SAVE10 percent voucher on a 129.00 cart",
    code: `  it("applies SAVE10 percent voucher on a 129.00 cart", () => {
    const cart = { items: [{ productId: "p3", quantity: 1 }] };
    expect(calculateCheckoutTotal(cart, SAVE10, NOW)).toBeCloseTo(129, 2);
  });`,
  },
  {
    name: "applies MINUS50 fixed voucher on a 129.00 cart",
    code: `  it("applies MINUS50 fixed voucher on a 129.00 cart", () => {
    const cart = { items: [{ productId: "p3", quantity: 1 }] };
    expect(calculateCheckoutTotal(cart, MINUS50, NOW)).toBeCloseTo(91.9, 2);
  });`,
  },
  {
    name: "floors the grand total at zero for MINUS50 on a 19.90 cart",
    code: `  it("floors the grand total at zero for MINUS50 on a 19.90 cart", () => {
    const cart = { items: [{ productId: "p1", quantity: 1 }] };
    expect(calculateCheckoutTotal(cart, MINUS50, NOW)).toBeGreaterThanOrEqual(0);
  });`,
  },
  {
    name: "rejects EXPIRED10 as expired",
    code: `  it("rejects EXPIRED10 as expired", () => {
    const cart = { items: [{ productId: "p1", quantity: 1 }] };
    expect(() => calculateCheckoutTotal(cart, EXPIRED10, NOW)).toThrow("Voucher expired");
  });`,
  },
  {
    name: "rejects SAVE10 below its minSpend of 50",
    code: `  it("rejects SAVE10 below its minSpend of 50", () => {
    const cart = { items: [{ productId: "p1", quantity: 1 }] };
    expect(() => calculateCheckoutTotal(cart, SAVE10, NOW)).toThrow();
  });`,
  },
  {
    name: "computes tax from TAX_RATE",
    code: `  it("computes tax from TAX_RATE", () => {
    expect(tax(100)).toBeCloseTo(100 * TAX_RATE, 10);
  });`,
  },
  {
    name: "ships free above FREE_SHIPPING_THRESHOLD",
    code: `  it("ships free above FREE_SHIPPING_THRESHOLD", () => {
    expect(shipping(FREE_SHIPPING_THRESHOLD + 29)).toBe(0);
  });`,
  },
  {
    name: "adds FLAT_SHIPPING below the threshold",
    code: `  it("adds FLAT_SHIPPING below the threshold", () => {
    expect(calculateCheckoutTotal({ items: [{ productId: "p1", quantity: 1 }] }, null, NOW)).toBeCloseTo(
      19.9 + 19.9 * TAX_RATE + FLAT_SHIPPING,
      2,
    );
  });`,
  },
];

/**
 * Generate test-case suggestions without writing project files.
 * @returns {Promise<{ tests: GeneratedTestCase[] }>} The generated test cases.
 */
export async function generateTests() {
  if (isMockMode()) {
    return { tests: MOCK_SUITE.map((test) => ({ ...test })), mode: "mock" };
  }
  const active = getActiveSubdir();
  const sourceFiles = [];
  let budget = 24000;
  for (const file of await listJsFiles(active)) {
    if (budget <= 0) break;
    try {
      const source = (await readFile(file)).slice(0, Math.min(5000, budget));
      sourceFiles.push({ file: file.slice(active.length + 1), source });
      budget -= Buffer.byteLength(source, "utf8");
    } catch {
      continue;
    }
  }
  let dependencies = {};
  try {
    const packageInfo = JSON.parse(await readFile(`${active}/package.json`));
    dependencies = {
      dependencies: packageInfo.dependencies ?? {},
      devDependencies: packageInfo.devDependencies ?? {},
      testScript: packageInfo.scripts?.test ?? null,
    };
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  const result = await requestAI({
    task: "generate_tests",
    context: { project: active, dependencies, files: sourceFiles },
  });
  if (!Array.isArray(result.tests)) {
    throw testGenError("AI_INVALID_RESPONSE", "The AI response did not include test cases.");
  }
  const tests = result.tests
    .filter((item) => item !== null && typeof item.name === "string" && typeof item.code === "string")
    .slice(0, 20)
    .map((item) => ({ name: item.name.slice(0, 300), code: item.code.slice(0, 5000) }));
  if (tests.length === 0) {
    throw testGenError("AI_INVALID_RESPONSE", "The AI did not return any valid test cases.");
  }
  const runnableTests = tests.filter((item) =>
    /node:test/.test(item.code) &&
    /node:assert\/strict/.test(item.code) &&
    /\b(?:test|it)\s*\(/.test(item.code),
  );
  if (runnableTests.length === 0) {
    throw testGenError(
      "AI_INVALID_RESPONSE",
      "The AI did not return runnable Node.js test files. Retry Generate Tests.",
    );
  }
  return { tests: runnableTests, mode: "live" };
}

function testGenError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}
