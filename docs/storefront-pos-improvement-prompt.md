# DuukaYo storefront, checkout, and POS improvement prompt

## Repository assessment

Based on source inspection and the existing desktop landing screenshot, September 21, 2026. This is not a runtime verification or a claim that all existing tests pass.

- **API:** Django/DRF, PostgreSQL, Celery and Redis. Guest checkout already validates product prices, reserves stock, uses transaction locking and request fingerprints, and supports private order tracking. Orders progress through pending, accepted, preparing, ready, completed or cancelled. Completion creates a sale. Public orders currently use the first branch.
- **Web:** Next.js 16.3.5 and React 19. The public marketplace, shop catalogs, saved per-shop carts, guest checkout and tracking already exist. Staff use `/dashboard`, with a separate checkout component. The cream/green visual direction is established, but the homepage hero uses a static shopping-cart illustration. Product cards do not expose a product-detail journey. Guest checkout request IDs live in a component ref, so retry continuity does not survive a reload.
- **Mobile:** Expo 57, React Native, Expo Router, SQLite and SecureStore. Customer Home, Shops, Cart, Orders and Profile coexist with `/pos`. Carts and recent order tokens persist; staff cash sales have an account-scoped offline queue. The customer hero is static and guest request IDs also live in a component ref.
- **POS:** Web already supports SKU/barcode keyboard input, customers, restricted discounts, cash and manual mobile-money records. Mobile supports durable offline cash capture and sync review. Web quantity input has no stock-based upper bound; server validation remains essential. The web checkout clears the cart after sale creation, then awaits a refresh inside the same error handler, which can make a refresh failure look like a failed sale.
- **Boundaries:** Live payment providers are unconfigured. The mobile physical-printer adapter deliberately throws; receipt sharing is the fallback. Public discovery currently collects the full published catalog before returning shop previews; bounded queries/pagination deserve attention as data grows. `ShopCatalog.shop` is typed as `ShopSummary` although the catalog response omits some directory-only fields.
- **Working tree:** Many application changes already exist. Preserve them and build on the current working files.

## Copy-ready implementation prompt

You are working in the existing DuukaYo repository. Implement a polished, welcoming customer storefront and a reliable cashier POS across `duukayo-api`, `duukayo-web`, and `duukayo-mobile`. Deliver functioning code, migrations where needed, tests, and visual verification. Use the current architecture and preserve existing work. Read repository instructions, including `duukayo-web/AGENTS.md` and the installed Next.js documentation before editing web code.

### 1. Visual direction and customer navigation

First bring network reliability to a release standard: verify the device API URL is reachable and allowed by Django, test the web proxy, use bounded request timeouts with timer cleanup, and distinguish connectivity failures from HTTP validation errors. Handle HTML error responses without exposing raw parser errors. Never blindly retry checkout or payment writes. Cover cancelled requests, timeouts while reading bodies, server downtime, expired sessions and recovery with tests. Report whether a device or server restart is needed after environment changes. Do not hide errors with fake success states.

Evolve the existing cream, forest-green and soft-lime identity into a refined local-shopping experience. Use generous spacing, readable typography, rounded cards, restrained shadows, appealing real product imagery and clear prices. Keep the welcoming editorial headline style; use a highly readable sans serif for shopping controls. Avoid excessive decoration, fake reviews, invented discounts, false stock urgency or unsupported delivery promises.

Make discovery, search, cart and order tracking easy to find. Keep a clearly labelled Business tools entry for staff. Customers must browse and order without signing in. Preserve `/`, `/shop/[storeSlug]`, `/order/[token]`, `/dashboard` and the existing mobile routes. Give customers a coherent journey: discover shop → browse product → product details → cart → checkout → confirmation → tracking.

On web, use a persistent cart entry, a useful desktop cart panel/drawer, and a compact phone cart bar that opens a full cart view. On mobile, retain Home, Shops, Cart, Orders and Profile with correct safe-area and keyboard handling. A cart always belongs to one shop; show separate shop carts and checkouts instead of merging unrelated merchants or currencies.

### 2. Moving, clickable product header card

Replace the static homepage hero artwork with a dynamic product showcase populated from actual active, published products. Use a large rounded header card: welcoming headline and shopping CTA beside a smoothly cycling arrangement of product images/cards. On phones, stack the copy above a swipeable product carousel. Apply the same visual language to each shop's header using only that shop's products.

