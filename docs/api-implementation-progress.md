# DuukaYo API implementation status

Updated 21 September 2026. This implements a substantial first release of the approved roadmap, not every capability in the full marketplace prompt. Existing work was preserved. No production deployment or real payment was made.

## Implemented

- **Accounts:** preserve password whitespace consistently, align the minimum password policy, throttle credential requests, catch registration/staff uniqueness conflicts without exposing database errors.
- **Businesses:** enforce membership branch ownership; owners can update staff role, active status and branch. Owner transfers remain a separate workflow. Managers receive branch-scoped reports; customer histories are branch-scoped.
- **Catalog:** descriptions, galleries, variant grouping and attributes with bounded validation; optional paginated/searchable merchant listings; batched product/stock lookup during checkout. Public detail responses include descriptions and attributes without costs.
- **Customers:** private account address endpoints with validation and ownership checks.
- **Inventory:** branch/actor-aware command replay with original results; same key cannot silently apply in another branch. Dispatch and receipt of branch transfers are separate, audited operations. Positive partial receipts can reconcile an offline shortage incrementally.
- **Sales/POS:** register creation, cashier shift opening/closing, cash in/out, expected versus counted cash, required discrepancy explanations, split tenders, item returns and manually recorded refunds with optional restocking. Sale lines and completed receipts remain immutable. Refunds cannot exceed remaining sold quantities or the sale total.
- **Orders:** typed order-line snapshots and reservation ledger with historical backfill; expired reservations released before POS availability checks; conflicting completion retries rejected; offline stock conflicts block online completion. Server carts, private guest capabilities, account cart merging, five-minute quotes and atomic multi-shop checkout with deterministic business-lock order and per-shop child orders.
- **Payments:** payment-allocation ledger and historical backfill. Cash and manual MTN/Airtel remain supported. Manual references are required and remain unverified; split payment parts must reconcile exactly. No online gateway is falsely presented as working.
- **Notifications:** transactional outbox, scheduled retries with backoff, delivery leases, per-device progress, invalid-token cleanup and branch-scoped recipients. Delivery is at least once; a process failure immediately after a provider accepts a push can still result in a repeated push.
- **Reports:** database aggregation, refund-adjusted sales/profit/tender totals, explicit owner/business versus manager/branch scope, bounded low-stock/device details and branch IDs.
- **Shared architecture:** domain services replace the former central workflow file; compatibility imports retain existing callers. Additive migrations and an updated OpenAPI contract are included.

## Web and mobile

- Web dashboard **Operations**: register/drawer management, item returns/refund recording and branch transfers. Cashiers see drawer tools; managers/owners also see returns and transfers.
- Web POS: cash plus mobile-money split tender, with allocations on downloadable receipts.
- Mobile Account → **Register & cash drawer**: register opening, closing, cash movements and recoverable command attempts.
- Web saved shopping → **Checkout all carts**, and mobile Cart → **Checkout all carts**: review server prices and per-shop totals, then place orders together. Existing individual-shop checkout stays available.
- Both new checkout flows retain the same request after an uncertain network response. Authentication failures do not discard pending commands. Carts edited after an order attempt are not blindly deleted during recovery.
- Mobile password guidance now matches the API's ten-character minimum.

## Database activation

Before deployment, back up the target database and inspect its current migration plan with `python manage.py migrate --plan` from `duukayo-api`. Pending migrations depend on the target database; regenerate the plan instead of relying on a saved snapshot. Apply the reviewed migrations with `python manage.py migrate --noinput`, then run `python manage.py check` and verify storefront access and ledger reconciliation. Do not seed demo data into a database containing merchant data. Preserve operational records when planning a rollback.

Celery worker and beat must run for reservation expiry and durable notification retries. `PUSH_BACKEND=log` records development notifications; actual Firebase delivery requires working Firebase configuration. Restart long-lived workers after deployment.

## Compatibility and operating rules

- Existing integer money/currency values are unchanged. No tax rates, supplier stock or Jobell ownership/cost data were fabricated.
- Legacy merchant list response shapes remain compatible. `?page=1&page_size=100` opts into paginated product/category/customer/sale/order responses; sales/orders retain their legacy 300-row response when pagination is not requested. Large-catalog clients still need a complete pagination migration.
- The existing one-payment receipt remains as a compatibility summary; `allocations` provides the tender breakdown.
- Register attachment is optional for old clients. Online sales attach to the cashier's current shift. Offline uploads are not retrospectively attached to a current or already balanced shift; they remain separately reviewable.
- A return records a merchant-confirmed cash or manual mobile-money refund; it does not call a payment provider. Delivery-fee refunds and automated full-sale voids are not included in this release.
- Marketplace checkout is pay-on-fulfilment, one currency per checkout, and all-or-nothing stock reservation across shops. New quotes are required after cart/price/delivery changes. Existing successful attempts remain recoverable after quote expiry.
- Account-owned carts, merge, addresses and order history have API endpoints. The current mobile combined-checkout UI uses guest capabilities, so full cross-device account shopping UI remains to be integrated.

## Verification

- Actual repository `.venv\Scripts\python.exe`, not a fallback runtime.
- Initial suite: 90 tests in SQLite, three PostgreSQL concurrency checks skipped.
- Current API suite: **113 tests passed on PostgreSQL**, using the dedicated `test_duukayo_refactor_20260921` database. Test data was created/destroyed there, not in `duukayo_db`. Includes mixed POS/storefront last-stock contention, historical backfill, retry scope, reservations, multi-shop rollback, returns, split tenders, transfer receipt, privacy and outbox failures.
- OpenAPI generation/validation: zero warnings and zero errors after resolving serializer naming collisions.
- Web and mobile TypeScript and lint checks passed.
- Final web optimized production build passed, including compilation, TypeScript and static page generation.
- Mobile tests: **28 passed**, including remount/retry recovery for combined checkout. Android Hermes export passed (1,395 modules).
- **Eight distinct targeted browser scenarios passed** across the final relevant runs: combined-checkout recovery, drawer-command recovery, split-tender submission, held-sale recovery, product dialog/carousel behavior, individual checkout recovery, price revalidation and autoplay controls. Two test locator/timing assumptions were corrected and the affected tests rerun successfully.
- Browser tests use isolated page contexts and mocked API transport for UI/retry assertions; backend integrity is tested separately against PostgreSQL. Browser tests regenerate screenshots under the Git-ignored `docs/screenshots` directory.
- No physical Android/iOS device, real receipt printer, real payment provider, SMTP or Firebase delivery has been certified by this work.

## Still required from the full prompt

These items are not complete and must not be marketed as shipped:

1. Provider-specific online payments, signed webhooks, external refund reconciliation, payment-attempt state machines, merchant settlement and sandbox/live verification. Provider choice, merchant configuration and credentials are external dependencies.
2. Line-level partial fulfilment/shipping, customer return requests, shipment tracking, delivery-fee refunds and a complete void/reversal workflow.
3. Purchase orders/supplier receiving workflows, dedicated physical-stock-count sessions, configurable tax snapshots and fiscal requirements.
4. Full account-shopping UI, catalog/gallery administration UI, managed media asset lifecycle, server-backed held POS drafts and full pagination in existing clients.
5. Broader load testing, operational alerting, migration execution on the application database and post-migration integration verification.

The next step is to approve and safely activate this tested database release, verify the existing app against it, then continue these remaining roadmap phases without conflating them with the features already implemented.
