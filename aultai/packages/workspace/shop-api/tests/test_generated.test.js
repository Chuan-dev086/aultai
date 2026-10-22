import { describe, it, expect } from "vitest";
import { SAVE10, MINUS50, EXPIRED10 } from "../src/models.js";
import { TAX_RATE, FREE_SHIPPING_THRESHOLD, FLAT_SHIPPING, tax, shipping } from "../src/pricing.js";
import { calculateCheckoutTotal } from "../src/checkout.js";

const NOW = new Date("2024-06-01T12:00:00.000Z");

describe("generated checkout regression", () => {
  it("applies SAVE10 percent voucher on a 129.00 cart", () => {
    const cart = { items: [{ productId: "p3", quantity: 1 }] };
    expect(calculateCheckoutTotal(cart, SAVE10, NOW)).toBeCloseTo(129, 2);
  });
  it("applies MINUS50 fixed voucher on a 129.00 cart", () => {
    const cart = { items: [{ productId: "p3", quantity: 1 }] };
    expect(calculateCheckoutTotal(cart, MINUS50, NOW)).toBeCloseTo(91.9, 2);
  });
  it("floors the grand total at zero for MINUS50 on a 19.90 cart", () => {
    const cart = { items: [{ productId: "p1", quantity: 1 }] };
    expect(calculateCheckoutTotal(cart, MINUS50, NOW)).toBeGreaterThanOrEqual(0);
  });
  it("rejects EXPIRED10 as expired", () => {
    const cart = { items: [{ productId: "p1", quantity: 1 }] };
    expect(() => calculateCheckoutTotal(cart, EXPIRED10, NOW)).toThrow("Voucher expired");
  });
  it("rejects SAVE10 below its minSpend of 50", () => {
    const cart = { items: [{ productId: "p1", quantity: 1 }] };
    expect(() => calculateCheckoutTotal(cart, SAVE10, NOW)).toThrow();
  });
  it("computes tax from TAX_RATE", () => {
    expect(tax(100)).toBeCloseTo(100 * TAX_RATE, 10);
  });
  it("ships free above FREE_SHIPPING_THRESHOLD", () => {
    expect(shipping(FREE_SHIPPING_THRESHOLD + 29)).toBe(0);
  });
  it("adds FLAT_SHIPPING below the threshold", () => {
    expect(calculateCheckoutTotal({ items: [{ productId: "p1", quantity: 1 }] }, null, NOW)).toBeCloseTo(
      19.9 + 19.9 * TAX_RATE + FLAT_SHIPPING,
      2,
    );
  });
});
