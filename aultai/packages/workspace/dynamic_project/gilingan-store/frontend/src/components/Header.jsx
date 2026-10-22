import { BagIcon, SearchIcon } from "./Icons.jsx";

export default function Header({ query, onSearch, count, onOpenCart, onHome }) {
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
        <label className="search">
          <SearchIcon />
          <input value={query} onChange={(e) => onSearch(e.target.value)}
            placeholder="Search beans, grinders, kettles…" aria-label="Search products" />
        </label>
        <button className="cart-btn" onClick={onOpenCart}>
          <BagIcon /> Cart <span className="badge">{count}</span>
        </button>
      </div>
    </header>
  );
}