Each product image/card must be a real link or accessible pressable showing its name, price and shop. Clicking opens that exact product's details in its correct shop. Implement a stable product deep link or URL-addressable detail dialog, including direct loads, refresh and back navigation. Never route every hero image to the same generic page. Adding to cart is a separate, clearly labelled action.

Use gentle transitions at roughly five-second intervals, previous/next controls, position indicators and a visible pause control. Pause while hovered, keyboard-focused, interacted with, offscreen or when the app is backgrounded. Honour reduced-motion settings by disabling autoplay and decorative movement. Do not move keyboard focus automatically or make screen readers announce every rotation. Handle zero, one and many products; provide stable loading geometry and graceful failed-image fallbacks. Unpublished/deleted products must not remain purchasable through stale deep links.

Add a bounded featured-product API representation with product ID, shop slug/name, currency, image, price and relevant availability, or extend an existing representation compatibly. Do not treat today's alphabetically selected preview products as curated offers. Product imagery must be maintainable through existing catalog management; use clearly labelled demo assets only for demonstration data.

### 3. Product browsing and cart completeness

Provide responsive product grids, search, category filtering, sorting, availability labels, product details and clear add-to-cart feedback. Product details should display only supported catalog information; add description/image metadata through models, serializers, staff editing and migrations if required. Avoid invented variants or specifications.

Support quantity steppers, direct quantity entry where appropriate, remove, clear with undo/confirmation, subtotal, delivery fee and final total. Enforce positive whole quantities and appropriate bounds. Preserve per-shop carts across navigation and restart without overwriting restored state during hydration. Refresh availability when returning to the app and before checkout; explain changed prices, reduced quantities and removed products instead of silently changing the customer's purchase. Offer recovery from malformed or unavailable local storage.

Use the API's money convention consistently. Calculate authoritative amounts on the server, validate numeric bounds, and keep display calculations consistent across web and mobile. Never accept a client-provided total as authoritative.

### 4. Checkout and order lifecycle

Provide a clear checkout with contact details, pickup/delivery selection, required delivery address, item review and transparent charges. Use labelled fields, inline validation, sensible phone keyboards/autofill, preserved input on error and a clear submit state. Provide a final review before submission and a confirmation with order reference, amount, payment status, fulfilment instructions and tracking access.

Keep payment at pickup/arrangement with the shop as a fully working supported option. Manual MTN/Airtel records must remain clearly manual and unverified. Expose live online payment options only when a real provider is configured. If adding provider integration, include verified server callbacks, idempotency, failure/cancellation and reconciliation; never mark an order paid based solely on a client response. State remaining provider configuration honestly.

Persist each pending checkout attempt's idempotency key and exact payload signature before submission. Reuse it after timeouts, reloads and app restarts until the outcome is reconciled. Avoid storing unnecessary contact data; define expiry and cleanup. After an ambiguous response, resolve/retry the original attempt before allowing an edited replacement that could duplicate an already-created order. The server must return the original result for an identical retry and reject changed payloads under the same key.

Clear the cart only after confirmed order creation, preserve a recoverable tracking reference, and distinguish a successful transaction from a later refresh/storage/navigation failure. Never queue guest orders as offline POS sales. Browsing saved data offline is acceptable, but checkout must clearly require connectivity.

Retain the existing order state machine unless a documented migration is needed. Display accepted/preparing/ready/completed/cancelled states, payment status, expiry and clear recovery actions. Distinguish expired reservations from staff cancellation if the API gains reason metadata. Provide recent-order access on both clients, treating tracking tokens as private bearer credentials. Poll only while relevant, stop on terminal states, and use backoff after failures.

### 5. Cashier POS

Create a focused workspace with searchable/scannable products, category shortcuts, useful product images, available stock and a persistent current-sale panel. Prioritize fast repeated sales, large touch targets, tablet layouts and web keyboard operation. Keep storefront marketing animation out of the transaction workspace.

Support quantity editing/removal, walk-in or selected customers, authorized discounts, cash tendered/change, explicit manual mobile-money reference/confirmation and receipt viewing/reprinting/sharing. Enforce cashier/manager permissions in the API. Keep payment and inventory validation on the server. Preserve successful-sale receipts when subsequent data refresh fails, and prevent duplicate submissions.

Support holding/resuming draft sales scoped to business, branch and cashier. Held drafts do not silently reserve stock; revalidate on resume. Do not allow cart state or drafts to leak between staff accounts.

