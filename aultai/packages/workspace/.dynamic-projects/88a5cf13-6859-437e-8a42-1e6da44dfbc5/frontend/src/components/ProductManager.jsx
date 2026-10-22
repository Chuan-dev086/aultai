import { useEffect, useState } from "react";
import Art from "./Art.jsx";
import { CloseIcon } from "./Icons.jsx";
import { createProduct, deleteProduct, getCategories, getProducts, updateProduct } from "../api.js";
import { money, tint } from "../utils.js";

const EMPTY = { name: "", category: "beans", price: "", stock: "", description: "", tags: "", art: "bag", color: "#2F4A3E", featured: false };
const ART_TYPES = [["bag", "Coffee bag"], ["dripper", "Dripper"], ["grinder", "Grinder"], ["kettle", "Kettle"], ["cup", "Cup"]];

// Editors can add and edit products. Admins can also delete them.
export default function ProductManager({ auth, notify }) {
  const [products, setProducts] = useState(null);
  const [categories, setCategories] = useState([]);
  const [editing, setEditing] = useState(null); // null | "new" | product
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const isAdmin = auth.can("admin");

  const load = () => getProducts({ sort: "name" }).then((d) => setProducts(d.items));
  useEffect(() => { load(); getCategories().then(setCategories); }, []);

  const open = (p) => {
    setError("");
    setEditing(p || "new");
    setForm(p ? { ...p, price: String(p.price), stock: String(p.stock), tags: p.tags.join(", ") } : EMPTY);
  };

  async function save(e) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const payload = { ...form, price: Number(form.price), stock: Number(form.stock) };
      if (editing === "new") { await createProduct(payload); notify("Product added"); }
      else { await updateProduct(editing.id, payload); notify("Changes saved"); }
      setEditing(null);
      load();
    } catch (err) { setError(err.message); }
    setBusy(false);
  }

  async function remove(p) {
    if (!window.confirm("Delete " + p.name + "? This can't be undone.")) return;
    try { await deleteProduct(p.id); notify("Product deleted"); load(); }
    catch (err) { notify(err.message); }
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const shown = (products || []).filter((p) => p.name.toLowerCase().includes(filter.toLowerCase()));
  const catName = (id) => (categories.find((c) => c.id === id) || {}).name || id;

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Manage products</h1>
          <p className="note">{isAdmin ? "Add, edit and delete products." : "Add and edit products. Ask an admin to delete one."}</p>
        </div>
        <button className="btn btn-solid" onClick={() => open(null)}>Add product</button>
      </div>

      <input className="table-filter" placeholder="Filter by name" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter products" />

      <div className="panel table-wrap">
        <table className="table">
          <thead>
            <tr><th>Product</th><th>Category</th><th className="num">Price</th><th className="num">Stock</th><th></th></tr>
          </thead>
          <tbody>
            {!products && <tr><td colSpan="5" className="note">Loading…</td></tr>}
            {shown.map((p) => (
              <tr key={p.id}>
                <td>
                  <div className="cell-product">
                    <span className="mini-art" style={{ background: tint(p.color, 0.84) }}><Art type={p.art} color={p.color} /></span>
                    <span>{p.name}{p.featured && <span className="tag-mini">Featured</span>}</span>
                  </div>
                </td>
                <td>{catName(p.category)}</td>
                <td className="num">{money(p.price)}</td>
                <td className={"num" + (p.stock < 10 ? " low" : "")}>{p.stock}</td>
                <td className="actions">
                  <button className="btn btn-small" onClick={() => open(p)}>Edit</button>
                  {isAdmin && <button className="btn btn-small btn-danger" onClick={() => remove(p)}>Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <>
          <div className="scrim" onClick={() => setEditing(null)} />
          <aside className="drawer" role="dialog" aria-modal="true" aria-label={editing === "new" ? "Add product" : "Edit product"}>
            <form onSubmit={save} style={{ display: "contents" }}>
              <div className="drawer-head">
                <h3>{editing === "new" ? "Add product" : "Edit product"}</h3>
                <button type="button" className="icon-btn" onClick={() => setEditing(null)} aria-label="Close"><CloseIcon /></button>
              </div>
              <div className="drawer-body">
                <div className="preview" style={{ background: tint(form.color, 0.84) }}><Art type={form.art} color={form.color} /></div>
                <div className="form">
                  <label className="field full">Name<input value={form.name} onChange={set("name")} /></label>
                  <label className="field">Category
                    <select value={form.category} onChange={set("category")}>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </label>
                  <label className="field">Picture
                    <select value={form.art} onChange={set("art")}>
                      {ART_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </label>
                  <label className="field">Price (RM)<input type="number" min="0" step="0.01" value={form.price} onChange={set("price")} /></label>
                  <label className="field">Stock<input type="number" min="0" step="1" value={form.stock} onChange={set("stock")} /></label>
                  <label className="field full">Description<textarea rows="3" value={form.description} onChange={set("description")} /></label>
                  <label className="field full">Tags (separate with commas)<input value={form.tags} onChange={set("tags")} placeholder="250g, Medium roast" /></label>
                  <label className="field">Colour<input type="color" value={form.color} onChange={set("color")} /></label>
                  <label className="check" style={{ alignSelf: "end" }}><input type="checkbox" checked={form.featured} onChange={set("featured")} /> Feature on home page</label>
                </div>
              </div>
              <div className="drawer-foot">
                {error && <p className="error">{error}</p>}
                <button className="btn btn-solid" disabled={busy}>{busy ? "Saving…" : editing === "new" ? "Add product" : "Save changes"}</button>
              </div>
            </form>
          </aside>
        </>
      )}
    </main>
  );
}
