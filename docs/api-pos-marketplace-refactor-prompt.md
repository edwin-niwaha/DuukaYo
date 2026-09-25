# DuukaYo API assessment and implementation prompt

Prepared 21 September 2026 from the current repository. The API folder is `duukayo-api`. This is an assessment and a prompt for subsequent implementation; no application code was changed for this assessment. Findings below come from source inspection, not a new runtime or load-test run.

## Assessment across all 11 apps

| App | Existing foundation | Required improvements |
| --- | --- | --- |
| `accounts` | Django users, Google identity, profile updates, password changes/recovery, JWT refresh revocation | Consistent password handling and policy; authentication throttling; explicit session/device lifecycle; race-safe registration |
| `businesses` | Businesses, branches, owner/manager/cashier memberships, shop publication and fulfilment branch | Explicit branch permission matrix, staff reassignment/deactivation, branch lifecycle, cross-tenant relationship validation |
| `catalog` | Categories, products, SKU, barcode, price/cost, publication, image uploads | Variants and attributes, descriptions and galleries, searchable paginated catalogs, asset ownership/lifecycle, safe archival |
| `customers` | Merchant-scoped customer records and purchase history | Consistent contact validation, customer accounts and addresses, privacy boundaries, controlled customer-history access |
| `inventory` | Branch stock, reservations, movement history | Reservation ledger, properly scoped operation retries, transfers/counts/receipts, offline conflict resolution and reconciliation |
| `sales` | Atomic checkout, sale-line snapshots, receipts, cash/manual payments, offline review reasons | Registers/shifts, cash movements and balancing, controlled discounts, returns/refunds, split tenders and auditable corrections |
| `orders` | Guest orders, capability tokens, reservation expiry, fulfilment transitions and conversion into sales | Typed order lines, durable carts and quotes, explicit payment/fulfilment states, partial fulfilment, returns and multi-shop checkout |
| `payments` | One payment per sale; provider interface with an unconfigured implementation | Payment attempts, allocations, verified callbacks, refunds, reconciliation and settlements; real gateway integration remains unimplemented |
| `notifications` | Device registration, Celery tasks, optional Firebase delivery | Durable outbox, retries, deduplication, invalid-token handling and branch-appropriate recipients |
| `reports` | Daily sales/profit, low stock and device sync summary | Explicit branch filters/permissions, database aggregation, refunds/taxes/tender reconciliation and larger-data performance |
| `common` | Transactions, business locks, audit records, error handling and shared services | Move domain workflows to their owning apps; retain genuinely shared infrastructure; structured idempotency and observability |

### Fix these before extending the feature set

1. **Stock operation retry scope:** `apps/common/services.py::change_stock` finds previous operations by business and client UUID, while its payload hash excludes the acting membership and branch. Reusing the same key and payload in another branch can return success without applying that branch's movement. An audit row is also an inadequate long-term substitute for a constrained idempotency record.
2. **Manual payment validation:** `SaleInput` and `TransitionInput` allow missing/blank references; checkout and order completion accept them. Enforce the manual-payment evidence policy on the API, not just in clients, while keeping manual entries explicitly unverified.
3. **Conflicting completion retries:** `transition_order` immediately returns when the requested status is already current. A repeated completion with a changed payment method/reference is not checked for consistency.
4. **Password inconsistency:** register/login/staff serializers use default whitespace trimming, whereas password change/recovery preserve whitespace. This can prevent session login with an otherwise valid password set through those flows. Minimum-length policy also differs between explicit registration fields and the default Django validator used elsewhere.
5. **Inventory conflict policy:** offline cash sales deliberately permit stock conflicts and record review reasons. Order completion subsequently consumes its reserved items without a fresh conflict check. Define how the merchant resolves this situation before tightening stock constraints or changing fulfilment behavior. POS checkout also does not itself expire pending reservations before availability checks.
6. **Uniqueness races:** registration and staff creation use availability prechecks before insertion. Add database-backed conflict handling rather than relying on those checks. Review device-token registration similarly.
7. **Reliability and growth:** notification enqueue failures are logged without durable recovery; several merchant lists are unpaginated or silently capped at 300/500 records; public shop catalogs load all products. Central services also repeatedly fetch products and stocks per line.

Branch-wide reporting and customer-history visibility require an explicit product permission policy; the current business-wide queries are not automatically proof of a security defect. Likewise, offline submitted prices/costs require an explicit audit and reconciliation policy, not indiscriminate rejection of already completed cash transactions.

## Ready-to-use implementation prompt

You are improving the existing DuukaYo repository at `D:\PERPETUAL PROJECTS\DuukaYo`. Analyze and refactor every domain app in `duukayo-api`, then implement a reliable retail POS and multi-vendor online storefront backend. Deliver complete, tested workflows inspired by large marketplaces, without claiming Amazon-scale infrastructure or copying branding. Integrate API changes with the existing `duukayo-web` and `duukayo-mobile` clients where required.

