import { useState } from 'react';
import { api } from './api.js';
import { Field, useAct } from './ui.jsx';

export default function Admin({ store, reload, notify }) {
  const act = useAct(reload, notify), s = store.settings;
  const [f, setF] = useState({ shop: s.shop, banner: s.banner, sub: s.sub });
  const [c, setC] = useState(''), [faq, setFaq] = useState({ q: '', a: '' }), [n, setN] = useState('');
  const add = (kind, value, reset) => value && act(() => api.post('/content/' + kind, { value }).then(reset), 'Saved');
  return (
    <>
      <h2 style={{ marginTop: 0 }}>Customize storefront</h2>
      <div className="panel">
        <div className="row"><Field label="Homepage banner title" value={f.banner} onChange={(e) => setF({ ...f, banner: e.target.value })} /><Field label="Banner text" value={f.sub} onChange={(e) => setF({ ...f, sub: e.target.value })} /></div>
        <div className="row" style={{ marginTop: 10 }}><Field label="Shop name" value={f.shop} onChange={(e) => setF({ ...f, shop: e.target.value })} /><button className="btn" style={{ alignSelf: 'flex-end' }} onClick={() => act(() => api.put('/settings', f), 'Storefront updated')}>Save storefront</button></div>
      </div>
      <div className="panel"><strong>Product categories</strong><div className="chips">{store.cats.map((x) => <span className="chip" key={x}>{x}</span>)}</div>
        <div className="row"><Field label="New category" value={c} onChange={(e) => setC(e.target.value)} /><button className="btn" style={{ alignSelf: 'flex-end' }} onClick={() => add('cats', c.trim(), () => setC(''))}>Add category</button></div></div>
      <div className="panel"><strong>FAQ</strong>
        <div className="row" style={{ marginTop: 8 }}><Field label="Question" value={faq.q} onChange={(e) => setFaq({ ...faq, q: e.target.value })} /><Field label="Answer" value={faq.a} onChange={(e) => setFaq({ ...faq, a: e.target.value })} /><button className="btn" style={{ alignSelf: 'flex-end' }} onClick={() => add('faqs', faq.q.trim() && faq, () => setFaq({ q: '', a: '' }))}>Add FAQ</button></div></div>
      <div className="panel"><strong>News and updates</strong>
        <div className="row" style={{ marginTop: 8 }}><Field label="Headline" value={n} onChange={(e) => setN(e.target.value)} /><button className="btn" style={{ alignSelf: 'flex-end' }} onClick={() => add('news', n.trim() && { t: n.trim() }, () => setN(''))}>Publish news</button></div></div>
    </>
  );
}
