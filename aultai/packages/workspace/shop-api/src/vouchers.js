/**
 * Validate that a voucher may be used at the given time.
 * @param {import("./models.js").Voucher} voucher
 * @param {Date} now
 * @returns {true}
 * @throws {Error} When the voucher is expired.
 */
export function validateVoucher(voucher, now) {
  if (voucher.expiresAt !== null && voucher.expiresAt <= now) {
    throw new Error("Voucher expired");
  }
  return true;
}

/**
 * Apply a voucher to a subtotal, returning the discounted subtotal.
 * @param {number} subtotal
 * @param {import("./models.js").Voucher} voucher
 * @param {Date} now
 * @returns {number} The discounted subtotal.
 * @throws {Error} When the voucher is expired, below min spend, or unknown.
 */
export function applyVoucher(subtotal, voucher, now) {
  validateVoucher(voucher, now);
  if (subtotal < voucher.minSpend) {
    throw new Error(
      `Minimum spend of ${voucher.minSpend.toFixed(2)} not met for voucher ${voucher.code}`,
    );
  }
  if (voucher.type === "percent") {
    return subtotal - (subtotal * voucher.value) / 100;
  }
  if (voucher.type === "fixed") {
    return subtotal - voucher.value;
  }
  throw new Error(`Unknown voucher type: ${voucher.type}`);
}
