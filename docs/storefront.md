# Customer storefront

The web homepage and mobile home screen now let customers discover shops and order without an account. Staff tools are at `/dashboard` on web and **Business tools** (`/pos`) on mobile.

## Publish a shop

Create a business and branch, add products, mark them **Published**, and record stock. Only active, published products are public. Shops appear in the directory when they have a branch and at least one public product. Product image URLs are displayed on both clients, with a neutral placeholder for missing or failed images.

Enable delivery and configure its fee in business settings if needed. Pickup is always available. The configured online fulfilment branch supplies the catalog and receives its orders; existing shops retain their first branch after migration. Available quantities subtract reservations and the safety buffer.

## Shopping and fulfilment

Customers can browse stores, search products, filter categories, sort prices, adjust a cart, and order pickup or delivery. Checkout asks for a name, phone number, and delivery address when relevant. No payment is collected online: customers pay at pickup or arrange payment with the shop.

The web cart is saved per shop and checked against stock on reload. Mobile saves carts per shop and securely stores the latest 20 private order tokens for tracking. Its floating navigation offers Home, Shops, Cart, Orders, and Profile. Staff sign in and log out from Profile; logout preserves pending offline sales for their original staff account. Web logout is available in the signed-in storefront header and dashboard. Order tracking refreshes every 15 seconds. Staff manage incoming orders through their existing Orders screen.

Pending orders expire after 30 minutes unless accepted. Browsing or tracking also releases expired reservations when the background worker is unavailable. Checkout requires a connection and never enters the staff POS offline queue. Pending checkout requests persist across reload/restart. Recover the original request before editing or submitting another order. The API validates prices, quantities, delivery eligibility and totals.

## Public API

- `GET /api/v1/shops/`: discoverable shops, categories, counts and preview products. Optional `?q=` searches shop, category and public product names. `?page=` returns 24 shops per page, with `count` and `next_page`.
- `GET /api/v1/shop/{slug}/`: shop details, public products, categories and available quantities.
- `POST /api/v1/shop/{slug}/`: `client_id` UUID, `name`, `phone`, `delivery`, optional `address`, and `lines` containing `product`, `quantity`, observed `price`. Returns `id` and private `token`.
- `GET /api/v1/guest-orders/{token}/`: status, public line snapshots, total, delivery fee, expiry and shop contact. No customer contact data or private product costs are returned.

Apply migration `businesses.0002_storefront_branch`. See [the upgrade notes](storefront-pos-upgrade.md) for checkout recovery, product links and held sales.

## Checks

API: `python manage.py test apps.common apps.accounts config.tests --settings=config.settings.test`.

Both clients: `npm run typecheck` and `npm run lint`. Web: `npm run build`. Mobile: `npm test` and `npx expo export --platform android`.

For storefront browser tests, serve the built web app on port 3105, then run `npx playwright test tests/storefront.spec.ts`. These tests mock the API and never create real customer orders. They cover discovery, filtering, cart restoration, delivery checkout, tracking, empty searches, unavailable stock, error recovery, and phone-width overflow.