### Working rules and baseline

- Read applicable repository instructions and inspect the current code, migrations, tests, API schema and clients before editing. Preserve all existing uncommitted work and merchant data. Do not replace the project with a scaffold or perform an unrelated framework rewrite.
- Treat the assessment above as starting evidence; verify findings against the current checkout. Record confirmed defects, product decisions, implementation phases and acceptance criteria in a concise plan before implementation, then proceed through the phases.
- Use the repository's actual `.venv\Scripts\python.exe` for API checks and tests. Verify installed dependencies, including Pillow. Do not hide environment problems by testing only with an unrelated Python runtime.
- Establish the current test baseline. Use an isolated PostgreSQL test database for transactions and concurrency; SQLite alone cannot establish production locking correctness. Never reset the working database to make a test pass.
- Preserve guest order retry recovery, tenant scoping, publication gates, immutable sale snapshots, explicit fulfilment branches, account recovery protections and durable offline cash-sale recovery.
- Make no live payment, deployment or fabricated merchant-data changes. Jobell Inc's intended owner is `jobellinc@gmail.com`; associate ownership only with a verified matching account. Keep unverified products/ownership in draft and never invent costs, stock or ownership.

### Phase 1: correctness, permissions and consistent validation

1. Reproduce and fix the stock idempotency scope defect, inconsistent transition retries, manual-payment reference validation, password whitespace/policy differences and uniqueness races identified above. Add focused regression tests before or alongside each fix.
2. Define reusable tenant and branch authorization policies for owners, managers and cashiers. Apply them to reads, writes, reports, customer histories, stock, receipts, devices and notifications. Validate every related object against the business and permitted branch; never trust submitted foreign keys or client-calculated totals.
3. Implement a constrained idempotency record with operation scope, canonical request fingerprint, actor/branch context, status and original result. Identical authorized retries must return the original outcome; incompatible reuse must produce a stable conflict response. Roll back financial and inventory changes together on failure.
4. Normalize identifiers and contact fields without altering passwords. Use consistent field lengths, quantity limits, monetary limits, timezone-aware timestamps and machine-readable field errors. Keep money as integer amounts with explicit currency semantics and documented rounding. Do not silently reinterpret existing stored prices during a currency-unit migration.
5. Make inventory availability and reservation expiry consistent across POS, storefront checkout and background workers. Preserve evidence of offline cash sales; flag and resolve price/cost/stock conflicts through an authorized reconciliation workflow. Do not impose a blanket nonnegative-stock constraint that destroys the current offline recovery model.
6. Preserve CSRF/session protections, JWT rotation and password-change revocation, recovery-token single use and non-enumerating recovery responses. Add appropriate authentication throttles and race-safe registration. Keep secrets, guest access tokens and sensitive customer data out of logs.

### Phase 2: maintainable domain architecture

- Keep a modular Django monolith. Move business workflows from `apps/common/services.py` into the relevant inventory, sales, orders and payments service modules. Split the central serializers/views by domain while keeping views thin and shared infrastructure small.
- Define explicit state transitions and domain errors. Enforce durable invariants with suitable database constraints and transaction boundaries; validate cross-table business ownership in service paths as well as API inputs.
- Introduce typed order lines and reservation records with safe data migrations from existing JSON snapshots. Preserve historical price, cost, discount, currency, product name and delivery details even when products change or are archived.
- Maintain `/api/v1` compatibility where practical. For necessary response changes, provide a documented adapter or versioned contract and update both clients together. Do not break clients by replacing list responses with pagination envelopes without integration work.
- Retain business-level locks until concurrency tests support a finer locking strategy. When introducing row locks, document deterministic lock order and avoid network calls inside database transactions.

### Phase 3: complete retail POS and inventory

- Add register and cashier shift opening/closing, opening float, authorized cash-in/cash-out, expected versus counted cash and discrepancy reasons.
- Support product/barcode search, customer assignment, held-sale recovery, configurable authorized discounts, explicit tax configuration, receipts and payment allocations including split tenders. Never invent tax rates or fiscal certification.
- Keep completed sales immutable. Implement authorized void/reversal, item-level returns, partial/full refunds and linked inventory movements. Prevent returning more than was sold or refunding more than was successfully collected. Model whether returned goods are restockable.
- Add receiving, supplier/purchase references, branch transfers with dispatch/receipt states, stock counts and auditable adjustments. Prevent duplicate receipts or transfers and record who performed each operation.
- Keep offline mode limited to supported cash workflows. Persist queued operations before showing completion, retry with stable identifiers and expose actionable reconciliation status without discarding sales or duplicating receipts.

### Phase 4: complete storefront and marketplace checkout

