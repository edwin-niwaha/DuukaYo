# Web platform administration

Sign in at `/dashboard` with a platform administrator account. Administrators land on the platform overview without creating a shop or acquiring a shop membership. An administrator who also belongs to a shop can use **My shop workspace**, then return through **Platform administration**. The marketplace remains available from either workspace.

## Available workflows

The **Users and access** directory includes avatars, contact details, role summaries and active/inactive badges. Use **Add user** or a row's pencil icon to edit names, email, phone, job title, location and profile picture. Upload JPEG, PNG or WebP (up to 8 MB); uploads are validated and re-encoded without metadata. Account creation and selected shop-role assignments save atomically. An account may be a customer and a member of several shops, with one role and branch per shop. The editor lists existing shop roles and supports adding or changing them. Only superusers can grant platform administration or edit privileged accounts.

The trash icon requires the username before deleting an account. This is a retained record: sign-in and memberships are disabled, the user disappears from the directory, and their username remains reserved. Transaction and audit history remain. An administrator cannot delete themselves or remove a shop's last active owner. Deactivating an account has the same last-owner protection. In each shop's **Access** tab, the row trash icon removes only that shop membership; the account and its other shop roles remain. Apply `accounts.0002_userprofile` before starting the updated API.

In **Shops → Manage → Details**, use **Hide shop** to remove the storefront and stop new customer orders while staff continue working. **Show shop** publishes it again (remove suspension first if applicable).

**Delete shop** requires typing the shop URL name. Complete or cancel outstanding orders first. Deletion removes the shop from the active directory and membership selector, disables shop operations and preserves orders, sales, stock and audit records. It is a soft deletion for record keeping; the URL remains reserved and the portal cannot restore it. Account access to other shops and customer shopping remain unchanged. Apply the `businesses.0005` migration before using these controls.

- **Overview:** platform account/shop/pending-order counts and date-filtered sales, refunds and net sales. Financial dates are UTC and each currency is reported separately.
- **Shops:** searchable, paginated directory; create a draft shop for an existing account; edit shop identity, contact details, logo, description, fulfilment branch, delivery and publication; suspend or restore a shop; create and rename branches.
- **Shop access:** assign an existing account as owner, manager or cashier; select its branch; change roles or deactivate that shop membership. Assign a replacement owner before demoting or disabling the last active owner.
- **Catalog:** create/edit products and variants, prices, costs, images and galleries; publish, archive or delete unused products; create/rename/delete unused categories. Shop ownership and branch relationships are validated on the server.
- **Stock:** select a product and record an opening balance, receipt or adjustment with a reason. Movements retain the ledger and reject reductions that consume reservations.
- **Orders:** review customer details and items, then use the existing acceptance, preparation, readiness, completion and cancellation workflow.
- **Sales:** inspect immutable receipts, tender allocations and review flags; record item returns and manually handled refunds with optional restocking. Refund limits and inventory effects are enforced by the same service used by the POS. This does not transfer money through a provider.
- **Users:** manage profiles, assign roles and deactivate self-registered accounts. Admin account creation is disabled. Passwords, usernames and recovery email addresses cannot be changed through the platform API. Superusers can grant or revoke the explicit platform-administration permission. Delegated platform administrators cannot edit privileged accounts or grant administrative access. Self-removal and removal of the last active superuser are rejected.
- **Settings:** platform name, support email, public announcement, acceptance of new orders and self-service shop registration. These settings are persisted and applied by the API. Pausing new orders preserves existing order tracking and command recovery.
- **Audit:** searchable, paginated, read-only history with actor, shop, action, reference and timestamp. Shop/account/settings updates include before/after details. Passwords are never included.

## Authorization and consistency

Platform endpoints live under `/api/v1/platform/`. They require an active Django staff account with `common.manage_platform`; active superusers have this permission automatically. A shop's owner/manager role alone grants no platform access. Django staff status alone grants no platform-API access either.

Platform operations create an in-memory actor/business/branch context only after that permission check. They do not create shop memberships or bypass authorization on ordinary tenant endpoints. Every branch in a platform URL must belong to the selected business. Sensitive operations use existing domain services, database locks, validation and idempotency records.

Suspension preserves shop records and the publication setting, while blocking ordinary staff API access and hiding the shop from public discovery. New checkout is rejected. Administrators retain access for reconciliation. Previously issued private order tracking links remain usable. Suspension does not erase an offline device's local data; disconnected devices cannot learn of suspension until reconnecting.

Stock adjustments, order updates and refund requests are saved in the browser before transmission, scoped to administrator/shop/branch. An uncertain response leaves the saved request available for retry. Returning to any operations tab for that branch offers recovery. Catalog records with transaction or stock references are archived rather than deleted; shop and account history is preserved by suspension/deactivation.

## Installation and local activation

Run `python manage.py migrate` before restarting the API. The additive migrations are `businesses.0004_business_suspended` and `common.0003_alter_audit_business_platformsettings`. Existing shops start unsuspended. Platform settings default to accepting new orders and allowing shop registration.

Rebuild/restart the web app as appropriate. No password reset or new membership is needed for an existing active superuser. Django Admin remains available for maintenance, with its browser URL configured by `PUBLIC_ADMIN_URL`.

## Validation

Backend regression suite:

```text
python manage.py test apps.common apps.accounts apps.sales apps.orders apps.catalog apps.notifications config --settings=config.settings.test
```

`apps.common.test_platform` covers explicit permissions, tenant separation, branch validation, owner protection, user privilege boundaries, publication/suspension, product CRUD, stock retries, order transitions, refunds, settings and audit access. Run against a separate PostgreSQL test database to exercise row-lock concurrency tests too.

Web checks: `npm run typecheck`, `npm run lint`, `npm run build`, and Playwright `tests/admin-entry.spec.ts`.

`tests/platform-integration.spec.ts` uses real API requests and the rendered portal. It is skipped unless `RUN_PLATFORM_E2E=1`. Use the isolated `config.settings.platform_browser` SQLite database and API port 8015, with a web server on `http://localhost:3108` configured with `API_URL=http://127.0.0.1:8015` and `WEB_ORIGIN=http://localhost:3108`. Set `PW_BASE_URL=http://localhost:3108`. Create its test-only superuser `portal-e2e-admin` with password `PortalTestOnly!2026`; never create this fixture in an application database. The test creates uniquely named fixture users and shops, then exercises catalog, stock, orders, refund recording, suspension, settings, audit and responsive layouts.
