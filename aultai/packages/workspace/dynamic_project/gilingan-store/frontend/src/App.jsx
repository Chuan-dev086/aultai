import { useEffect, useRef, useState } from "react";
import Header from "./components/Header.jsx";
import Hero from "./components/Hero.jsx";
import Filters from "./components/Filters.jsx";
import ProductCard from "./components/ProductCard.jsx";
import ProductModal from "./components/ProductModal.jsx";
import CartDrawer from "./components/CartDrawer.jsx";
import { useCart } from "./hooks/useCart.js";
import { useToast } from "./hooks/useToast.js";
import { getCategories, getProducts } from "./api.js";

const DEFAULT_FILTERS = { category: "all", min: "", max: "", inStock: false, sort: "featured" };

export default function App() {
  const cart = useCart();
  const toast = useToast();
  const [categories, setCategories] = useState([]);
  const [featured, setFeatured] = useState([]);
  const [products, setProducts] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [openId, setOpenId] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const shopRef = useRef(null);

  useEffect(() => {
    getCategories().then(setCategories).catch(() => {});
    getProducts({ sort: "featured" })
      .then((d) => setFeatured(d.items.filter((p) => p.featured)))
      .catch(() => {});
  }, []);

  // Fetch products from the API whenever search or filters change (debounced).
  useEffect(() => {
    const t = setTimeout(() => {
      getProducts({ q: query, ...filters })
        .then((d) => { setProducts(d.items); setLoadError(""); })
        .catch(() => setLoadError("Can’t reach the store API. Make sure the backend is running on port 5000."));
    }, 220);
    return () => clearTimeout(t);
  }, [query, filters]);

  const addToCart = (p, qty = 1) => {
    cart.add(p, qty);
    toast.notify(p.name + " added to cart");
  };
  const scrollToShop = () => shopRef.current?.scrollIntoView({ behavior: "smooth" });
  const resetAll = () => { setQuery(""); setFilters(DEFAULT_FILTERS); };

  const isDefaultView = !query && filters.category === "all" && filters.sort === "featured";
  const heading = query
    ? `Results for “${query}”`
    : filters.category === "all"
      ? "All products"
      : categories.find((c) => c.id === filters.category)?.name;

  return (
    <>
      <Header
        query={query}
        onSearch={(v) => { setQuery(v); if (v) scrollToShop(); }}
        count={cart.count}
        onOpenCart={() => setCartOpen(true)}
        onHome={() => { resetAll(); window.scrollTo({ top: 0, behavior: "smooth" }); }}
      />
      <Hero featured={featured} onOpen={setOpenId} onShop={scrollToShop} />

      <main className="shop" ref={shopRef} style={{ scrollMarginTop: 80 }}>
        <Filters categories={categories} filters={filters} setFilters={setFilters} />
        <section>
          <div className="toolbar">
            <div>
              <h2>{heading}</h2>
              <p>{products ? products.length + " items" : "Loading…"}</p>
            </div>
            <select value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })} aria-label="Sort products">
              <option value="featured">Sort: Featured</option>
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
              <option value="rating">Highest rated</option>
              <option value="name">Name A–Z</option>
            </select>
          </div>

          {loadError && <div className="empty"><h3>Store unavailable</h3><p className="error">{loadError}</p></div>}

          {!products && !loadError && (
            <div className="grid">{[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="skeleton" />)}</div>
          )}

          {products && products.length === 0 && (
            <div className="empty">
              <h3>Nothing matches those filters</h3>
              <p className="note" style={{ marginBottom: 16 }}>Try a wider price range or a different category.</p>
              <button className="btn" onClick={resetAll}>Clear all filters</button>
            </div>
          )}

          {products && products.length > 0 && (
            <div className="grid">
              {products.map((p, i) => (
                <ProductCard key={p.id} product={p} wide={isDefaultView && i === 0} onOpen={setOpenId} onAdd={addToCart} />
              ))}
            </div>
          )}
        </section>
      </main>

      <footer>Gilingan Coffee Supply · Petaling Jaya, Selangor · Built with React and Express</footer>

      {openId && <ProductModal id={openId} onClose={() => setOpenId(null)} onAdd={addToCart} onOpen={setOpenId} />}
      {cartOpen && <CartDrawer cart={cart} onClose={() => setCartOpen(false)} notify={toast.notify} />}
      {toast.message && <div className="toast" role="status">{toast.message}</div>}
    </>
  );
}