Preserve mobile cash sales' persist-before-clear behavior, account-scoped SQLite queue, offline authorization window and original transaction IDs. Show connection state, pending uploads, synchronized sales and actionable review failures. Never describe an offline sale as server-confirmed. Sync retries, logout and account changes must not lose or duplicate queued sales. Preserve existing offline inventory-conflict policy and surface conflicts honestly; do not promise exact shared stock while devices are disconnected.

Give authorized staff incoming-order management with valid accept/prepare/ready/complete/cancel actions, customer fulfilment information and payment capture. Completion must create exactly one sale and decrement stock once. Keep browser receipt printing and mobile sharing usable; enable physical printing only through a configured, tested adapter.

### 6. API and contract improvements

Reuse `apps/common/services.py` for shared transaction rules. Preserve tenant isolation, branch authorization, price validation, request fingerprint checks, atomic stock reservations, release on cancellation/expiry and audit records. Test concurrent POS and guest transactions against PostgreSQL locking behavior. Do not replace locking with client-side checks.

Make online fulfilment branch selection explicit and deterministic. Preserve today's first-branch behavior for existing shops during any migration, then allow authorized configuration; do not expose arbitrary cross-branch ordering.

Add bounded server-side search/filtering/pagination for discovery and catalogs as needed and update both clients coherently. Avoid loading every shop's full catalog to display a hero. Minimize unnecessary database work/long locks without breaking expiry cleanup. Do not cache stock claims as guaranteed availability.

Define accurate public DTOs, separate directory summaries from shop details, and update both TypeScript clients plus OpenAPI. Add consistent machine-readable errors with safe field-level messages. Public endpoints must not expose cost prices, internal audit details or customer contact data. Protect private order tokens from logs, analytics and referrer leakage. Preserve existing web session/CSRF handling and mobile secure authentication storage. Apply sensible public endpoint throttling without breaking normal shopping retries.

### 7. Structure, accessibility and performance

Extract reusable product cards, hero/carousel, money display, cart controls, checkout fields and order timeline components. Reduce the large mobile storefront screen module into focused components without unnecessary framework replacement. Use shared design tokens within each client and equivalent contracts across clients.

Support keyboard and screen-reader operation, visible focus, labelled errors, adequate contrast, large touch targets, reduced motion and focus restoration for dialogs. Reserve image dimensions, prioritize only the first hero image, lazy-load secondary images and avoid heavy animation dependencies. Ensure no horizontal page overflow and no checkout buttons hidden behind navigation or the keyboard.

### 8. Verification and delivery

Implement and test complete vertical flows rather than stopping after a visual mockup. Cover:

1. Every hero card opens the correct product/shop; controls, swipe, pause, reduced motion and missing images work.
2. Cart changes survive reload/restart and stay isolated by shop; stale price/stock changes require review.
3. Pickup and delivery totals match the server; invalid quantities, foreign-shop products, tampered prices and missing addresses are rejected.
4. Double submit, timeout-after-success and restart retries produce one order/sale, including reconciliation before an edited retry.
5. Cancellation/expiry releases reservations exactly once; concurrent POS and customer orders follow the documented stock policy; repeated completion creates one sale.
6. Cash tender/change and discount permissions work; order fulfilment is usable by authorized staff; a post-sale refresh failure retains success and receipt.
7. Mobile cash sales persist before UI success, survive logout/restart, sync once, and surface permanent review failures without losing data. Customer offline checkout stays blocked.
8. Empty, loading, no-results, offline, API-error and unavailable-product states offer useful recovery.

Run the existing API checks/tests and migration checks, web/mobile typecheck and lint, web build and Playwright suites, mobile tests and an Android bundle/export check. Add focused interaction coverage for the mobile customer and POS changes. Use PostgreSQL-backed transaction tests for concurrency; SQLite tests alone cannot establish row-lock correctness. Exercise real API-backed checkout/fulfilment in an isolated test database as well as mocked UI tests. Report anything unrun or blocked accurately.

Visually inspect web at approximately 390px, 768px and 1440px, plus mobile phone/tablet layouts in a simulator or device where available. Capture storefront, dynamic hero/product detail, populated cart, checkout validation, confirmation, tracking and POS. Check keyboard-open layouts and reduced motion.

Deliver the code, migrations, updated API documentation, setup notes for optional integrations, screenshots and a concise report of checks and remaining external configuration. Preserve unrelated working-tree changes. Do not claim perfection, verified payments or tested physical printing without evidence.
