import { Router } from "express";
import { CartSchema, PRODUCTS, VoucherSchema } from "./models.js";
import { calculateCheckoutTotal } from "./checkout.js";

export const apiRouter = Router();

/**
 * Health endpoint for the shop API.
 */
apiRouter.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

/**
 * Product catalog endpoint.
 */
apiRouter.get("/products", (req, res) => {
  res.json({ products: PRODUCTS });
});

/**
 * Checkout endpoint: validates input, then computes the order total.
 */
apiRouter.post("/cart/checkout", (req, res) => {
  try {
    const cart = CartSchema.parse(req.body.cart);
    let voucher = null;
    if (req.body.voucher !== null && req.body.voucher !== undefined) {
      const raw = req.body.voucher;
      voucher = VoucherSchema.parse({
        ...raw,
        expiresAt: raw.expiresAt === null ? null : new Date(raw.expiresAt),
      });
    }
    const total = calculateCheckoutTotal(cart, voucher, new Date());
    res.json({ total });
  } catch (err) {
    res.status(400).json({ error: { code: "CHECKOUT_FAILED", message: err.message } });
  }
});
