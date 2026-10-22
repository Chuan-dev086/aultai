import { Router } from "express";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

export const app = express();
app.use(express.json());
app.use("/", apiRouter);
app.use("/preview", express.static(path.join(import.meta.dirname, "../public")));

// Only listen when run directly (`node src/api.js`). When this module is
// imported (e.g. mounted by the AultAI backend), skip the standalone server
// so ports don't collide.
const invokedAs = process.argv[1] === undefined ? null : path.resolve(process.argv[1]);
if (invokedAs !== null && invokedAs === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`shop-api listening on port ${port}`);
  });
}
