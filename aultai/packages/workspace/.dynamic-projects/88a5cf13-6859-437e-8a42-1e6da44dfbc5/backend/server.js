/**
 * Gilingan Coffee Supply — Express.js server
 *
 * Accounts have one of three roles: user (customer), editor, admin.
 *
 * One server runs everything:
 *   - the REST API under /api
 *   - the React frontend (live-reloading through Vite in development,
 *     or the built files from frontend/dist with --prod)
 *
 * If a port is blocked or busy (common on Windows), the server
 * automatically tries the next one.
 */

import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());

/* ------------------------------------------------------------------ */
/*  DATA (in-memory — swap for a database in production)              */
/* ------------------------------------------------------------------ */

const categories = [
  { id: "beans", name: "Beans" },
  { id: "brewers", name: "Brewers" },
  { id: "grinders", name: "Grinders" },
  { id: "kettles", name: "Kettles" },
  { id: "cups", name: "Cups & mugs" },
];

const products = [
  { id: 1, name: "Bukit Tinggi Natural", category: "beans", price: 58, stock: 40, rating: 4.8, reviews: 212, art: "bag", color: "#8E3B46", featured: true,
    description: "Sun-dried Liberica-Arabica blend from the Pahang highlands. Jackfruit, cocoa nib and a long brown-sugar finish.", tags: ["250g", "Medium roast", "Filter"] },
  { id: 2, name: "Sabah Washed Arabica", category: "beans", price: 64, stock: 22, rating: 4.7, reviews: 98, art: "bag", color: "#2F4A3E",
    description: "Grown near Mount Kinabalu. Clean and bright with lime zest, black tea and honey.", tags: ["250g", "Light roast", "Pour-over"] },
  { id: 3, name: "Espresso Harian", category: "beans", price: 49, stock: 75, rating: 4.6, reviews: 341, art: "bag", color: "#5A3E2B",
    description: "Our everyday espresso. Dense and chocolatey, holds up well in milk.", tags: ["500g", "Dark roast", "Espresso"] },
  { id: 4, name: "Kalis Ceramic Dripper", category: "brewers", price: 89, stock: 18, rating: 4.9, reviews: 156, art: "dripper", color: "#C99A2E", featured: true,
    description: "Spiral-ribbed porcelain cone for an even, unhurried extraction. Fits size 02 filters.", tags: ["Porcelain", "1–4 cups"] },
  { id: 5, name: "Glass Pour-over Set", category: "brewers", price: 129, stock: 12, rating: 4.5, reviews: 64, art: "dripper", color: "#6D8A96",
    description: "Borosilicate dripper and 600 ml server with a wooden collar.", tags: ["Glass", "600 ml"] },
  { id: 6, name: "Batu Hand Grinder", category: "grinders", price: 349, stock: 9, rating: 4.9, reviews: 203, art: "grinder", color: "#1C2321", featured: true,
    description: "48 mm stainless conical burrs with 40 click settings, from Turkish to cold brew.", tags: ["Steel burrs", "40 settings"] },
  { id: 7, name: "Electric Burr Grinder", category: "grinders", price: 599, stock: 6, rating: 4.4, reviews: 77, art: "grinder", color: "#7A7F7C",
    description: "Flat-burr electric grinder with a timed dose button and anti-static cup.", tags: ["Flat burrs", "Timed dose"] },
  { id: 8, name: "Gooseneck Kettle 0.9L", category: "kettles", price: 219, stock: 15, rating: 4.7, reviews: 188, art: "kettle", color: "#2F4A3E",
    description: "Hold temperature to the degree, with a slow-pour spout built for spiral pours.", tags: ["Variable temp", "0.9 L"] },
  { id: 9, name: "Stovetop Gooseneck", category: "kettles", price: 119, stock: 30, rating: 4.3, reviews: 52, art: "kettle", color: "#B5B9B6",
    description: "Brushed steel gooseneck for gas and induction hobs.", tags: ["Induction ready", "1 L"] },
  { id: 10, name: "Tanah Stoneware Mug", category: "cups", price: 45, stock: 60, rating: 4.8, reviews: 129, art: "cup", color: "#8E3B46",
    description: "Hand-thrown in Perak with a speckled glaze. Each one turns out slightly different.", tags: ["300 ml", "Handmade"] },
  { id: 11, name: "Double-wall Glass Cup", category: "cups", price: 35, stock: 0, rating: 4.2, reviews: 41, art: "cup", color: "#6D8A96",
    description: "Keeps your hand cool and your coffee hot. Dishwasher safe.", tags: ["200 ml", "Glass"] },
  { id: 12, name: "Cold Brew Bottle", category: "brewers", price: 79, stock: 25, rating: 4.6, reviews: 90, art: "dripper", color: "#5A3E2B",
    description: "Steep overnight, pour in the morning. Fine mesh filter lifts out for cleaning.", tags: ["1 L", "Cold brew"] },
];

