# Perpetual POS architecture and pilot scope

One repository, three deployable applications. Django is the sole authority for tenancy, permissions, money, stock, orders and reports. PostgreSQL is the business database; Redis brokers Celery reservation expiry and notifications. Next.js provides a same-origin proxy to Django session authentication (HttpOnly session cookie, CSRF token and origin validation); mobile uses short-lived JWTs and SecureStore. No Firestore or real payment processing.

All protected business operations require an active membership. Owner manages staff/settings; owner and manager manage catalog/stock and discounts; cashier checks out and reads operational data. Every related-object lookup is scoped. Pilot registration creates one branch; branch references persist throughout sales, inventory and orders.

Money uses integer minor units (UGX default has zero decimal places). All sale lines snapshot price, cost, currency and discount. PostgreSQL business-row locks serialize stock/reservation operations in a business; this intentionally simple pilot lock can later become ordered stock-row locks. Completed sales are immutable. Idempotency keys are scoped to business, with canonical payload hashes detecting accidental key reuse.

Offline cash sales are durable SQLite records scoped to user/business/branch. The server retains the submitted price snapshot and marks stale-price or stock-shortage uploads for review, preserving money actually collected and allowing negative physical stock. Offline discounts are prohibited. Online sales reject insufficient available stock and stale prices. Reservations reduce availability, completion deducts physical stock once, cancellation/expiry releases reservations. Disconnected devices cannot guarantee availability: storefront orders are requests until accepted and shops use a configurable safety buffer.

Guest order access uses random capability tokens; public endpoints expose explicit public fields only. Order creation is idempotent and snapshots delivery fees. Payment state is separate from fulfilment; manual MTN/Airtel entries are always unverified. FCM is an optional server-only adapter, with a log fallback. Hardware printing is an interface, not a tested capability.

Implementation sequence: domain/migrations and transactional services; authenticated and public API; seed/tests; dashboard/storefront; offline mobile; validation and operational documentation.

Reviewed reference patterns: Pendeza mobile thin Expo routes, feature folders, auth provider and centralized configuration; Pendeza web versioned DRF routes and Celery bootstrap. Implementations here are new and contain no reference credentials, branding or data.
