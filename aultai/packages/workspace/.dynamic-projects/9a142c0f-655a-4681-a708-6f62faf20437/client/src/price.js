// Display-only copy of the server price rule. The server recalculates on checkout.
export const price = (p, parts, buyer, drop) => {
  let x = p.parts.length ? parts.reduce((s, i) => s + p.parts[i].p, 0) : p.price;
  if (buyer === 'Dealer') x *= 1 - p.dealerPct / 100;
  if (buyer === 'Drop shipper') x *= 1 - drop / 100;
  return Math.round(x * 100) / 100;
};
