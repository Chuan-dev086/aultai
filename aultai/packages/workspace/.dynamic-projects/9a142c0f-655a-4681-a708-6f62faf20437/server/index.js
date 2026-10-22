import express from 'express';
import cors from 'cors';
import { db } from './data.js';

const app = express();
app.use(cors(), express.json());
const A = express.Router();
A.use((q, r, n) => setTimeout(n, 150)); // fake latency

const bad = (r, m, c = 400) => r.status(c).json({ error: m });
const price = (p, parts, buyer) => {
  let x = p.parts.length ? parts.reduce((s, i) => s + (p.parts[i]?.p || 0), 0) : p.price;
  if (buyer === 'Dealer') x *= 1 - p.dealerPct / 100;
  if (buyer === 'Drop shipper') x *= 1 - db.settings.dropPct / 100;
  return Math.round(x * 100) / 100;
};
const findCode = (c) => db.vouchers.find((v) => v.on && v.code.toLowerCase() === String(c || '').toLowerCase());

A.get('/store', (q, r) => r.json(db));

A.post('/products', (q, r) => {
  const b = q.body;
  if (!b.name) return bad(r, 'Product name is required');
  const p = { id: Date.now(), name: b.name, cat: b.cat || db.cats[0], price: +b.price || 0, stock: +b.stock || 0, emoji: '📦', desc: b.desc || 'New product.', dealerPct: +b.dealerPct || 0, variants: b.variants || [], pre: b.pre || '', parts: b.parts || [] };
  db.products.push(p);
  r.status(201).json(p);
});
A.delete('/products/:id', (q, r) => { db.products = db.products.filter((p) => p.id !== +q.params.id); r.json({ ok: true }); });

A.post('/vouchers/validate', (q, r) => { const v = findCode(q.body.code); v ? r.json(v) : bad(r, 'This code is not valid', 404); });
A.post('/vouchers', (q, r) => {
  const { code, type, val } = q.body;
  if (!code) return bad(r, 'Code is required');
  db.vouchers.push({ code: code.toUpperCase(), type: type === 'flat' ? 'flat' : 'pct', val: +val || 0, on: true });
  r.status(201).json(db.vouchers);
});
A.patch('/vouchers/:code', (q, r) => {
  const v = db.vouchers.find((x) => x.code === q.params.code);
  if (!v) return bad(r, 'Code not found', 404);
  v.on = !v.on; r.json(v);
});

A.get('/orders', (q, r) => r.json(db.orders));
A.post('/orders', (q, r) => {
  const { buyer = 'Retail', name, addr, items = [], courier = 0, pay = 'Card / FPX', code } = q.body;
  if (!name || !addr || !items.length) return bad(r, 'Name, address and at least one item are required');
  const lines = items.map((i) => {
    const p = db.products.find((x) => x.id === i.pid);
    if (!p) return null;
    const opt = [p.variants[i.v] || '', p.parts.length ? (i.parts || []).map((k) => p.parts[k]?.n).join(', ') : ''].filter(Boolean).join(': ');
    return { pid: p.id, name: p.name, opt, unit: price(p, i.parts || [], buyer), qty: Math.max(1, +i.qty || 1) };
  }).filter(Boolean);
  const sub = lines.reduce((s, l) => s + l.unit * l.qty, 0);
  const v = findCode(code);
  const disc = v ? (v.type === 'pct' ? (sub * v.val) / 100 : Math.min(v.val, sub)) : 0;
  const c = db.couriers[courier] || db.couriers[0];
  const total = Math.max(0, sub - disc + c.rate);
  if (pay === 'Term payment') {
    if (buyer !== 'Dealer') return bad(r, 'Term payment is for dealers only');
    if (db.dealer.quota < total) return bad(r, `Term quota too low. Remaining RM ${db.dealer.quota.toFixed(2)}`);
    db.dealer.quota -= total;
  }
  const status = pay === 'Cash on delivery' ? 'Pending' : 'Paid';
  lines.forEach((l) => { const p = db.products.find((x) => x.id === l.pid); if (p && !p.pre) p.stock = Math.max(0, p.stock - l.qty); });
  const o = { id: 'ORD-' + (1001 + db.orders.length), date: new Date().toISOString().slice(0, 10), buyer, name, addr, items: lines, sub, disc, ship: c.rate, total, courier: c.name, pay, status, log: ['Order placed', 'Status: ' + status] };
  db.orders.unshift(o);
  r.status(201).json(o);
});
A.patch('/orders/:id', (q, r) => {
  const o = db.orders.find((x) => x.id === q.params.id);
  if (!o) return bad(r, 'Order not found', 404);
  o.status = q.body.status; o.log.push('Status: ' + o.status); r.json(o);
});

A.get('/reports', (q, r) => {
  const by = {};
  db.orders.forEach((o) => o.items.forEach((i) => (by[i.name] = (by[i.name] || 0) + i.unit * i.qty)));
  r.json({ revenue: db.orders.reduce((s, o) => s + o.total, 0), orders: db.orders.length, byProduct: Object.entries(by).map(([name, sales]) => ({ name, sales })), stock: db.products.map((p) => ({ name: p.name, stock: p.stock, pre: !!p.pre })) });
});
A.get('/reports/csv', (q, r) => {
  const rows = db.orders.flatMap((o) => o.items.map((i) => [o.id, o.date, i.name, i.opt, i.qty, i.unit, (i.unit * i.qty).toFixed(2), o.status].map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')));
  r.type('text/csv').attachment('sales-report.csv').send(['order,date,product,option,qty,unit,line_total,status', ...rows].join('\n'));
});

A.put('/settings', (q, r) => {
  const { shop, banner, sub, dropPct } = q.body;
  const next = { shop, banner, sub, dropPct: dropPct === undefined ? undefined : Math.min(90, +dropPct || 0) };
  Object.entries(next).forEach(([k, v]) => { if (v !== undefined) db.settings[k] = v; });
  r.json(db.settings);
});
A.put('/dealer', (q, r) => { db.dealer.quota = +q.body.quota || 0; r.json(db.dealer); });
A.post('/couriers', (q, r) => {
  if (!q.body.name) return bad(r, 'Courier name is required');
  db.couriers.push({ name: q.body.name, rate: +q.body.rate || 0 }); r.status(201).json(db.couriers);
});
A.post('/content/:kind', (q, r) => {
  const k = q.params.kind;
  if (!['cats', 'faqs', 'news'].includes(k)) return bad(r, 'Unknown content type', 404);
  db[k][k === 'news' ? 'unshift' : 'push'](q.body.value); r.status(201).json(db[k]);
});

app.use('/api', A);
app.listen(4000, () => console.log('API on http://localhost:4000'));
