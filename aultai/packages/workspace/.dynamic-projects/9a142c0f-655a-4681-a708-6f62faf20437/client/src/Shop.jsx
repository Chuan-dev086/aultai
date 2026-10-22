import { useEffect, useState } from 'react';
import { api } from './api.js';
import { price } from './price.js';
import { Field, Modal, RM } from './ui.jsx';

const STAT = ['Pending', 'Paid', 'Packed', 'Shipped', 'Delivered'];
const optText = (p, i) => [p.variants[i.v] || '', p.parts.length ? i.parts.map((k) => p.parts[k].n).join(', ') : ''].filter(Boolean).join(': ');

export default function Shop(props) {
  const [view, setView] = useState('shop');
  const n = props.cart.reduce((s, i) => s + i.qty, 0);
  return (
    <>
      <nav style={{ marginBottom: 14 }}>
        {[['shop', 'Shop'], ['orders', 'My orders'], ['cart', `Cart (${n})`]].map(([k, l]) => (
          <button key={k} className="tab" aria-pressed={view === k} onClick={() => setView(k)}>{l}</button>
        ))}
      </nav>
      {view === 'shop' && <Catalog {...props} />}
      {view === 'cart' && <Cart {...props} browse={() => setView('shop')} done={() => setView('orders')} />}
      {view === 'orders' && <Orders {...props} />}
    </>
  );
}

function Catalog({ store, buyer, setCart, notify }) {
  const [cat, setCat] = useState('All'), [open, setOpen] = useState(null);
  const s = store.settings, drop = s.dropPct;
  return (
    <>
      <section className="hero"><h1>{s.banner}</h1><p className="mute">{s.sub}</p></section>
      <div className="chips">
        {['All', ...store.cats].map((c) => <button key={c} className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>)}
      </div>
      <div className="grid">
        {store.products.filter((p) => cat === 'All' || p.cat === cat).map((p) => (
          <div className="card" key={p.id}>
            <div className="pic" aria-hidden="true">{p.emoji}</div>
            <div className="in">
              <strong>{p.name}</strong><span className="mute">{p.cat}</span>
              <span className="price">{p.parts.length ? 'From ' : ''}{RM(price(p, p.parts.map((_, i) => i), buyer, drop))}</span>
              <span>
                {p.pre ? <span className="tag pre">Pre-order, arrives {p.pre}</span> : p.stock ? <span className="tag">{p.stock <= 5 ? `Only ${p.stock} left` : 'In stock'}</span> : <span className="tag bad">Out of stock</span>}
                {p.parts.length > 0 && <span className="tag"> Bundle</span>}
              </span>
              <button className="btn sm" style={{ marginTop: 'auto' }} disabled={!p.stock && !p.pre} onClick={() => setOpen(p)}>View details</button>
            </div>
          </div>
        ))}
      </div>
      {store.news.length > 0 && <><h2>News</h2><div className="panel">{store.news.map((n, i) => <div key={i}>{n.t}</div>)}</div></>}
      {store.faqs.length > 0 && <><h2>FAQ</h2>{store.faqs.map((f, i) => <details className="panel" key={i}><summary><strong>{f.q}</strong></summary><p className="mute">{f.a}</p></details>)}</>}
      {open && <Detail p={open} buyer={buyer} drop={drop} onClose={() => setOpen(null)} onAdd={(item) => { setCart((c) => [...c, item]); setOpen(null); notify('Added to cart'); }} />}
    </>
  );
}

function Detail({ p, buyer, drop, onClose, onAdd }) {
  const [v, setV] = useState(0), [qty, setQty] = useState(1), [parts, setParts] = useState(p.parts.map((_, i) => i));
  const toggle = (i) => setParts((a) => (a.includes(i) ? a.filter((x) => x !== i) : [...a, i].sort()));
  return (
    <Modal title={`${p.emoji} ${p.name}`} onClose={onClose}>
      <p className="mute">{p.desc}</p>
      {p.variants.length > 0 && <div className="f"><label>Variant<select value={v} onChange={(e) => setV(+e.target.value)}>{p.variants.map((x, i) => <option key={x} value={i}>{x}</option>)}</select></label></div>}
      {p.parts.length > 0 && <><p><strong>Choose parts</strong></p>{p.parts.map((x, i) => (
        <label className="row sb" key={x.n}><span className="row"><input type="checkbox" style={{ width: 'auto' }} checked={parts.includes(i)} onChange={() => toggle(i)} />{x.n}</span><span>{RM(x.p)}</span></label>
      ))}</>}
      <div className="row sb" style={{ marginTop: 12 }}>
        <Field label="Quantity" type="number" min="1" value={qty} onChange={(e) => setQty(Math.max(1, +e.target.value || 1))} />
        <span className="price">{RM(price(p, parts, buyer, drop) * qty)}</span>
      </div>
      {p.pre && <p className="bad">Pre-order. Estimated arrival {p.pre}.</p>}
      <button className="btn" style={{ width: '100%', marginTop: 12 }} disabled={p.parts.length > 0 && !parts.length} onClick={() => onAdd({ pid: p.id, v, parts, qty })}>Add to cart</button>
    </Modal>
  );
}

