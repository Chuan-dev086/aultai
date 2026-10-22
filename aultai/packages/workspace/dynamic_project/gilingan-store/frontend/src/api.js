// Small wrapper around fetch for the Express API.
export async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export const getCategories = () => api("/api/categories");
export const getProducts = (params) => api("/api/products?" + new URLSearchParams(params));
export const getProduct = (id) => api("/api/products/" + id);
export const checkDiscount = (code) =>
  api("/api/discount", { method: "POST", body: JSON.stringify({ code }) });
export const createOrder = (payload) =>
  api("/api/orders", { method: "POST", body: JSON.stringify(payload) });
