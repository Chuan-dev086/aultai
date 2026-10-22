import { useEffect, useRef, useState } from "react";
import { BagIcon, SearchIcon } from "./Icons.jsx";

const ROLE_LABEL = { user: "Customer", editor: "Editor", admin: "Admin" };

export default function Header({ query, onSearch, count, onOpenCart, onHome, auth, onSignIn, go, view }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const close = (e) => menuRef.current && !menuRef.current.contains(e.target) && setMenuOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const pick = (v) => { setMenuOpen(false); go(v); };
  const user = auth.user;

  return (
    <header className="top">
      <div className="top-inner">
        <button className="logo" onClick={onHome} aria-label="Gilingan home">
          <span className="logo-mark">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#C99A2E">
              <ellipse cx="12" cy="12" rx="7" ry="10" transform="rotate(30 12 12)" />
            </svg>
          </span>
          Gilingan
        </button>

        {view === "shop" ? (
          <label className="search">
            <SearchIcon />
            <input value={query} onChange={(e) => onSearch(e.target.value)}
              placeholder="Search beans, grinders, kettles…" aria-label="Search products" />
          </label>
        ) : (
          <nav className="crumbs"><button className="link" onClick={() => go("shop")}>Back to shop</button></nav>
        )}

        <div className="top-actions">
          {!user && !auth.checking && <button className="btn btn-quiet" onClick={() => onSignIn()}>Sign in</button>}
          {user && (
            <div className="account" ref={menuRef}>
              <button className="btn btn-quiet account-btn" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen}>
                <span className="avatar">{user.name.charAt(0).toUpperCase()}</span>
                <span className="account-name">{user.name.split(" ")[0]}</span>
                <span className={"role-pill role-" + user.role}>{ROLE_LABEL[user.role]}</span>
              </button>
              {menuOpen && (
                <div className="menu" role="menu">
                  <div className="menu-head"><strong>{user.name}</strong><span>{user.email}</span></div>
                  <button role="menuitem" onClick={() => pick("orders")}>My orders</button>
                  {auth.can("editor", "admin") && <button role="menuitem" onClick={() => pick("manage")}>Manage products</button>}
                  {auth.can("admin") && <button role="menuitem" onClick={() => pick("admin")}>Admin dashboard</button>}
                  <button role="menuitem" onClick={() => { setMenuOpen(false); auth.signOut(); go("shop"); }}>Sign out</button>
                </div>
              )}
            </div>
          )}
          <button className="cart-btn" onClick={onOpenCart}>
            <BagIcon /> <span className="cart-label">Cart</span> <span className="badge">{count}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
