export const FREE_SHIPPING_FROM = 150;
export const SHIPPING_FEE = 10;

export const money = (n) => "RM " + Number(n).toFixed(2);

// Mix a hex colour toward white, for soft product backgrounds.
export function tint(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mix = (c) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}
