import { useEffect, useState } from "react";

const KEY = "gilingan-cart";

export function useCart() {
  const [items, setItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
  });

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* storage unavailable */ }
  }, [items]);

  const add = (p, qty = 1) =>
    setItems((cur) => {
      const found = cur.find((i) => i.id === p.id);
      if (found)
        return cur.map((i) => (i.id === p.id ? { ...i, qty: Math.min(i.qty + qty, p.stock) } : i));
      return [...cur, { id: p.id, name: p.name, price: p.price, art: p.art, color: p.color, stock: p.stock, qty }];
    });

  const setQty = (id, qty) =>
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, qty: Math.max(1, Math.min(qty, i.stock)) } : i)));

  const remove = (id) => setItems((cur) => cur.filter((i) => i.id !== id));
  const clear = () => setItems([]);

  const count = items.reduce((s, i) => s + i.qty, 0);
  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0);

  return { items, add, setQty, remove, clear, count, subtotal };
}
