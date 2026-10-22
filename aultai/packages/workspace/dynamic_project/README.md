# Gilingan Coffee Supply — React + Express e-commerce sample

A sample online store with a **React** frontend and an **Express.js** backend.
One command runs both, on one port, in one terminal.

## Requirements
Node.js 18.18 or newer (check with `node -v`). Get it from https://nodejs.org.

## Run it

**Easiest (Windows):** double-click `start-windows.bat`.

**Or in a terminal**, inside this folder:

```bash
npm install
npm start
```

Then open the address the terminal shows, usually **http://localhost:3000**.

If a port is blocked or already in use, the server automatically tries the next one
(3001, 3002 …) and tells you which address to open.

Stop the server with **Ctrl+C**.

## Accounts and roles

There are three kinds of account. Sign in with **Sign in** at the top right.

| Role | What they can do | Demo login |
|---|---|---|
| **Customer** (`user`) | Shop, check out, see their own orders under **My orders** | `user@gilingan.my` / `user123` |
| **Editor** | Everything a customer can, plus add and edit products, prices and stock (**Manage products**) | `editor@gilingan.my` / `editor123` |
| **Admin** | Everything an editor can, plus delete products, change order status, change user roles, delete users, and see sales stats (**Admin dashboard**) | `admin@gilingan.my` / `admin123` |

- Anyone can browse the shop; signing in is needed to check out.
- New sign-ups are always customers. An admin can promote them to editor or admin from **Admin dashboard → Users**.
- Permissions are checked on the server, not just hidden in the page.
- Passwords are stored hashed (scrypt). Change the demo passwords in `backend/server.js` before real use.
- Accounts, sessions and orders are kept in memory, so they reset when the server restarts.

## Production build

```bash
npm run build   # builds the React app into frontend/dist
npm run prod    # serves the API and the built site
```

## Folder layout

```
gilingan-store/
├── package.json         ← all dependencies and scripts
├── start-windows.bat    ← double-click to install and run on Windows
├── backend/
│   └── server.js        ← Express API + runs the frontend
└── frontend/
    ├── index.html
    ├── vite.config.js
    └── src/
        ├── main.jsx, App.jsx, api.js, utils.js, styles.css
        ├── hooks/        ← useAuth, useCart, useToast
        └── components/   ← Header, Hero, Filters, ProductCard, ProductModal, CartDrawer,
                             AuthModal, MyOrders, ProductManager, AdminDashboard, Art, Icons
```

## API

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/categories` | Categories with product counts |
| GET | `/api/products` | List products. Query: `q`, `category`, `min`, `max`, `inStock`, `sort` (`featured`, `price-asc`, `price-desc`, `rating`, `name`) |
| GET | `/api/products/:id` | One product plus related products |
| POST | `/api/discount` | Body `{ "code": "KOPI10" }` — checks a discount code |
| POST | `/api/orders` | Signed in. Body `{ items: [{id, qty}], customer: {name, email, address, city, postcode}, discountCode }` |
| GET | `/api/orders/:id` | One order (its owner or an admin) |
| POST | `/api/auth/register` | Create a customer account |
| POST | `/api/auth/login` | Sign in, returns a token |
| POST | `/api/auth/logout` | Sign out |
| GET | `/api/auth/me` | The signed-in account |
| GET | `/api/my/orders` | The signed-in account's orders |
| POST / PUT | `/api/products`, `/api/products/:id` | Add / edit a product (editor, admin) |
| DELETE | `/api/products/:id` | Delete a product (admin) |
| GET | `/api/admin/stats` | Revenue, order and stock summary (admin) |
| GET / PATCH | `/api/admin/orders`, `/api/admin/orders/:id` | All orders / change status (admin) |
| GET / PATCH / DELETE | `/api/admin/users`, `/api/admin/users/:id` | List users / change role / delete (admin) |

Signed-in requests send the header `Authorization: Bearer <token>`.

Discount codes for testing: `KOPI10` (10% off) and `WELCOME15` (15% off).

## Troubleshooting

- **`'npm' is not recognized`**: Node.js isn't installed, or the terminal was opened before installing it. Install Node.js, then open a new terminal.
- **The page says "Store unavailable"**: the server stopped. Run `npm start` again and refresh.
- **Want a specific port?** Windows: `set PORT=8080 && npm start`. Mac/Linux: `PORT=8080 npm start`.

## Notes
- Data is kept in memory, so it resets when the server restarts. Replace the `products` and `orders` arrays in `backend/server.js` with a database for real use.
- Prices and stock are always checked on the server when an order is placed.
- No payment is taken; placing an order only reserves stock and returns an order number.
- Fonts are bundled with the project, so the site works without an internet connection.
