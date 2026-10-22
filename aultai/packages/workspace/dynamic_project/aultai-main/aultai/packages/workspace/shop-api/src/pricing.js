export const TAX_RATE = 0.1;
export const FREE_SHIPPING_THRESHOLD = 100.0;
export const FLAT_SHIPPING = 5.0;

/**
 * Compute the total for a single line (unit price times quantity).
 * @param {number} unitPrice
 * @param {number} quantity
 * @returns {number}
 */
export function lineTotal(unitPrice, quantity) {
  return unitPrice * quantity;
}

/**
 * Compute the cart subtotal by looking up each item's product price.
 * @param {import("./models.js").Cart} cart
 * @param {import("./models.js").Product[]} catalog
 * @returns {number}
 */
export function subtotal(cart, catalog) {
  const byId = new Map(catalog.map((p) => [p.id, p]));
  let sum = 0;
  for (const item of cart.items) {
    const product = byId.get(item.productId);
    if (product === undefined) {
      throw new Error(`Unknown product: ${item.productId}`);
    }
    sum += lineTotal(product.price, item.quantity);
  }
  return sum;
}

/**
 * Compute tax on the given amount.
 * @param {number} amount
 * @returns {number}
 */
export function tax(amount) {
  return amount * TAX_RATE;
}

/**
 * Compute shipping for the given amount (free above the threshold).
 * @param {number} amount
 * @returns {number}
 */
export function shipping(amount) {
  if (amount >= FREE_SHIPPING_THRESHOLD) {
    return 0;
  }
  return FLAT_SHIPPING;
}
