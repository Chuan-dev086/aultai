import { useEffect, useRef, useState } from "react";
import Header from "./components/Header.jsx";
import Hero from "./components/Hero.jsx";
import Filters from "./components/Filters.jsx";
import ProductCard from "./components/ProductCard.jsx";
import ProductModal from "./components/ProductModal.jsx";
import CartDrawer from "./components/CartDrawer.jsx";
import AuthModal from "./components/AuthModal.jsx";
import MyOrders from "./components/MyOrders.jsx";
import ProductManager from "./components/ProductManager.jsx";
import AdminDashboard from "./components/AdminDashboard.jsx";
import { useCart } from "./hooks/useCart.js";
import { useToast } from "./hooks/useToast.js";
import { useAuth } from "./hooks/useAuth.js";
import { getCategories, getProducts } from "./api.js";

const DEFAULT_FILTERS = { category: "all", min: "", max: "", inStock: false, sort: "featured" };

// Pages and which roles may open them (null = anyone)
const VIEWS = {
  shop: null,
  orders: ["user", "editor", "admin"],
  manage: ["editor", "admin"],
  admin: ["admin"],
};
const viewFromHash = () => {
  const v = window.location.hash.replace("#", "");
  return VIEWS[v] !== undefined ? v : "shop";
};

export default function App() {
  const cart = useCart();
  const toast = useToast();
  const auth = useAuth();
  const [view, setView] = useState(viewFromHash);
  const [categories, setCategories] = useState([]);
  const [featured, setFeatured] = useState([]);
  const [products, setProducts] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [openId, setOpenId] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [signIn, setSignIn] = useState(null); // null, or { reason }
  const shopRef = useRef(null);

  // Keep the page in sync with the address bar (back/forward buttons work)
  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = (v) => {
    window.location.hash = v === "shop" ? "" : v;
    setView(v);
    window.scrollTo({ top: 0 });
  };

  // Load shop data whenever the shop is shown (so editor changes appear straight away)
  useEffect(() => {
    if (view !== "shop") return;
    getCategories().then(setCategories).catch(() => {});
    getProducts({ sort: "featured" })
      .then((d) => setFeatured(d.items.filter((p) => p.featured)))
      .catch(() => {});
  }, [view]);

  useEffect(() => {
    if (view !== "shop") return;
    const t = setTimeout(() => {
      getProducts({ q: query, ...filters })
        .then((d) => { setProducts(d.items); setLoadError(""); })
        .catch(() => setLoadError("Can’t reach the store API. Make sure the server is still running (npm start), then refresh the page."));
    }, 220);
    return () => clearTimeout(t);
  }, [query, filters, view]);

  const addToCart = (p, qty = 1) => {
    cart.add(p, qty);
    toast.notify(p.name + " added to cart");
  };
  const scrollToShop = () => shopRef.current?.scrollIntoView({ behavior: "smooth" });
  const resetAll = () => { setQuery(""); setFilters(DEFAULT_FILTERS); };
  const askSignIn = (reason) => { setCartOpen(false); setSignIn({ reason }); };

  const onSignedIn = (user) => {
    setSignIn(null);
    toast.notify("Signed in as " + user.name);
    if (cart.count > 0 && view === "shop") setCartOpen(true); // carry on to checkout
  };

  const isDefaultView = !query && filters.category === "all" && filters.sort === "featured";
  const heading = query
    ? `Results for “${query}”`
    : filters.category === "all"
      ? "All products"
      : categories.find((c) => c.id === filters.category)?.name;

  // Role check for the current page
  const allowed = VIEWS[view];
  const blocked = allowed && !auth.checking && (!auth.user || !allowed.includes(auth.user.role));

  return (
    <>
      <Header
        view={view}
        go={go}
        auth={auth}
        onSignIn={askSignIn}
        query={query}
        onSearch={(v) => { setQuery(v); if (v) scrollToShop(); }}
        count={cart.count}
        onOpenCart={() => setCartOpen(true)}
        onHome={() => { resetAll(); go("shop"); }}
      />

      {view !== "shop" && auth.checking && <main className="page"><p className="note">Checking your account…</p></main>}

      {blocked && (
        <main className="page">
          <div className="empty">
            <h3>{auth.user ? "You don’t have access to this page" : "Sign in to see this page"}</h3>
            <p className="note" style={{ marginBottom: 16 }}>
              {auth.user ? "Your account is a " + auth.user.role + " account. Ask an admin if you need more access." : "This page is only available to signed-in accounts."}
            </p>
            {auth.user
              ? <button className="btn btn-solid" onClick={() => go("shop")}>Back to shop</button>
              : <button className="btn btn-solid" onClick={() => askSignIn()}>Sign in</button>}
          </div>
        </main>
      )}

      {!blocked && !(view !== "shop" && auth.checking) && (
        <>
          {view === "orders" && <MyOrders onShop={() => go("shop")} />}
          {view === "manage" && <ProductManager auth={auth} notify={toast.notify} />}
          {view === "admin" && <AdminDashboard auth={auth} notify={toast.notify} />}
          {view === "shop" && (
            <>
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
            </>
          )}
        </>
      )}

      <footer>Gilingan Coffee Supply · Petaling Jaya, Selangor · Built with React and Express</footer>

      {openId && <ProductModal id={openId} onClose={() => setOpenId(null)} onAdd={addToCart} onOpen={setOpenId} />}
      {cartOpen && <CartDrawer cart={cart} auth={auth} onSignIn={askSignIn} onClose={() => setCartOpen(false)} notify={toast.notify} />}
      {signIn && <AuthModal auth={auth} reason={signIn.reason} onClose={() => setSignIn(null)} onSignedIn={onSignedIn} />}
      {toast.message && <div className="toast" role="status">{toast.message}</div>}
    </>
  );
}
