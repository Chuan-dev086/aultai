import { useEffect, useState } from 'react';
import { api } from './api.js';
import { Field, Modal, RM, useAct } from './ui.jsx';

const STAT = ['Pending', 'Paid', 'Packed', 'Shipped', 'Delivered'];

export default function Vendor(props) {
  const [tab, setTab] = useState('products');
  const T = { products: Products, orders: Orders, reports: Reports, promo: Promo, ship: Ship }[tab];
  return (
    <>
      <nav style={{ marginBottom: 14 }}>
        {[['products', 'Products'], ['orders', 'Orders'], ['reports', 'Reports'], ['promo', 'Discounts'], ['ship', 'Payment and shipping']].map(([k, l]) => (
          <button key={k} className="tab" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </nav>
      <T {...props} />
    </>
  );
}

function Products({ store, reload, notify }) {
  const act = useAct(reload, notify);
  const [f, setF] = useState({ name: '', cat: store.cats[0], price: 0, stock: 10, dealerPct: 10, variants: '', pre: '', parts: '' });
  const b = (k) => ({ value: f[k], onChange: (e) => setF({ ...f, [k]: e.target.value }) });
  const save = () => act(() => api.post('/products', {
    ...f,
    variants: f.variants.split(',').map((s) => s.trim()).filter(Boolean),
    parts: f.parts.split(',').map((s) => { const [n, p] = s.split(':'); return { n: (n || '').trim(), p: +p }; }).filter((x) => x.n && x.p >= 0),
  }).then(() => setF({ ...f, name: '', variants: '', pre: '', parts: '' })), 'Product saved');
  return (
    <>
      <div className="panel"><h2 style={{ marginTop: 0 }}>Add a product</h2>
        <div className="row"><Field label="Name" {...b('name')} />
          <div className="f"><label>Category<select {...b('cat')}>{store.cats.map((c) => <option key={c}>{c}</option>)}</select></label></div>
          <Field label="Price (RM)" type="number" {...b('price')} /><Field label="Stock" type="number" {...b('stock')} /></div>
        <div className="row" style={{ marginTop: 10 }}><Field label="Dealer discount %" type="number" {...b('dealerPct')} /><Field label="Variants (comma separated)" {...b('variants')} /><Field label="Pre-order arrival date (optional)" {...b('pre')} /></div>
        <div className="row" style={{ marginTop: 10 }}><Field label="Bundle parts, e.g. Top:320, Legs:180" {...b('parts')} /><button className="btn" style={{ alignSelf: 'flex-end' }} onClick={save}>Save product</button></div>
      </div>
      <div className="panel scroll"><table><thead><tr><th>Product</th><th>Price</th><th>Stock</th><th>Dealer %</th><th>Type</th><th></th></tr></thead><tbody>
        {store.products.map((p) => (
          <tr key={p.id}><td>{p.emoji} {p.name}</td><td>{RM(p.parts.length ? p.parts.reduce((s, x) => s + x.p, 0) : p.price)}</td><td>{p.stock}</td><td>{p.dealerPct}%</td><td>{p.pre ? 'Pre-order' : p.parts.length ? 'Bundle' : 'Standard'}</td>
            <td><button className="btn ghost sm" onClick={() => act(() => api.del('/products/' + p.id), 'Product deleted')}>Delete</button></td></tr>
        ))}
      </tbody></table></div>
    </>
  );
}

function Orders({ reload, notify }) {
  const [list, setList] = useState([]), [inv, setInv] = useState(null);
  const load = () => api.get('/orders').then(setList);
  useEffect(() => { load(); }, []);
  const setStatus = async (o, status) => { await api.patch('/orders/' + o.id, { status }); await load(); notify('Status updated'); };
  if (!list.length) return <div className="panel"><h2 style={{ marginTop: 0 }}>No orders yet</h2><p className="mute">Place an order as a shopper and it appears here.</p></div>;
  return (
    <>
      <div className="panel scroll"><table><thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>
        {list.map((o) => (
          <tr key={o.id}><td>{o.id}<br /><span className="mute">{o.date}</span></td><td>{o.name}<br /><span className="mute">{o.buyer}</span></td><td>{RM(o.total)}<br /><span className="mute">{o.pay}</span></td>
            <td><select aria-label={`Status of ${o.id}`} value={o.status} onChange={(e) => setStatus(o, e.target.value)}>{STAT.map((s) => <option key={s}>{s}</option>)}</select></td>
            <td><button className="btn ghost sm" onClick={() => setInv(o)}>Detail and invoice</button></td></tr>
        ))}
      </tbody></table></div>
      {inv && (
        <Modal title={`Invoice ${inv.id}`} onClose={() => setInv(null)}>
          <p className="mute">{inv.date}, {inv.buyer} buyer</p>
          <p><strong>Billing and shipping address</strong><br />{inv.name}<br />{inv.addr}</p>
          <table style={{ minWidth: 0 }}><tbody>{inv.items.map((i, k) => <tr key={k}><td>{i.name}<br /><span className="mute">{i.opt}</span></td><td>{i.qty} x {RM(i.unit)}</td></tr>)}</tbody></table>
          <p>Discount: -{RM(inv.disc)}<br />Shipping ({inv.courier}): {RM(inv.ship)}<br /><strong>Total: {RM(inv.total)}</strong> via {inv.pay}</p>
          <strong>Activity</strong>{inv.log.map((l, k) => <div className="mute" key={k}>{l}</div>)}
          <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={() => window.print()}>Print</button>
        </Modal>
      )}
    </>
  );
}

function Reports({ store }) {
  const [r, setR] = useState(null);
  useEffect(() => { api.get('/reports').then(setR); }, []);
  if (!r) return <p>Loading…</p>;
  return (
    <>
      <div className="row">
        <div className="panel f"><span className="mute">Sales</span><div className="price">{RM(r.revenue)}</div></div>
        <div className="panel f"><span className="mute">Orders</span><div className="price">{r.orders}</div></div>
        <div className="panel f"><span className="mute">Term quota left</span><div className="price">{RM(store.dealer.quota)}</div></div>
      </div>
      <div className="panel scroll"><div className="row sb"><strong>Sales by product</strong><a className="btn sm" href="/api/reports/csv">Export CSV</a></div>
        {r.byProduct.length ? <table><tbody>{r.byProduct.map((x) => <tr key={x.name}><td>{x.name}</td><td>{RM(x.sales)}</td></tr>)}</tbody></table> : <p className="mute">No sales yet.</p>}</div>
      <div className="panel scroll"><strong>Stock report</strong><table><tbody>
        {r.stock.map((x) => <tr key={x.name}><td>{x.name}</td><td>{x.stock}</td><td className={!x.pre && x.stock <= 5 ? 'bad' : ''}>{x.pre ? 'Pre-order' : x.stock === 0 ? 'Out of stock' : x.stock <= 5 ? 'Low stock' : 'OK'}</td></tr>)}
      </tbody></table></div>
    </>
  );
}

function Promo({ store, reload, notify }) {
  const act = useAct(reload, notify);
  const [v, setV] = useState({ code: '', type: 'pct', val: 10 }), [drop, setDrop] = useState(store.settings.dropPct);
  return (
    <>
      <div className="panel"><h2 style={{ marginTop: 0 }}>Discount codes</h2>
        <div className="row"><Field label="Code" value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} />
          <div className="f"><label>Type<select value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })}><option value="pct">Percentage</option><option value="flat">Flat amount</option></select></label></div>
          <Field label="Value" type="number" value={v.val} onChange={(e) => setV({ ...v, val: e.target.value })} />
          <button className="btn" style={{ alignSelf: 'flex-end' }} onClick={() => act(() => api.post('/vouchers', v), 'Code added')}>Add code</button></div>
        <table style={{ marginTop: 10 }}><tbody>{store.vouchers.map((c) => <tr key={c.code}><td>{c.code}</td><td>{c.type === 'pct' ? c.val + '%' : RM(c.val)}</td><td><button className="btn ghost sm" onClick={() => act(() => api.patch('/vouchers/' + c.code))}>{c.on ? 'Turn off' : 'Turn on'}</button></td></tr>)}</tbody></table>
      </div>
      <div className="panel"><h2 style={{ marginTop: 0 }}>Drop shipper discount</h2>
        <div className="row"><Field label="Discount on every product (%)" type="number" value={drop} onChange={(e) => setDrop(e.target.value)} /><button className="btn" style={{ alignSelf: 'flex-end' }} onClick={() => act(() => api.put('/settings', { dropPct: drop }), 'Saved')}>Save</button></div>
        <p className="mute">Applies when the shopper is switched to Drop shipper. Dealer discounts are set per product.</p></div>
    </>
  );
}

