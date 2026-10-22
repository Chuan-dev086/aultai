# E-commerce sample (Express + React)

Mock backend (in-memory data, resets on restart) and a React frontend based on the demo transcript.

    npm install
    npm run dev      # API on :4000, web on http://localhost:5173

Vite proxies /api to Express. To use a real database later, replace the arrays in `server/data.js`
and the route bodies in `server/index.js`; the React code only talks to `/api`.

## API
| Method | Path | Purpose |
|---|---|---|
| GET | /api/store | settings, categories, products, couriers, vouchers, FAQ, news, dealer quota |
| POST/DELETE | /api/products, /api/products/:id | vendor adds or removes a product (bundle parts, variants, pre-order) |
| POST | /api/orders | place order (server recalculates prices, voucher, shipping, term payment) |
| GET/PATCH | /api/orders, /api/orders/:id | list orders, change status |
| POST | /api/vouchers/validate | check a discount code |
| POST/PATCH | /api/vouchers, /api/vouchers/:code | create code, toggle on/off |
| GET | /api/reports, /api/reports/csv | sales and stock report, CSV export |
| PUT | /api/settings, /api/dealer | banner and drop shipper %, term payment quota |
| POST | /api/couriers, /api/content/:kind | add courier; add cats, faqs or news |
