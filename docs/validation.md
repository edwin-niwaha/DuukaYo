# Validation and feedback

All application-owned Django models inherit `ValidatedModel`. Ordinary saves and
bulk creation validate required text, field lengths/types, URLs, choices, foreign
keys, phone digit counts, integer ranges and applicable domain relationships.
Database constraints continue to enforce uniqueness under concurrent writes.

Stock quantity may be negative: this is needed to reconcile offline sales.
Unknown product cost is allowed only for inactive, unpublished drafts. Zero prices
and costs remain allowed. Phone numbers accept local or international formatting
with 7–15 actual digits; punctuation alone is rejected.

QuerySet.update(), bulk_update(), raw SQL and historical migration models bypass
model hooks. Keep using the command services for atomic updates; their validation,
authorization, transactions and database constraints remain necessary. Validation
is not a substitute for access control. Existing rows are not rewritten.

Both clients validate request bodies before JSON serialization (including NaN,
Infinity, fractional/negative amounts, whitespace-only required names, phone,
email, URL and delivery-address checks). The API remains authoritative for required
fields, domain rules and server state. Password whitespace is preserved.

`useFeedback` preserves inline messages and publishes a toast. Toasts provide
error, success and informational styles, screen-reader announcements, dismissal,
a maximum of three visible notifications and duplicate suppression. Errors remain
until dismissed; web informational toasts pause on hover/focus. Native toast cards
respect safe-area insets. Browser constraint errors focus the invalid field and
mark it with aria-invalid. No notification dependency was added.

Verification: Django model/API regressions, shared client validation and mobile
screen interaction tests, TypeScript and ESLint in both clients, and Playwright
validation/focus/dismissal checks at 1440px and 390px.
