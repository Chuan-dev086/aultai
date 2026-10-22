import { useEffect, useState } from "react";
import Art from "./Art.jsx";
import { CloseIcon, Rating } from "./Icons.jsx";
import { getProduct } from "../api.js";
import { money, tint } from "../utils.js";

export default function ProductModal({ id, onClose, onAdd, onOpen }) {
  const [p, setP] = useState(null);
  const [qty, setQty] = useState(1);
  const [error, setError] = useState("");

  useEffect(() => {
    setP(null); setQty(1); setError("");
    getProduct(id).then(setP).catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true">
        {error && <div className="modal-card" style={{ padding: 32, display: "block" }}><p className="error">{error}</p></div>}
        {p && (
          <div className="modal-card">
            <div className="modal-art" style={{ background: tint(p.color, 0.82) }}>
              <Art type={p.art} color={p.color} />
            </div>
            <div className="modal-info">
              <button className="icon-btn" onClick={onClose} aria-label="Close"><CloseIcon /></button>
              <h2>{p.name}</h2>
              <div className="meta">
                <Rating rating={p.rating} reviews={p.reviews} />
                <span>{p.stock > 0 ? p.stock + " in stock" : "Sold out"}</span>
              </div>
              <p className="price" style={{ fontSize: "1.6rem" }}>{money(p.price)}</p>
              <p>{p.description}</p>
              <div className="tags">{p.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>

              <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 6 }}>
                <div className="qty" style={{ marginTop: 0 }}>
                  <button onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Decrease quantity">−</button>
                  <span>{qty}</span>
                  <button onClick={() => setQty(Math.min(p.stock, qty + 1))} aria-label="Increase quantity">+</button>
                </div>
                <button className="btn btn-solid" style={{ flex: 1 }} disabled={p.stock === 0}
                  onClick={() => { onAdd(p, qty); onClose(); }}>
                  {p.stock === 0 ? "Sold out" : `Add ${qty} to cart · ${money(p.price * qty)}`}
                </button>
              </div>

              {p.related.length > 0 && (
                <div>
                  <p className="note" style={{ marginBottom: 8 }}>Pairs well with</p>
                  <div className="related">
                    {p.related.map((r) => (
                      <button key={r.id} onClick={() => onOpen(r.id)}>
                        {r.name}<br /><strong>{money(r.price)}</strong>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
