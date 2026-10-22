export default function Filters({ categories, filters, setFilters }) {
  const set = (key, value) => setFilters((f) => ({ ...f, [key]: value }));
  const total = categories.reduce((s, c) => s + c.count, 0);

  return (
    <aside className="filters">
      <div>
        <h3>Categories</h3>
        <div className="cat-list">
          <button className={"cat" + (filters.category === "all" ? " active" : "")} onClick={() => set("category", "all")}>
            All products <small>{total}</small>
          </button>
          {categories.map((c) => (
            <button key={c.id} className={"cat" + (filters.category === c.id ? " active" : "")} onClick={() => set("category", c.id)}>
              {c.name} <small>{c.count}</small>
            </button>
          ))}
        </div>
      </div>
      <div>
        <h3>Price (RM)</h3>
        <div className="range">
          <input type="number" min="0" placeholder="Min" value={filters.min} onChange={(e) => set("min", e.target.value)} aria-label="Minimum price" />
          <span>–</span>
          <input type="number" min="0" placeholder="Max" value={filters.max} onChange={(e) => set("max", e.target.value)} aria-label="Maximum price" />
        </div>
      </div>
      <label className="check">
        <input type="checkbox" checked={filters.inStock} onChange={(e) => set("inStock", e.target.checked)} />
        Hide sold-out items
      </label>
    </aside>
  );
}
