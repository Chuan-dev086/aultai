import Art from "./Art.jsx";
import { tint } from "../utils.js";

export default function Hero({ featured, onOpen, onShop }) {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <h1>Better coffee starts at the grinder.</h1>
          <p>
            Malaysian-grown beans roasted every Tuesday in Petaling Jaya, and the gear we actually
            brew with. Free delivery across the peninsula on orders over RM 150.
          </p>
          <div className="hero-actions">
            <button className="btn btn-solid" onClick={onShop}>Shop all products</button>
            <button className="btn" onClick={() => featured[0] && onOpen(featured[0].id)}>See this week’s roast</button>
          </div>
        </div>
        <div className="hero-stage">
          {featured.slice(0, 3).map((p) => (
            <button key={p.id} className="hero-tile" style={{ background: tint(p.color, 0.82) }}
              onClick={() => onOpen(p.id)} aria-label={"View " + p.name}>
              <div style={{ width: "55%" }}><Art type={p.art} color={p.color} /></div>
            </button>
          ))}
        </div>
      </section>
      <div className="ticker">
        <div className="ticker-inner">
          <span>Roasted to order, shipped within 48 hours</span>
          <span>30-day returns on all gear</span>
          <span>Pay by FPX, card or e-wallet</span>
        </div>
      </div>
    </>
  );
}
