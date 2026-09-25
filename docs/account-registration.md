# Account registration and administration

Users register at `/signup` on the web or Create account in the mobile Accounts
screen. Both call `POST /api/v1/auth/accounts/` with username, email, password and
confirm_password. Signup is rate limited, applies password validation, creates no
session, and creates no shop, membership or platform permissions. New users sign
in afterwards. The existing self-service shop registration and Google sign-in
remain available.

Administrators copy a registration link, then locate the registered username in
Users to edit names, photo, contact phone, job title and location, assign shop roles
or deactivate access. Username and recovery email are read-only. Administrators
cannot set or reset another person's password through the platform API. Use the
existing self-service password recovery flow. Platform role grants still require
a superuser, and last-owner/self-removal protections remain in place.

`POST /api/v1/platform/users/` now returns 405. Platform user PATCH rejects
password, username, email and direct Django privilege fields. Shop staff POST only
attaches active existing accounts; it rejects credentials or `existing_account:
false`. This is an intentional breaking change for older administrative clients.
Deployment/maintenance operators retain Django's emergency administration tools.

Registration email is not marked verified by this change. Do not treat an entered
email as proof of identity; grant shop access to a known registered username.
Google continues to require a verified provider email. No invitation or other email
is sent by copying the signup link.

Principles: OWASP Authorization Cheat Sheet (least privilege) and Forgot Password
Cheat Sheet (account-holder recovery).
