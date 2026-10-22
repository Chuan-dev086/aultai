// Small wrapper around fetch for the Express API.
// The sign-in token is sent with every request when the person is signed in.

const TOKEN_KEY = "gilingan-token";
let token = null;
try { token = localStorage.getItem(TOKEN_KEY); } catch { /* storage unavailable */ }

export function setToken(value) {
  token = value;
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* storage unavailable */ }
}
export const hasToken = () => Boolean(token);

export async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Request failed");
    err.status = res.status;
    throw err;
  }
  return data;
}

const send = (method, body) => ({ method, body: JSON.stringify(body) });

// Shop
export const getCategories = () => api("/api/categories");
export const getProducts = (params) => api("/api/products?" + new URLSearchParams(params));
export const getProduct = (id) => api("/api/products/" + id);
export const checkDiscount = (code) => api("/api/discount", send("POST", { code }));
export const createOrder = (payload) => api("/api/orders", send("POST", payload));
export const getMyOrders = () => api("/api/my/orders");

// Accounts
export const login = (email, password) => api("/api/auth/login", send("POST", { email, password }));
export const register = (name, email, password) => api("/api/auth/register", send("POST", { name, email, password }));
export const logout = () => api("/api/auth/logout", { method: "POST" });
export const getMe = () => api("/api/auth/me");

// Editor + admin
export const createProduct = (data) => api("/api/products", send("POST", data));
export const updateProduct = (id, data) => api("/api/products/" + id, send("PUT", data));
export const deleteProduct = (id) => api("/api/products/" + id, { method: "DELETE" });

// Admin
export const getStats = () => api("/api/admin/stats");
export const getAllOrders = () => api("/api/admin/orders");
export const setOrderStatus = (id, status) => api("/api/admin/orders/" + id, send("PATCH", { status }));
export const getUsers = () => api("/api/admin/users");
export const setUserRole = (id, role) => api("/api/admin/users/" + id, send("PATCH", { role }));
export const deleteUser = (id) => api("/api/admin/users/" + id, { method: "DELETE" });
