# Mobile Account

The Profile tab is now Account. Old profile links redirect to Account. The layout uses the section hierarchy in PendezaConnect as a reference, with DuukaYo colours, short summaries, accessible controls, honest permission status and no artificial security scores.

## Features

- Profile: edit first and last name, save or discard changes. Save is disabled until values change. Failed saves keep edits available for retry. Sign-in username and recovery email are deliberately read-only; changes to account identity require a separate verified email-change workflow.
- Account & security: current/new/confirm password fields with show/hide controls, server password validation, and email recovery for guests and signed-in users, including Google accounts without a local password.
- Recovery: request a code by email and paste it into the app. Codes expire after one hour and are single use. Unknown/inactive/ambiguous email addresses receive the same response. Requests are rate limited by client and email. No real emails are sent by tests.
- App permissions: actual notification permission state, an explicit enable action, and links to device settings. State refreshes after returning to the app. No new contacts, camera, photo-library or location permissions are requested. Staff connect push delivery in Business tools.
- App & support: order help, device-data explanation, version, optional real support mailbox and a share sheet containing only app/device details. Sharing requires a user action.
- Current session: signed-in identity, device and last online verification, plus confirmed logout. Guest carts/order links and durable pending POS sales remain on the device. Logout does not erase offline sales.
- Guest sign-in is available inside Account; Password recovery is also linked from the POS sign-in screen.

## API

`GET auth/me/` now returns first_name, last_name, email and has_password alongside the existing membership data.

- `POST auth/profile/`: first_name, last_name (authenticated).
- `POST auth/password/change/`: current_password, new_password, confirm_password (authenticated).
- `POST auth/password/recovery/`: email (public, throttled).
- `POST auth/password/reset/`: code, new_password, confirm_password (public, throttled).

Password changes/reset invalidate previous JWT access and refresh tokens through password-version checks; Django browser sessions also become invalid. Password writes use row locks. JWT authentication runs first so invalid access tokens return HTTP 401 and the mobile refresh flow can run. Existing tokens created before this update lack the password-version claim and require one fresh sign-in. No database migration is required.

Offline devices cannot learn about a remote password change until reconnecting; the existing bounded offline POS lease still applies. Pending sales are preserved and can be retried by their original cashier after signing in.

## Configuration and verification

For real recovery email delivery configure the API EMAIL_BACKEND as django.core.mail.backends.smtp.EmailBackend and provide EMAIL_HOST, EMAIL_PORT, EMAIL_HOST_USER, EMAIL_HOST_PASSWORD, DEFAULT_FROM_EMAIL and the appropriate TLS/SSL options. The development console backend prints the message locally and does not deliver email. Configure a shared Django cache for consistent throttling across multiple server workers.

Optionally set EXPO_PUBLIC_SUPPORT_EMAIL to the real support mailbox before building the mobile app. The contact action is hidden when no valid mailbox is configured. No support address is invented.

Verified: 82 API tests on PostgreSQL, 25 mobile/unit interaction tests, TypeScript, lint, OpenAPI schema validation and an Android bundle export. Native device screenshots, OS settings interaction and live SMTP delivery still need device/environment verification.
