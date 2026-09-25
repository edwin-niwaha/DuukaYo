# Storefront and POS upgrade

## Delivered

- Customer and shop headers now cycle through catalog products, with exact-product links, previous/next, pause, swipe and reduced-motion behavior. Web also pauses on focus/hover/offscreen; mobile pauses when backgrounded, unfocused or scrolled away.
- Product details support direct URLs and unavailable products. Product images have fallbacks. Existing product image URLs can be edited in the web catalog.
- Per-shop carts, phone cart access, clear/remove controls, final order review, current-price/stock checks and recent web order links.
- Guest checkout persists the original request before sending it. After an uncertain response, **Recover order** replays the original payload/key; editing and new submission are blocked until it is resolved. Mobile uses SecureStore; web uses local storage. Storage failure blocks submission instead of losing retry identity.
- Web cashier checkout includes scoped held sales, available-stock quantity limits, product photos, category selection, manual payment reference/confirmation, durable sale recovery and confirmed receipts that survive refresh failure.
- Mobile POS includes scoped held sales, category selection, product images, authorized discounts, explicit manual payment references/confirmation and persistent manual-payment recovery. Existing durable cash queue and offline conflict review remain intact.
- Tracking backs off on errors, pauses while backgrounded and stops after completion/cancellation.
- API discovery is paginated at 24 shops, with bounded product previews and server search. Public DTOs and OpenAPI are updated. Errors include a machine-readable code.
- Owners can choose the online fulfilment branch in web Settings. Migration `businesses.0002_storefront_branch` preserves each existing shop's first branch. Transactions continue to use server validation, business locks and reservation rules.

## Recovery and retention

Unresolved checkout/payment attempts are deliberately retained until the original request receives a confirmed result or a definitive rejection. The server's 30-minute order reservation expiry is not permission to discard an uncertain request and create a duplicate. Retry the original record to discover the outcome. A malformed record blocks a new checkout and directs the user to reconcile with the shop.

Successful requests remove their recovery record and contact payload. Web retains up to 20 private tracking tokens locally; mobile keeps up to 20 in SecureStore. These histories belong to that device/browser, not a customer account. Clearing device/browser data removes recovery information and history.

Held POS drafts are scoped to cashier, business and branch, limited to 10, and retained until resumed. They do not reserve inventory. Resume uses current prices and available/last-known stock and asks the cashier to review.

## Setup

Apply API migrations and restart the API after environment changes. Use an API host that the phone can reach and that Django permits. Web uses its same-origin proxy.

Catalog photos should be real shop-maintained image URLs. Four optional SVG demo illustrations are explicitly labelled as demonstrations. To populate empty image fields in the development demo shops:

```powershell
python manage.py seed_demo --image-base-url http://localhost:3000
```

Use a reachable web origin for the target device. Native production photos should use supported raster formats; the SVG demo illustrations are intended for the web demo.

Browser integration checks use `config.settings.browser`, a separate SQLite file `browser-test.sqlite3`, API port 8005, and web port 3105. It cannot use the working shop database. PostgreSQL concurrency tests use Django's isolated test database through `TEST_DATABASE_URL`.

## External capabilities

Live payment collection remains unconfigured; checkout supports payment at pickup/arrangement with the shop. Manual MTN/Airtel records remain unverified by a provider. Mobile receipt sharing and browser printing remain available; physical printer integration requires a configured, tested adapter.

An Android JavaScript/Hermes export and renderer interaction tests are included in verification. Native phone/tablet visual and keyboard QA still require an installed Android SDK/emulator or connected device; the configured SDK is unavailable in this environment.

## Verification completed — September 21, 2026

| Check | Result |
| --- | --- |
| PostgreSQL API tests, including competing POS/guest checkout | 70 passed; no skips |
| Django system check and migration drift | Passed; no pending model changes |
| OpenAPI generation and validation | Passed; no schema warnings |
| Web typecheck, lint and production build | Passed |
| Mobile typecheck and lint | Passed |
| Mobile/unit tests, including rendered storefront and POS interactions | 20 passed |
| Android production JavaScript/Hermes export | Passed |
| Playwright, including real API checkout/fulfilment in isolated database | 13 passed |
| Web screenshots at 390, 768 and 1440 pixels | Captured and inspected; no horizontal overflow |
| Working API connectivity | HTTP 200 |

Browser tests regenerate screenshots in the Git-ignored `docs/screenshots` directory.

The React renderer reports its upstream deprecation notice, and Node reports its SQLite experimental notice; neither caused a test failure. Google browser tests stub the identity-provider callback and verify the application's flow; they do not establish live Google provider configuration.
