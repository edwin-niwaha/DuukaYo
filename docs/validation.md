# Validation and release boundaries

Validation performed locally on Windows on 20 September 2026.

| Check | Result |
| --- | --- |
| PostgreSQL backend suite | 32 passed, including concurrent reservation and concurrent duplicate-upload tests |
| SQLite fast backend suite | Initial 22 passed; PostgreSQL-only concurrency test skipped in that early run |
| Migration consistency | No pending model changes; initial migrations and delivery-fee migration applied |
| Seed repeatability | Development seed ran twice successfully without duplicate businesses/products/stock/orders |
| OpenAPI generation | Validated with `--validate --fail-on-warn`, no schema warnings/errors |
| Django system checks / Python compilation | Passed |
| Mobile TypeScript / ESLint | Passed |
| Durable queue tests | 2 passed using real SQLite with the shared production queue module |
| Expo package compatibility | Passed against SDK 57 bundled versions; later online retry timed out, installed-matrix check passed |
| Android JS/Hermes bundle | Export succeeded, 1,346 modules, approximately 2.9 MB |
| Web TypeScript / ESLint / production build | Passed, including the final loading-feedback changes |
| Celery / Redis integration | Worker received and successfully executed `orders.tasks.expire_reservations` |
| Browser flow | Passed in headless Microsoft Edge: owner login, cash checkout/receipt, guest ordering, responsive layout, fulfilment through completion, and private status refresh |

Backend coverage includes tenant list isolation, role denials, cross-business product/category/customer/branch inputs, revoked memberships, cash change, immutable price/cost snapshots, manual payment verification flags, sale retry hashing, offline price/cost/stock conflicts, discount permissions, controlled stock retries, reservation shortage/cancellation/expiry, order lifecycle, delivery-fee snapshots, single deduction on completion, local-day reporting, public publication filtering, private order access, and CSRF/HttpOnly session cookies.

Queue coverage uses the exact SQL and upload-state module used by Expo through a Node SQLite adapter: reopening the database, transport failure after server acceptance, retry convergence, tenant scope separation, authorization failure retention, needs-review retention, and safe retry eligibility. This is not a substitute for Android process-kill/device tests.

Environment issues resolved during validation: sandbox-helper failures required approved direct local commands; Docker was initially stopped, port 5432 was unavailable, so project PostgreSQL uses 55432. Docker later exited and was restarted. Database connection timeouts are bounded. The API reads only its own `.env`. Git was initialized in the target folder; a safe.directory entry was added for this exact repository because its initial metadata was owned by the sandbox account.

Remaining checks and limitations:

- No Android device/emulator was connected (`adb devices` was empty). No APK/native Gradle build, native SQLite process-kill test, SecureStore device check or physical share-sheet acceptance test was performed.
- No FCM project credentials were supplied. The FCM adapter exists; development notifications log and clients refresh orders. Live delivery is untested.
- No physical printer was named or tested. The interface explicitly reports unconfigured; browser printing and text/native sharing are the available receipt outputs.
- Payments are cash or unverified manual MTN/Airtel records. Provider request/verification is an unconfigured adapter, with no real money processed.
- Three moderate npm findings remain in the Expo Router â†’ query-string â†’ decode-uri-component chain. See dependency-notes.md. The unrelated xcode/uuid chain was fixed with a scoped compatible override. Web audit reported zero findings when installed.
- Image/logo URLs are supported; uploads, staff email invitations, password recovery, refunds/returns and a review-case resolution workflow are deferred. Existing-sale records remain immutable; owners reconcile inventory via audited adjustments.
- Pilot currency presentation is UGX whole units. Future denominations and currency changes require additional work; a business's historical ledger currency cannot be changed through the API.
- No public deployment, cloud resource purchase, payment onboarding, tax-authority certification or production-readiness claim is made.

## Browser evidence

The final scenario passed in 25.5 seconds (31.3 seconds including runner startup). A 390px storefront was checked for horizontal overflow. Dashboard and narrow-screen storefront captures were visually reviewed.

- [Dashboard](screenshots/run-1789853805081/dashboard.png)
- [Checkout and receipt](screenshots/run-1789853805081/checkout.png)
- [Mobile-width storefront](screenshots/run-1789853805081/storefront-mobile.png)
- [Login](screenshots/run-1789853805081/login.png)

Local demo services were left running: Next.js on localhost:3000, Django on 127.0.0.1:8000, PostgreSQL on 127.0.0.1:55432, Redis on 127.0.0.1:6379, a Celery worker, and Celery beat for automatic expiry scheduling. The worker task was exercised successfully. Stop PostgreSQL/Redis with `docker compose -f infra/compose.yaml stop` when finished.
