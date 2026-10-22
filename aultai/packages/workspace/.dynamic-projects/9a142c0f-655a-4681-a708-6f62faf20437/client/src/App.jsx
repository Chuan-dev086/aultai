import { useEffect, useState, useCallback } from 'react';
import { api } from './api.js';
import Shop from './Shop.jsx';
import Vendor from './Vendor.jsx';
import Admin from './Admin.jsx';

export default function App() {
  const [store, setStore] = useState(null), [err, setErr] = useState('');
  const [role, setRole] = useState('shop'), [buyer, setBuyer] = useState('Retail');
  const [cart, setCart] = useState([]), [mine, setMine] = useState([]), [msg, setMsg] = useState('');
  const reload = useCallback(() => api.get('/store').then(setStore).catch((e) => setErr(e.message)), []);
  useEffect(() => { reload(); }, [reload]);
  const notify = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2200); };
  if (err) return <main><p className="bad">Cannot reach the API ({err}). Start it with npm run dev.</p></main>;
  if (!store) return <main>Loading…</main>;
  const p = { store, reload, notify, buyer, cart, setCart, mine, setMine };
  return (
    <>
      <header>
        <span className="brand">{store.settings.shop}</span>
        <nav aria-label="Switch role">
          {[['shop', 'Shopper'], ['vendor', 'Vendor'], ['admin', 'Super admin']].map(([k, l]) => (
            <button key={k} className="tab" aria-pressed={role === k} onClick={() => setRole(k)}>{l}</button>
          ))}
        </nav>
        {role === 'shop' && (
          <select aria-label="Buying as" value={buyer} onChange={(e) => setBuyer(e.target.value)} style={{ width: 'auto' }}>
            {['Retail', 'Dealer', 'Drop shipper'].map((b) => <option key={b}>{b}</option>)}
          </select>
        )}
      </header>
      <main>
        {role === 'shop' && <Shop {...p} />}
        {role === 'vendor' && <Vendor {...p} />}
        {role === 'admin' && <Admin {...p} />}
      </main>
      {msg && <div className="toast" role="status">{msg}</div>}
    </>
  );
}
