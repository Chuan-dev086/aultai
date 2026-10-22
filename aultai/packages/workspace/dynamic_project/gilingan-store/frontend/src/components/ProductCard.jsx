import Art from "./Art.jsx";
import { Rating } from "./Icons.jsx";
import { money, tint } from "../utils.js";

export default function ProductCard({ product: p, wide, onOpen, onAdd }) {
  const soldOut = p.stock === 0;
  return (
    <article className={"card" + (wide ? " wide" : "")}>
      <button className="art" style={{ background: tint(p.color, 0.84) }} onClick={() => onOpen(p.id)} aria-label={"View " + p.name}>
        {soldOut && <span className="flag">Sold out</span>}
        {!soldOut && p.stock < 10 && <span className="flag">Only {p.stock} left</span>}
        <Art type={p.art} color={p.color} />
      </button>
      <div className="card-body">
        <h4>{p.name}</h4>
        <div className="meta"><Rating rating={p.rating} reviews={p.reviews} /></div>
        {wide && <p className="note">{p.description}</p>}
        <div className="card-foot">
          <span className="price">{money(p.price)}</span>
          <button className="add" disabled={soldOut} onClick={() => onAdd(p)}>
            {soldOut ? "Sold out" : "Add to cart"}
          </button>
        </div>
      </div>
    </article>
  );
}
