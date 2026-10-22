import { useEffect, useState } from "react";
import { getMyOrders } from "../api.js";
import { money } from "../utils.js";

export const formatDate = (iso) =>
  new Date(iso).toLocaleString("en-MY", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function MyOrders({ onShop }) {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => { getMyOrders().then(setOrders).catch((e) => setError(e.message)); }, []);

  return (
    <main className="page">
      <h1 className="page-title">My orders</h1>
      {error && <p className="error">{error}</p>}
      {!orders && !error && <p className="note">Loading your orders…</p>}
      {orders && orders.length === 0 && (
        <div className="empty">
          <h3>No orders yet</h3>
          <p className="note" style={{ marginBottom: 16 }}>When you place an order, it will show up here with its delivery status.</p>
          <button className="btn btn-solid" onClick={onShop}>Start shopping</button>
        </div>
      )}
      {orders && orders.length > 0 && (
        <div className="order-list">
          {orders.map((o) => (
            <article key={o.id} className="panel order">
              <div className="order-head">
                <div><strong>{o.id}</strong><div className="note">{formatDate(o.createdAt)}</div></div>
                <span className={"status status-" + o.status.toLowerCase()}>{o.status}</span>
              </div>
              {o.lines.map((l) => (
                <div key={l.id} className="sum-row"><span>{l.qty} × {l.name}</span><span>{money(l.total)}</span></div>
              ))}
              <div className="sum-row total"><span>Total</span><span>{money(o.total)}</span></div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
