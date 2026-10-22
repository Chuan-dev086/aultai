import { z } from "zod";

/**
 * @typedef {Object} Product
 * @property {string} id
 * @property {string} name
 * @property {number} price
 */

/**
 * @typedef {Object} CartItem
 * @property {string} productId
 * @property {number} quantity
 */

/**
 * @typedef {Object} Cart
 * @property {CartItem[]} items
 */

/**
 * @typedef {Object} Voucher
 * @property {string} code
 * @property {"percent" | "fixed"} type
 * @property {number} value
 * @property {Date | null} expiresAt
 * @property {number} minSpend
 */

/**
 * @typedef {Object} OrderTotal
 * @property {number} subtotal
 * @property {number} discount
 * @property {number} tax
 * @property {number} shipping
 * @property {number} total
 */

/**
 * @typedef {Object} Order
 * @property {string} id
 * @property {CartItem[]} items
 * @property {number} total
 * @property {string | null} voucherCode
 * @property {Date} placedAt
 */

export const ProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number().nonnegative(),
});

export const CartItemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().positive(),
});

export const CartSchema = z.object({
  items: z.array(CartItemSchema),
});

export const VoucherSchema = z.object({
  code: z.string(),
  type: z.enum(["percent", "fixed"]),
  value: z.number().nonnegative(),
  expiresAt: z.date().nullable(),
  minSpend: z.number().nonnegative(),
});

export const OrderTotalSchema = z.object({
  subtotal: z.number(),
  discount: z.number(),
  tax: z.number(),
  shipping: z.number(),
  total: z.number(),
});

export const OrderSchema = z.object({
  id: z.string(),
  items: z.array(CartItemSchema),
  total: z.number(),
  voucherCode: z.string().nullable(),
  placedAt: z.date(),
});

/** @type {Product[]} */
export const PRODUCTS = [
  { id: "p1", name: "Basic Tee", price: 19.9 },
  { id: "p2", name: "Hoodie", price: 49.9 },
  { id: "p3", name: "Jacket", price: 129.0 },
];

/** @type {Voucher} */
export const SAVE10 = {
  code: "SAVE10",
  type: "percent",
  value: 10,
  expiresAt: null,
  minSpend: 50,
};

/** @type {Voucher} */
export const MINUS50 = {
  code: "MINUS50",
  type: "fixed",
  value: 50,
  expiresAt: null,
  minSpend: 0,
};

/** @type {Voucher} */
export const EXPIRED10 = {
  code: "EXPIRED10",
  type: "percent",
  value: 10,
  expiresAt: new Date("2020-01-01T00:00:00.000Z"),
  minSpend: 0,
};