function Ship({ store, reload, notify }) {
  const act = useAct(reload, notify);
  const [q, setQ] = useState(store.dealer.quota), [k, setK] = useState({ name: '', rate: 10 });
  return (
    <>
      <div className="panel"><h2 style={{ marginTop: 0 }}>Term payment quota for dealers</h2>
        <div className="row"><Field label="Quota (RM)" type="number" value={q} onChange={(e) => setQ(e.target.value)} /><button className="btn" style={{ alignSelf: 'flex-end' }} onClick={() => act(() => api.put('/dealer', { quota: q }), 'Quota saved')}>Save quota</button></div></div>
      <div className="panel"><h2 style={{ marginTop: 0 }}>Couriers</h2>
        <div className="row"><Field label="Courier name" value={k.name} onChange={(e) => setK({ ...k, name: e.target.value })} /><Field label="Rate (RM)" type="number" value={k.rate} onChange={(e) => setK({ ...k, rate: e.target.value })} /><button className="btn" style={{ alignSelf: 'flex-end' }} onClick={() => act(() => api.post('/couriers', k), 'Courier added')}>Add courier</button></div>
        <table style={{ marginTop: 10 }}><tbody>{store.couriers.map((c) => <tr key={c.name}><td>{c.name}</td><td>{RM(c.rate)}</td></tr>)}</tbody></table></div>
    </>
  );
}
