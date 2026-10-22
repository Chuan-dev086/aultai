import { PRODUCTS } from "./models.js";

const stock = new Map(PRODUCTS.map((p) => [p.id, 100]));

/**
 * Check whether the requested quantity of a product is in stock.
 * @param {string} productId
 * @param {number} quantity
 * @returns {boolean} True when enough stock is available.
 */
export function checkStock(productId, quantity) {
  return (stock.get(productId) ?? 0) >= quantity;
}

/**
 * Reserve (decrement) stock for a product.
 * @param {string} productId
 * @param {number} quantity
 * @returns {void}
 * @throws {Error} When there is not enough stock.
 */
export function reserveStock(productId, quantity) {
  if (!checkStock(productId, quantity)) {
    throw new Error(`Insufficient stock for product: ${productId}`);
  }
  stock.set(productId, stock.get(productId) - quantity);
}

/**
 * Reset all stock levels (test helper).
 * @param {number} level
 * @returns {void}
 */
export function resetStock(level = 100) {
  for (const p of PRODUCTS) {
    stock.set(p.id, level);
  }
}
