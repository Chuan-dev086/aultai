import { randomUUID } from "node:crypto";
import { PRODUCTS } from "./models.js";
import { subtotal, tax, shipping } from "./pricing.js";
import { validateVoucher } from "./vouchers.js";
import { checkStock, reserveStock } from "./inventory.js";

/**
 * Round a monetary amount to two decimals.
 * @param {number} amount
 * @returns {number}
 */
export function roundToCents(amount) {
  return Math.round(amount * 100) / 100;
}

/**
 * Calculate the final checkout total for a cart, applying an optional voucher.
 * @param {import("./models.js").Cart} cart
 * @param {import("./models.js").Voucher | null} voucher
 * @param {Date} now
 * @returns {number} The final total in the same currency unit as the cart.
 */
export function calculateCheckoutTotal(cart, voucher, now) {
  const discountableSubtotal = subtotal(cart, PRODUCTS);
  const taxAmount = tax(discountableSubtotal);
  const shippingAmount = shipping(discountableSubtotal);
  if (voucher === null || voucher === undefined) {
    return roundToCents(discountableSubtotal + taxAmount + shippingAmount);
  }
  validateVoucher(voucher, now);
  if (discountableSubtotal < voucher.minSpend) {
    throw new Error(
      `Minimum spend of ${voucher.minSpend.toFixed(2)} not met for voucher ${voucher.code}`,
    );
  }
  if (voucher.type === "percent") {
    const discount = (discountableSubtotal * voucher.value) / 100;
    return roundToCents(
      discountableSubtotal + taxAmount + shippingAmount - discount,
    );
  }
  const discount = Math.min(voucher.value, discountableSubtotal);
  const total = Math.max(
    0,
    discountableSubtotal + taxAmount + shippingAmount - discount,
  );
  return roundToCents(total);
}

/**
 * Place an order: check stock, reserve it, and compute the final total.
 * @param {import("./models.js").Cart} cart
 * @param {import("./models.js").Voucher | null} voucher
 * @param {Date} now
 * @returns {import("./models.js").Order} The placed order.
 */
export function placeOrder(cart, voucher, now) {
  for (const item of cart.items) {
    if (!checkStock(item.productId, item.quantity)) {
      throw new Error(`Insufficient stock for product: ${item.productId}`);
    }
  }
  const total = calculateCheckoutTotal(cart, voucher, now);
  for (const item of cart.items) {
    reserveStock(item.productId, item.quantity);
  }
  return {
    id: randomUUID(),
    items: cart.items,
    total,
    voucherCode:
      voucher === null || voucher === undefined ? null : voucher.code,
    placedAt: now,
  };
}