function Cart({ store, buyer, cart, setCart, setMine, notify, reload, browse, done }) {
  const [co, setCo] = useState({ name: '', addr: '', courier: 0, pay: 'Card / FPX', code: '' }), [ok, setOk] = useState(null);
  const lines = cart.map((i) => ({ ...i, p: store.products.find((x) => x.id === i.pid) })).filter((l) => l.p).map((l) => ({ ...l, unit: price(l.p, l.parts, buyer, store.settings.dropPct) }));
  const sub = lines.reduce((s, l) => s + l.unit * l.qty, 0);
  const disc = ok ? (ok.type === 'pct' ? (sub * ok.val) / 100 : Math.min(ok.val, sub)) : 0;
  const ship = lines.length ? store.couriers[co.courier].rate : 0, total = Math.max(0, sub - disc + ship);
  const set = (k) => (e) => setCo({ ...co, [k]: e.target.value });
  const pays = ['Card / FPX', 'Cash on delivery', ...(buyer === 'Dealer' ? ['Term payment'] : [])];
  if (!lines.length) return <div className="panel"><h2 style={{ marginTop: 0 }}>Your cart is empty</h2><p className="mute">Add a product to start an order.</p><button className="btn" onClick={browse}>Go to shop</button></div>;
  const apply = () => api.post('/vouchers/validate', { code: co.code }).then((v) => { setOk(v); notify('Code applied'); }).catch((e) => { setOk(null); notify(e.message); });
  const place = async () => {
    try {
      const o = await api.post('/orders', { buyer, name: co.name, addr: co.addr, courier: co.courier, pay: co.pay, code: ok ? ok.code : '', items: cart });
      setMine((m) => [...m, o.id]); setCart([]); await reload(); notify(`Order ${o.id} placed`); done();
    } catch (e) { notify(e.message); }
  };
  return (
    <>
      <div className="panel scroll"><table><thead><tr><th>Item</th><th>Unit</th><th>Qty</th><th>Total</th><th></th></tr></thead><tbody>
        {lines.map((l, i) => <tr key={i}><td><strong>{l.p.name}</strong><br /><span className="mute">{optText(l.p, l)}</span></td><td>{RM(l.unit)}</td><td>{l.qty}</td><td>{RM(l.unit * l.qty)}</td><td><button className="btn ghost sm" onClick={() => setCart(cart.filter((_, k) => k !== i))}>Remove</button></td></tr>)}
      </tbody></table></div>
      <div className="panel"><h2 style={{ marginTop: 0 }}>Delivery and payment</h2>
        <div className="row"><Field label="Full name" value={co.name} onChange={set('name')} /><Field label="Shipping address" value={co.addr} onChange={set('addr')} /></div>
        <div className="row" style={{ marginTop: 10 }}>
          <div className="f"><label>Courier<select value={co.courier} onChange={(e) => setCo({ ...co, courier: +e.target.value })}>{store.couriers.map((c, i) => <option key={c.name} value={i}>{c.name} ({RM(c.rate)})</option>)}</select></label></div>
          <div className="f"><label>Payment<select value={pays.includes(co.pay) ? co.pay : pays[0]} onChange={set('pay')}>{pays.map((x) => <option key={x}>{x}</option>)}</select></label></div>
        </div>
        {co.pay === 'Term payment' && <p className="mute">Term quota left: {RM(store.dealer.quota)}</p>}
        <div className="row" style={{ marginTop: 10 }}><Field label="Discount code" value={co.code} onChange={set('code')} /><button className="btn ghost" style={{ alignSelf: 'flex-end' }} onClick={apply}>Apply code</button></div>
      </div>
      <div className="panel">
        <div className="row sb"><span>Subtotal</span><span>{RM(sub)}</span></div>
        <div className="row sb"><span>Discount{ok ? ` (${ok.code})` : ''}</span><span>-{RM(disc)}</span></div>
        <div className="row sb"><span>Shipping</span><span>{RM(ship)}</span></div>
        <div className="row sb price"><span>Total</span><span>{RM(total)}</span></div>
        <button className="btn" style={{ width: '100%', marginTop: 12 }} onClick={place}>Place order</button>
      </div>
    </>
  );
}

function Orders({ mine }) {
  const [list, setList] = useState([]);
  useEffect(() => { api.get('/orders').then((all) => setList(all.filter((o) => mine.includes(o.id)))); }, [mine]);
  if (!list.length) return <div className="panel"><h2 style={{ marginTop: 0 }}>No orders yet</h2><p className="mute">Orders you place in this session show up here with their status.</p></div>;
  return list.map((o) => (
    <div className="panel" key={o.id}>
      <div className="row sb"><strong>{o.id}</strong><span>{RM(o.total)}</span></div>
      <div className="mute">{o.date}, {o.items.map((i) => `${i.name} x${i.qty}`).join(', ')}</div>
      <div className="steps">{STAT.map((s, i) => <i key={s} className={i <= STAT.indexOf(o.status) ? 'on' : ''} />)}</div>
      <div>Status: <strong>{o.status}</strong></div>
    </div>
  ));
}