const orders = new Map();
const SHIPPING_FEE = 10;
const FREE_SHIPPING_FROM = 150;

const discountCodes = { KOPI10: 0.1, WELCOME15: 0.15 };

/* ------------------------------------------------------------------ */
/*  USERS & AUTH                                                      */
/*  Roles: "user" (customer), "editor" (manages products),            */
/*         "admin" (everything, including orders and users)           */
/* ------------------------------------------------------------------ */

const ROLES = ["user", "editor", "admin"];

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return salt + ":" + hash;
}

function checkPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const test = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(test, Buffer.from(hash, "hex"));
}

let nextUserId = 1;
const users = [];

function createUser({ name, email, password, role = "user" }) {
  const user = {
    id: nextUserId++,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    passwordHash: hashPassword(password),
    role,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  return user;
}

// Demo accounts — change these passwords before using the app for real.
createUser({ name: "Admin Amir", email: "admin@gilingan.my", password: "admin123", role: "admin" });
createUser({ name: "Editor Esha", email: "editor@gilingan.my", password: "editor123", role: "editor" });
createUser({ name: "Customer Chong", email: "user@gilingan.my", password: "user123", role: "user" });

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt });

// token -> userId (in-memory sessions; everyone is signed out when the server restarts)
const sessions = new Map();

function startSession(user) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, user.id);
  return token;
}

// Reads the "Authorization: Bearer <token>" header and sets req.user if valid.
function loadUser(req, res, next) {
  const header = req.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const userId = token && sessions.get(token);
  req.user = userId ? users.find((u) => u.id === userId) || null : null;
  req.token = token;
  next();
}

function requireLogin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Sign in to continue." });
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Sign in to continue." });
    if (!roles.includes(req.user.role))
      return res.status(403).json({ error: "Your account doesn't have permission to do this." });
    next();
  };
}

app.use("/api", loadUser);

app.post("/api/auth/register", (req, res) => {
  const { name = "", email = "", password = "" } = req.body || {};
  if (!name.trim() || !email.trim() || !password)
    return res.status(400).json({ error: "Enter your name, email and a password." });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
  if (password.length < 6) return res.status(400).json({ error: "Use a password with at least 6 characters." });
  if (users.some((u) => u.email === email.trim().toLowerCase()))
    return res.status(409).json({ error: "An account with this email already exists. Sign in instead." });

  const user = createUser({ name, email, password, role: "user" }); // new sign-ups are always customers
  res.status(201).json({ token: startSession(user), user: publicUser(user) });
});

app.post("/api/auth/login", (req, res) => {
  const { email = "", password = "" } = req.body || {};
  const user = users.find((u) => u.email === String(email).trim().toLowerCase());
  if (!user || !checkPassword(String(password), user.passwordHash))
    return res.status(401).json({ error: "Email or password is incorrect." });
  res.json({ token: startSession(user), user: publicUser(user) });
});

app.post("/api/auth/logout", (req, res) => {
  if (req.token) sessions.delete(req.token);
  res.json({ ok: true });
});

app.get("/api/auth/me", requireLogin, (req, res) => res.json(publicUser(req.user)));

/* ------------------------------------------------------------------ */
/*  API                                                               */
/* ------------------------------------------------------------------ */

app.get("/api/categories", (req, res) => {
  const withCounts = categories.map((c) => ({
    ...c,
    count: products.filter((p) => p.category === c.id).length,
  }));
  res.json(withCounts);
});