- Extend catalogs with descriptions, product variants/attributes, galleries and searchable/filterable paginated listings. Keep stock attached to sellable SKUs. Validate media ownership, file content/limits and orphan cleanup. Keep inactive/unpublished listings private.
- Implement server-backed carts, guest/customer cart recovery and merge, customer addresses, saved customer orders and order history with strict ownership checks. Preserve secure guest tracking.
- Add checkout quotes that calculate current prices, discounts, stock, taxes and delivery charges on the server. Define quote expiry and require reconfirmation of changed totals; reserve inventory at checkout rather than indefinitely when adding items to a cart.
- Support a marketplace parent checkout with merchant-specific child orders, fulfilment branches, charges and payment allocations. Define the customer's behavior when one shop cannot fulfil. Acquire locks in a deterministic order, prevent overselling and do not hold a database transaction open during provider calls.
- Separate payment status from order and delivery status. Support pickup/delivery, partial fulfilment, cancellation, expired reservations, shipment tracking and return/refund requests. Track fulfillment at line level and reconcile parent totals with child totals.
- Ensure the existing dynamic product feeds continue serving clickable web/mobile slides. Expose accurate availability and prices without leaking private costs or customer details.

### Phase 5: payments and reliable background processing

- Replace the one-payment-per-sale limitation with payment attempts, allocations, refunds and an auditable event history using backward-compatible migration paths.
- Keep cash and manual MTN/Airtel recording fully usable and clearly distinct from provider-verified payments. Require appropriate references for manual entries and handle duplicate-reference policy explicitly per provider/merchant.
- Implement configured provider adapters against their official contracts, authenticated callback verification, amount/currency/merchant matching, idempotent event processing, retry/reconciliation and explicit pending/failed/confirmed/refunded states. Browser redirects alone must never mark a payment successful.
- Cover duplicate, delayed and out-of-order events, callbacks after reservation expiry, ambiguous provider timeouts and partial refund failures. Real credentials or merchant contracts may be external blockers: finish local workflows and deterministic adapter tests, document the remaining sandbox verification, and leave unavailable methods explicitly disabled.
- Add a transactional outbox for notifications and other asynchronous side effects, bounded retries/backoff, deduplication and observable failure handling. Scope recipients correctly, remove invalid device tokens and prevent one failed recipient from blocking others.
- Make reservation expiration operate in bounded batches over due records. Provide safe task retry behavior and visibility into worker/scheduler health.

### Phase 6: reporting, performance and client reliability

- Add stable pagination, search and validated filters to merchant lists and public catalogs. Eliminate repeated per-line/per-result queries, add justified indexes and measure representative query counts before introducing caches.
- Provide authorized branch/business sales, tax, refund, profit, tender, cash-shift and inventory reports. Base financial reporting on reconciled events and snapshots, with explicit timezone/date semantics. Identify estimates and unresolved offline conflicts.
- Maintain consistent JSON errors with stable codes, field details and safe request identifiers. In web/mobile clients distinguish intentional request cancellation from network failure; do not show “Fetch request has been cancelled” for expected navigation. Provide useful retry states for genuine failures and reuse operation identifiers after uncertain checkout responses.
- Add structured operational logging and health/readiness signals for database, task queue, reservation expiry, outbox backlog and configured payment integrations without exposing secrets.

### Acceptance tests and delivery requirements

Demonstrate these behaviors with meaningful tests:

- A cashier cannot read or mutate another tenant's records, and branch permissions match the documented policy.
- Identical stock/sale/order/payment retries have one effect; changed payloads and cross-branch key misuse cannot be silently acknowledged.
- Concurrent POS and storefront requests for the final available item behave according to the documented reservation policy; expiry, cancellation and retries release inventory exactly once.
- An offline stock conflict remains durably recorded and cannot silently turn an unavailable online order into fulfilled stock.
- Manual payments cannot bypass API validation; failed or forged callbacks cannot mark orders paid; duplicate callbacks cannot double-charge, double-refund or double-consume inventory.
- Multi-shop checkout and partial failure preserve consistent totals, reservations and payment allocations.
- Returns/refunds respect sold/paid limits; cash drawer expected totals reconcile with shifts and authorized cash movements.
- Passwords containing whitespace work consistently across registration, login, changes and recovery; old credentials/tokens are invalidated as designed.
- Product archival, price changes and migrations preserve receipts, existing orders, queued offline sales and guest retry recovery.
- Queue outages and invalid push tokens do not lose committed orders or permanently lose their pending notification events.
- Catalog/list endpoints remain bounded and stable as data grows; API response changes are verified in both web and mobile clients.

Run the appropriate API suite, PostgreSQL concurrency tests, migration checks, schema validation and affected web/mobile type, lint, build and integration checks. Record actual commands and outcomes; distinguish verified behavior from external integration or physical-device checks still pending.

Deliver working implementations, migrations/backfills, an updated OpenAPI schema, API/client integration changes, operational setup documentation and a concise report of what changed, why and how it was verified. Do not describe placeholders, disabled providers or untested production integrations as complete. Implement in reviewable phases and make any remaining external dependency explicit.
