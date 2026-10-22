// In-memory mock database. Replace with a real DB later.
export const db = {
  settings: { shop: 'Timberline', banner: 'Build your table, part by part', sub: 'Pick only the top, legs and hardware you need. Dealers and drop shippers see their own prices.', dropPct: 8 },
  cats: ['Tables', 'Seating', 'Lighting', 'Storage'],
  products: [
    { id: 1, name: 'Oak dining table', cat: 'Tables', price: 0, stock: 12, emoji: '🪵', desc: 'Solid oak sold as separate parts.', dealerPct: 12, variants: ['Natural', 'Smoked'], pre: '', parts: [{ n: 'Table top', p: 320 }, { n: 'Table legs (set of 4)', p: 180 }, { n: 'Screw and bracket kit', p: 25 }] },
    { id: 2, name: 'Walnut dining chair', cat: 'Seating', price: 149, stock: 30, emoji: '🪑', desc: 'Curved back, hand-sanded finish.', dealerPct: 15, variants: ['Walnut', 'Ash'], pre: '', parts: [] },
    { id: 3, name: 'Linen sofa, 3-seater', cat: 'Seating', price: 1290, stock: 0, emoji: '🛋️', desc: 'Made to order in a small batch.', dealerPct: 10, variants: ['Oat', 'Charcoal'], pre: '12 Dec 2026', parts: [] },
    { id: 4, name: 'Arc floor lamp', cat: 'Lighting', price: 89, stock: 4, emoji: '💡', desc: 'Warm light, brass finish.', dealerPct: 20, variants: [], pre: '', parts: [] },
    { id: 5, name: 'Bookshelf set', cat: 'Storage', price: 0, stock: 8, emoji: '📚', desc: 'Frame and shelves sold separately.', dealerPct: 12, variants: [], pre: '', parts: [{ n: 'Frame', p: 210 }, { n: 'Shelf board x4', p: 96 }, { n: 'Back panel', p: 40 }] },
  ],
  vouchers: [{ code: 'WELCOME10', type: 'pct', val: 10, on: true }, { code: 'FLAT30', type: 'flat', val: 30, on: true }],
  couriers: [{ name: 'Standard courier', rate: 12 }, { name: 'EasyParcel (third party)', rate: 9.5 }],
  dealer: { quota: 900 },
  faqs: [{ q: 'How do bundle products work?', a: 'Tick the parts you want. The price updates as you choose.' }, { q: 'What is term payment?', a: 'A credit quota the vendor gives to dealers, used at checkout.' }],
  news: [{ t: 'Autumn pre-order open for the linen sofa' }],
  orders: [],
};