app.get("/api/products", (req, res) => {
  const { q = "", category, min, max, sort = "featured", inStock } = req.query;
  let list = products.slice();

  if (q) {
    const term = String(q).toLowerCase();
    list = list.filter((p) =>
      [p.name, p.description, ...p.tags].join(" ").toLowerCase().includes(term)
    );
  }
  if (category && category !== "all") list = list.filter((p) => p.category === category);
  if (min) list = list.filter((p) => p.price >= Number(min));
  if (max) list = list.filter((p) => p.price <= Number(max));
  if (inStock === "true") list = list.filter((p) => p.stock > 0);

  const sorters = {
    featured: (a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || b.rating - a.rating,
    "price-asc": (a, b) => a.price - b.price,
    "price-desc": (a, b) => b.price - a.price,
    rating: (a, b) => b.rating - a.rating,
    name: (a, b) => a.name.localeCompare(b.name),
  };
  list.sort(sorters[sort] || sorters.featured);
  res.json({ total: list.length, items: list });
});

app.get("/api/products/:id", (req, res) => {
  const product = products.find((p) => p.id === Number(req.params.id));
  if (!product) return res.status(404).json({ error: "Product not found" });
  const related = products
    .filter((p) => p.category === product.category && p.id !== product.id)
    .slice(0, 3);
  res.json({ ...product, related });
});

app.post("/api/discount", (req, res) => {
  const code = String(req.body.code || "").trim().toUpperCase();
  if (!discountCodes[code]) return res.status(400).json({ error: "This code isn't valid. Check the spelling and try again." });
  res.json({ code, rate: discountCodes[code] });
});

app.post("/api/orders", requireLogin, (req, res) => {
  const { items, customer, discountCode } = req.body || {};

  if (!Array.isArray(items) || items.length === 0)
    return res.status(400).json({ error: "Your cart is empty." });

  const required = ["name", "email", "address", "city", "postcode"];
  const missing = required.filter((f) => !customer || !String(customer[f] || "").trim());
  if (missing.length)
    return res.status(400).json({ error: "Fill in: " + missing.join(", ") + "." });
  if (!/^\S+@\S+\.\S+$/.test(customer.email))
    return res.status(400).json({ error: "Enter a valid email address." });

  // Prices are always recalculated on the server — never trust the client.
  const lines = [];
  for (const item of items) {
    const p = products.find((x) => x.id === Number(item.id));
    const qty = Math.max(1, Math.floor(Number(item.qty) || 0));
    if (!p) return res.status(400).json({ error: "A product in your cart no longer exists. Remove it to continue." });
    if (p.stock < qty)
      return res.status(409).json({ error: p.name + " has only " + p.stock + " left. Lower the quantity to continue." });
    lines.push({ id: p.id, name: p.name, price: p.price, qty, total: p.price * qty });
  }

  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  const rate = discountCodes[String(discountCode || "").toUpperCase()] || 0;
  const discount = Math.round(subtotal * rate * 100) / 100;
  const shipping = subtotal - discount >= FREE_SHIPPING_FROM ? 0 : SHIPPING_FEE;
  const total = Math.round((subtotal - discount + shipping) * 100) / 100;

  lines.forEach((l) => { products.find((p) => p.id === l.id).stock -= l.qty; });

  const order = {
    id: "GL-" + crypto.randomBytes(3).toString("hex").toUpperCase(),
    userId: req.user.id,
    createdAt: new Date().toISOString(),
    customer: {
      name: String(customer.name).trim(), email: String(customer.email).trim(),
      address: String(customer.address).trim(), city: String(customer.city).trim(),
      postcode: String(customer.postcode).trim(),
    },
    lines, subtotal, discount, shipping, total,
    status: "Confirmed",
  };
  orders.set(order.id, order);
  res.status(201).json(order);
});

// Customers see their own orders
app.get("/api/my/orders", requireLogin, (req, res) => {
  const mine = [...orders.values()]
    .filter((o) => o.userId === req.user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json(mine);
});

// One order: its owner, or an admin
app.get("/api/orders/:id", requireLogin, (req, res) => {
  const order = orders.get(req.params.id);
  if (!order || (order.userId !== req.user.id && req.user.role !== "admin"))
    return res.status(404).json({ error: "Order not found" });
  res.json(order);
});

/* ------------------------------------------------------------------ */
/*  PRODUCT MANAGEMENT (editor + admin)                               */
/* ------------------------------------------------------------------ */

const ART_TYPES = ["bag", "dripper", "grinder", "kettle", "cup"];

// Validates product fields from a form. Returns { data } or { error }.
function readProduct(body, existing = {}) {
  const b = body || {};
  const name = String(b.name ?? existing.name ?? "").trim();
  const category = String(b.category ?? existing.category ?? "");
  const price = Number(b.price ?? existing.price);
  const stock = Math.floor(Number(b.stock ?? existing.stock));
  const description = String(b.description ?? existing.description ?? "").trim();
  const art = String(b.art ?? existing.art ?? "bag");
  const color = String(b.color ?? existing.color ?? "#2F4A3E");
  let tags = b.tags ?? existing.tags ?? [];
  if (typeof tags === "string") tags = tags.split(",");
  tags = tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 6);
  const featured = Boolean(b.featured ?? existing.featured);

  if (!name) return { error: "Enter a product name." };
  if (!categories.some((c) => c.id === category)) return { error: "Choose a category." };
  if (!Number.isFinite(price) || price <= 0) return { error: "Enter a price above 0." };
  if (!Number.isFinite(stock) || stock < 0) return { error: "Stock must be 0 or more." };
  if (!ART_TYPES.includes(art)) return { error: "Choose a picture style." };
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return { error: "Choose a colour." };

  return { data: { name, category, price: Math.round(price * 100) / 100, stock, description, art, color, tags, featured } };
}

app.post("/api/products", requireRole("editor", "admin"), (req, res) => {
  const { data, error } = readProduct(req.body);
  if (error) return res.status(400).json({ error });
  const id = products.reduce((m, p) => Math.max(m, p.id), 0) + 1;
  const product = { id, rating: 0, reviews: 0, ...data };
  products.push(product);
  res.status(201).json(product);
});

app.put("/api/products/:id", requireRole("editor", "admin"), (req, res) => {
  const product = products.find((p) => p.id === Number(req.params.id));
  if (!product) return res.status(404).json({ error: "Product not found" });
  const { data, error } = readProduct(req.body, product);
  if (error) return res.status(400).json({ error });
  Object.assign(product, data);
  res.json(product);
});

app.delete("/api/products/:id", requireRole("admin"), (req, res) => {
  const index = products.findIndex((p) => p.id === Number(req.params.id));
  if (index === -1) return res.status(404).json({ error: "Product not found" });
  const [removed] = products.splice(index, 1);
  res.json({ deleted: removed.id });
});

/* ------------------------------------------------------------------ */
/*  ADMIN: dashboard, orders, users                                   */
/* ------------------------------------------------------------------ */

const ORDER_STATUSES = ["Confirmed", "Packed", "Shipped", "Delivered", "Cancelled"];

app.get("/api/admin/stats", requireRole("admin"), (req, res) => {
  const all = [...orders.values()];
  const active = all.filter((o) => o.status !== "Cancelled");
  res.json({
    revenue: Math.round(active.reduce((s, o) => s + o.total, 0) * 100) / 100,
    orders: all.length,
    openOrders: all.filter((o) => ["Confirmed", "Packed", "Shipped"].includes(o.status)).length,
    customers: users.filter((u) => u.role === "user").length,
    lowStock: products.filter((p) => p.stock < 10).map((p) => ({ id: p.id, name: p.name, stock: p.stock })),
  });
});

app.get("/api/admin/orders", requireRole("admin"), (req, res) => {
  res.json([...orders.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
});

app.patch("/api/admin/orders/:id", requireRole("admin"), (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  const status = String((req.body || {}).status || "");
  if (!ORDER_STATUSES.includes(status)) return res.status(400).json({ error: "Choose a valid status." });

  // Cancelling puts the items back in stock; un-cancelling takes them out again.
  if (status === "Cancelled" && order.status !== "Cancelled") {
    order.lines.forEach((l) => { const p = products.find((x) => x.id === l.id); if (p) p.stock += l.qty; });
  } else if (order.status === "Cancelled" && status !== "Cancelled") {
    for (const l of order.lines) {
      const p = products.find((x) => x.id === l.id);
      if (!p || p.stock < l.qty) return res.status(409).json({ error: "Not enough stock to restore this order." });
    }
    order.lines.forEach((l) => { products.find((x) => x.id === l.id).stock -= l.qty; });
  }
  order.status = status;
  res.json(order);
});

app.get("/api/admin/users", requireRole("admin"), (req, res) => {
  res.json(users.map((u) => ({
    ...publicUser(u),
    orders: [...orders.values()].filter((o) => o.userId === u.id).length,
  })));
});

app.patch("/api/admin/users/:id", requireRole("admin"), (req, res) => {
  const user = users.find((u) => u.id === Number(req.params.id));
  if (!user) return res.status(404).json({ error: "User not found" });
  const role = String((req.body || {}).role || "");
  if (!ROLES.includes(role)) return res.status(400).json({ error: "Choose a valid role." });
  if (user.id === req.user.id && role !== "admin")
    return res.status(400).json({ error: "You can't remove your own admin access." });
  user.role = role;
  res.json(publicUser(user));
});

app.delete("/api/admin/users/:id", requireRole("admin"), (req, res) => {
  const index = users.findIndex((u) => u.id === Number(req.params.id));
  if (index === -1) return res.status(404).json({ error: "User not found" });
  if (users[index].id === req.user.id) return res.status(400).json({ error: "You can't delete your own account." });
  const [removed] = users.splice(index, 1);
  for (const [token, id] of sessions) if (id === removed.id) sessions.delete(token);
  res.json({ deleted: removed.id });
});

/* ------------------------------------------------------------------ */
/*  FRONTEND + STARTUP                                                */
/* ------------------------------------------------------------------ */

// Unknown API routes return JSON instead of the web page
app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

const isProd = process.argv.includes("--prod");
const frontendDir = path.join(__dirname, "..", "frontend");
const distDir = path.join(frontendDir, "dist");
const server = http.createServer(app);

if (isProd) {
  if (!fs.existsSync(path.join(distDir, "index.html"))) {
    console.log("\nNo production build found. Run this first:\n\n  npm run build\n");
    process.exit(0);
  }
  app.use(express.static(distDir));
  app.use((req, res) => res.sendFile(path.join(distDir, "index.html")));
} else {
  // Vite runs inside Express, so the API and the site share one port.
  const { createServer } = await import("vite");
  const vite = await createServer({
    root: frontendDir,
    configFile: path.join(frontendDir, "vite.config.js"),
    appType: "spa",
    logLevel: "warn",
    server: { middlewareMode: true, hmr: { server } },
  });
  app.use(vite.middlewares);
}

// Error handler: log problems and answer with JSON instead of crashing
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "The request body isn't valid JSON." });
  }
  console.error("Request error:", err.message);
  res.status(500).json({ error: "Something went wrong on the server." });
});

const START_PORT = Number(process.env.PORT) || 3000;
const MAX_TRIES = 30;

function listen(port, triesLeft) {
  const onListening = () => {
    server.off("error", onError);
    const actualPort = server.address().port;
    console.log("\n  Gilingan Coffee Supply is running" + (isProd ? " (production build)" : ""));
    console.log("\n  Open:  http://localhost:" + actualPort + "\n");
    console.log("  Press Ctrl+C to stop.\n");
  };
  const onError = (err) => {
    server.off("listening", onListening);
    if ((err.code === "EADDRINUSE" || err.code === "EACCES") && triesLeft > 0) {
      console.log("Port " + port + " isn't available, trying " + (port + 1) + "…");
      listen(port + 1, triesLeft - 1);
    } else {
      console.error("\nCouldn't start the server: " + err.message);
      console.error("Try another port, for example:  set PORT=8080 && npm start\n");
      process.exit(1);
    }
  };
  server.once("error", onError);
  server.once("listening", onListening);
  server.listen(port);
}

listen(START_PORT, MAX_TRIES);
