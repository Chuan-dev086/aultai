import { Fragment, useEffect, useState } from "react";
import { deleteUser, getAllOrders, getStats, getUsers, setOrderStatus, setUserRole } from "../api.js";
import { money } from "../utils.js";
import { formatDate } from "./MyOrders.jsx";

const STATUSES = ["Confirmed", "Packed", "Shipped", "Delivered", "Cancelled"];
const ROLES = [["user", "Customer"], ["editor", "Editor"], ["admin", "Admin"]];

export default function AdminDashboard({ auth, notify }) {
  const [tab, setTab] = useState("orders");
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [open, setOpen] = useState(null);

  const loadAll = () => {
    getStats().then(setStats).catch((e) => notify(e.message));
    getAllOrders().then(setOrders).catch(() => {});
    getUsers().then(setUsers).catch(() => {});
  };
  useEffect(loadAll, []);

  async function changeStatus(o, status) {
    try { await setOrderStatus(o.id, status); notify(o.id + " marked " + status); loadAll(); }
    catch (e) { notify(e.message); }
  }
  async function changeRole(u, role) {
    try { await setUserRole(u.id, role); notify(u.name + " is now " + ROLES.find((r) => r[0] === role)[1]); loadAll(); }
    catch (e) { notify(e.message); loadAll(); }
  }
  async function removeUser(u) {
    if (!window.confirm("Delete the account for " + u.name + "?")) return;
    try { await deleteUser(u.id); notify("Account deleted"); loadAll(); }
    catch (e) { notify(e.message); }
  }

  return (
    <main className="page">
      <h1 className="page-title">Admin dashboard</h1>

      {stats && (
        <div className="stats">
          <div className="panel stat"><span className="note">Revenue</span><strong>{money(stats.revenue)}</strong></div>
          <div className="panel stat"><span className="note">Orders</span><strong>{stats.orders}</strong><span className="note">{stats.openOrders} still open</span></div>
          <div className="panel stat"><span className="note">Customers</span><strong>{stats.customers}</strong></div>
          <div className="panel stat">
            <span className="note">Low stock</span><strong>{stats.lowStock.length}</strong>
            <span className="note">{stats.lowStock.slice(0, 2).map((p) => p.name + " (" + p.stock + ")").join(", ") || "All stocked"}</span>
          </div>
        </div>
      )}

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "orders"} className={tab === "orders" ? "active" : ""} onClick={() => setTab("orders")}>Orders ({orders.length})</button>
        <button role="tab" aria-selected={tab === "users"} className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}>Users ({users.length})</button>
      </div>

      {tab === "orders" && (
        <div className="panel table-wrap">
          <table className="table">
            <thead><tr><th>Order</th><th>Customer</th><th>Date</th><th className="num">Total</th><th>Status</th></tr></thead>
            <tbody>
              {orders.length === 0 && <tr><td colSpan="5" className="note">No orders yet. Orders appear here as soon as customers check out.</td></tr>}
              {orders.map((o) => (
                <Fragment key={o.id}>
                  <tr>
                    <td><button className="link" onClick={() => setOpen(open === o.id ? null : o.id)}>{o.id}</button></td>
                    <td>{o.customer.name}<div className="note">{o.customer.email}</div></td>
                    <td>{formatDate(o.createdAt)}</td>
                    <td className="num">{money(o.total)}</td>
                    <td>
                      <select className={"status-select status-" + o.status.toLowerCase()} value={o.status}
                        onChange={(e) => changeStatus(o, e.target.value)} aria-label={"Status for " + o.id}>
                        {STATUSES.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </td>
                  </tr>
                  {open === o.id && (
                    <tr className="detail-row">
                      <td colSpan="5">
                        {o.lines.map((l) => <div key={l.id} className="sum-row"><span>{l.qty} × {l.name}</span><span>{money(l.total)}</span></div>)}
                        <p className="note">Ship to: {o.customer.address}, {o.customer.postcode} {o.customer.city}</p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "users" && (
        <div className="panel table-wrap">
          <table className="table">
            <thead><tr><th>Name</th><th>Email</th><th className="num">Orders</th><th>Role</th><th></th></tr></thead>
            <tbody>
              {users.map((u) => {
                const isMe = u.id === auth.user.id;
                return (
                  <tr key={u.id}>
                    <td>{u.name}{isMe && <span className="tag-mini">You</span>}</td>
                    <td>{u.email}</td>
                    <td className="num">{u.orders}</td>
                    <td>
                      <select value={u.role} disabled={isMe} onChange={(e) => changeRole(u, e.target.value)} aria-label={"Role for " + u.name}>
                        {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </td>
                    <td className="actions">{!isMe && <button className="btn btn-small btn-danger" onClick={() => removeUser(u)}>Delete</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
