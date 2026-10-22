import { useState } from "react";
import Art from "./Art.jsx";
import { CheckIcon, CloseIcon } from "./Icons.jsx";
import { checkDiscount, createOrder } from "../api.js";
import { FREE_SHIPPING_FROM, SHIPPING_FEE, money, tint } from "../utils.js";

const TITLES = { cart: "Your cart", checkout: "Checkout", done: "Order placed" };

export default function CartDrawer({ cart, onClose, notify, auth, onSignIn }) {
  const [step, setStep] = useState("cart"); // cart → checkout → done
  const [form, setForm] = useState({ name: "", email: "", address: "", city: "", postcode: "" });
  const [promo, setPromo] = useState("");
  const [discount, setDiscount] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState(null);

  // These totals are a preview — the server recalculates them when the order is placed.
  const discountAmt = discount ? Math.round(cart.subtotal * discount.rate * 100) / 100 : 0;
  const afterDiscount = cart.subtotal - discountAmt;
  const shipping = afterDiscount >= FREE_SHIPPING_FROM || cart.count === 0 ? 0 : SHIPPING_FEE;
  const total = afterDiscount + shipping;
  const toFree = Math.max(0, FREE_SHIPPING_FROM - afterDiscount);

  async function applyPromo() {
    setError("");
    try {
      const d = await checkDiscount(promo);
      setDiscount(d);
      notify(`Code ${d.code} applied`);
    } catch (e) { setError(e.message); }
  }

  function goToCheckout() {
    setError("");
    // Fill in the name and email from the signed-in account
    setForm((f) => ({ ...f, name: f.name || auth.user.name, email: f.email || auth.user.email }));
    setStep("checkout");
  }

  async function placeOrder() {
    setBusy(true); setError("");
    try {
      const o = await createOrder({
        items: cart.items.map((i) => ({ id: i.id, qty: i.qty })),
        customer: form,
        discountCode: discount?.code,
      });
      setOrder(o);
      cart.clear();
      setStep("done");
    } catch (e) {
      if (e.status === 401) onSignIn("Your session ended. Sign in again to place your order.");
      else setError(e.message);
    }
    setBusy(false);
  }

  const field = (key, label, type = "text", full = false) => (
    <label className={"field" + (full ? " full" : "")}>
      {label}
      <input type={type} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </label>
  );

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={TITLES[step]}>
        <div className="drawer-head">
          <h3>{TITLES[step]}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><CloseIcon /></button>
        </div>

        {step === "done" && order && (
          <div className="drawer-body">
            <div className="success">
              <div className="success-mark"><CheckIcon /></div>
              <h3 style={{ fontFamily: "var(--serif)", fontWeight: 400, fontSize: "1.6rem" }}>
                Thanks, {order.customer.name.split(" ")[0]}
              </h3>
              <p className="note">
                Order <strong>{order.id}</strong> is confirmed. A receipt is on its way to {order.customer.email}.
              </p>
            </div>
            {order.lines.map((l) => (
              <div key={l.id} className="sum-row"><span>{l.qty} × {l.name}</span><span>{money(l.total)}</span></div>
            ))}
            {order.discount > 0 && <div className="sum-row"><span>Discount</span><span>−{money(order.discount)}</span></div>}
            <div className="sum-row"><span>Shipping</span><span>{order.shipping ? money(order.shipping) : "Free"}</span></div>
            <div className="sum-row total"><span>Paid</span><span>{money(order.total)}</span></div>
            <button className="btn btn-solid" onClick={onClose}>Continue shopping</button>
          </div>
        )}

        {step !== "done" && cart.items.length === 0 && (
          <div className="drawer-body">
            <div className="empty">
              <h3>Your cart is empty</h3>
              <p className="note" style={{ marginBottom: 16 }}>Add something from the shop and it will show up here.</p>
              <button className="btn btn-solid" onClick={onClose}>Browse products</button>
            </div>
          </div>
        )}

        {step === "cart" && cart.items.length > 0 && (
          <>
            <div className="drawer-body">
              <div>
                <p className="note" style={{ marginBottom: 6 }}>
                  {toFree > 0 ? `Add ${money(toFree)} more for free delivery` : "You’ve got free delivery"}
                </p>
                <div className="progress">
                  <div style={{ width: Math.min(100, (afterDiscount / FREE_SHIPPING_FROM) * 100) + "%" }} />
                </div>
              </div>
              {cart.items.map((i) => (
                <div key={i.id} className="line">
                  <div className="thumb" style={{ background: tint(i.color, 0.84) }}><Art type={i.art} color={i.color} /></div>
                  <div>
                    <strong>{i.name}</strong>
                    <div className="note">{money(i.price)}</div>
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <div className="qty">
                        <button onClick={() => cart.setQty(i.id, i.qty - 1)} aria-label="Decrease">−</button>
                        <span>{i.qty}</span>
                        <button onClick={() => cart.setQty(i.id, i.qty + 1)} aria-label="Increase">+</button>
                      </div>
                      <button className="remove" onClick={() => cart.remove(i.id)}>Remove</button>
                    </div>
                  </div>
                  <strong>{money(i.price * i.qty)}</strong>
                </div>
              ))}
            </div>
            <div className="drawer-foot">
              <div className="promo">
                <input value={promo} onChange={(e) => setPromo(e.target.value)} placeholder="Discount code (try KOPI10)" aria-label="Discount code" />
                <button className="btn" onClick={applyPromo} disabled={!promo}>Apply</button>
              </div>
              {error && <p className="error">{error}</p>}
              <div className="sum-row"><span>Subtotal</span><span>{money(cart.subtotal)}</span></div>
              {discount && <div className="sum-row"><span>Discount ({discount.code})</span><span>−{money(discountAmt)}</span></div>}
              <div className="sum-row"><span>Shipping</span><span>{shipping ? money(shipping) : "Free"}</span></div>
              <div className="sum-row total"><span>Total</span><span>{money(total)}</span></div>
              {auth.user ? (
                <button className="btn btn-solid" onClick={goToCheckout}>Go to checkout</button>
              ) : (
                <button className="btn btn-solid" onClick={() => onSignIn("Sign in or create an account to check out. Your cart will be kept.")}>
                  Sign in to check out
                </button>
              )}
            </div>
          </>
        )}

        {step === "checkout" && cart.items.length > 0 && (
          <>
            <div className="drawer-body">
              <div className="form">
                {field("name", "Full name", "text", true)}
                {field("email", "Email", "email", true)}
                {field("address", "Street address", "text", true)}
                {field("city", "City")}
                {field("postcode", "Postcode")}
              </div>
              <p className="note">You can see this order later under My orders. This demo doesn’t take payment. Placing the order reserves the stock and returns an order number.</p>
            </div>
            <div className="drawer-foot">
              {error && <p className="error">{error}</p>}
              <div className="sum-row total"><span>Total</span><span>{money(total)}</span></div>
              <button className="btn btn-solid" onClick={placeOrder} disabled={busy}>
                {busy ? "Placing order…" : `Place order · ${money(total)}`}
              </button>
              <button className="btn" onClick={() => setStep("cart")}>Back to cart</button>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
