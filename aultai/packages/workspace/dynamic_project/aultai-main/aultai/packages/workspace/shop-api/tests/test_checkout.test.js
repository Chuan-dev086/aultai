import { describe, it, expect } from "vitest";
import { SAVE10, MINUS50, EXPIRED10 } from "../src/models.js";
import {
  TAX_RATE,
  FREE_SHIPPING_THRESHOLD,
  FLAT_SHIPPING,
  lineTotal,
  subtotal,
  tax,
  shipping,
} from "../src/pricing.js";
import { PRODUCTS } from "../src/models.js";
import { calculateCheckoutTotal } from "../src/checkout.js";

const NOW = new Date("2024-06-01T12:00:00.000Z");

describe("pricing", () => {
  it("computes a line total", () => {
    expect(lineTotal(19.9, 2)).toBeCloseTo(39.8, 2);
  });

  it("computes a cart subtotal", () => {
    const cart = {
      items: [
        { productId: "p1", quantity: 1 },
        { productId: "p2", quantity: 1 },
      ],
    };
    expect(subtotal(cart, PRODUCTS)).toBeCloseTo(19.9 + 49.9, 2);
  });

  it("computes tax from TAX_RATE", () => {
    expect(tax(100)).toBeCloseTo(100 * TAX_RATE, 10);
  });

  it("ships free above FREE_SHIPPING_THRESHOLD", () => {
    expect(shipping(FREE_SHIPPING_THRESHOLD + 29)).toBe(0);
  });

  it("charges FLAT_SHIPPING below the threshold", () => {
    expect(shipping(19.9)).toBe(FLAT_SHIPPING);
  });
});

describe("vouchers on a 129.00 cart", () => {
  const cart = { items: [{ productId: "p3", quantity: 1 }] };

  it("applies SAVE10 percent voucher", () => {
    // 129 + 12.90 tax + 0 shipping - 12.90 discount = 129.00
    expect(calculateCheckoutTotal(cart, SAVE10, NOW)).toBeCloseTo(129, 2);
  });

  it("applies MINUS50 fixed voucher", () => {
    // 129 + 12.90 tax + 0 shipping - 50 discount = 91.90
    expect(calculateCheckoutTotal(cart, MINUS50, NOW)).toBeCloseTo(91.9, 2);
  });
});

describe("voucher edge cases", () => {
  const smallCart = { items: [{ productId: "p1", quantity: 1 }] };

  it("rejects SAVE10 below its minSpend of 50", () => {
    expect(() => calculateCheckoutTotal(smallCart, SAVE10, NOW)).toThrow();
  });

  it("floors the grand total at zero for MINUS50 on a 19.90 cart (BUG 1)", () => {
    const total = calculateCheckoutTotal(smallCart, MINUS50, NOW);
    expect(total).toBeGreaterThanOrEqual(0);
  });

  it("rejects EXPIRED10 as expired (BUG 2)", () => {
    expect(() => calculateCheckoutTotal(smallCart, EXPIRED10, NOW)).toThrow(
      "Voucher expired",
    );
  });
});
