# Perpetual POS

A multi-tenant retail POS and optional storefront for Perpetual Labs. One repository, three independently deployable projects. Uganda pilot: UGX integer amounts and Africa/Kampala display time. No public deployment or real payment processing is included.

- `perpetual-pos-api/`: Django 5.2 LTS, DRF, PostgreSQL, JWT/session auth, Celery, Redis, optional FCM.
- `perpetual-pos-mobile/`: Expo SDK 57, React Native 0.86, TypeScript, durable SQLite cash queue, SecureStore credentials.
- `perpetual-pos-web/`: Next.js 16, owner dashboard, browser checkout, public storefront.
- `infra/compose.yaml`: local PostgreSQL 17 and Redis 7.
- `docs/`: architecture, OpenAPI contract, offline policy, deployment guide, validation results and screenshots.

## Local development (PowerShell)

Install Python 3.12+, Node 24 LTS, Docker Desktop and Android Studio for native builds. Start Docker Desktop. From this repository:

```powershell
docker compose -f infra/compose.yaml up -d --wait
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r perpetual-pos-api/requirements.lock.txt
Copy-Item perpetual-pos-api/.env.example perpetual-pos-api/.env
Copy-Item perpetual-pos-web/.env.example perpetual-pos-web/.env.local
Copy-Item perpetual-pos-mobile/.env.example perpetual-pos-mobile/.env
cd perpetual-pos-api
..\.venv\Scripts\python.exe manage.py migrate
..\.venv\Scripts\python.exe manage.py seed_demo
..\.venv\Scripts\python.exe manage.py runserver 0.0.0.0:8000
```

PostgreSQL binds to **127.0.0.1:55432**; Redis to **127.0.0.1:6379**. Port 55432 avoids a Windows port restriction encountered on this workstation. The Compose credentials are development-only. The seed command is restricted to DEBUG development settings, is safe to rerun, and does not reset existing passwords or stock. The local `.venv` was created using the Codex bundled Python because `python` was not on this workstation's PATH; an existing `.venv` can be used directly.

Open separate terminals from the repository root:

```powershell
# Web
cd perpetual-pos-web
npm ci
npm run dev
# Open http://localhost:3000 (use this exact origin for cookie/CSRF configuration)
```

```powershell
# Worker (Windows development uses the solo pool)
cd perpetual-pos-api
..\.venv\Scripts\celery.exe -A config worker -l INFO --pool=solo
# In another API terminal, run the reservation scheduler:
..\.venv\Scripts\celery.exe -A config beat -l INFO
```

```powershell
# Android development build; an emulator/device and Android SDK are required
cd perpetual-pos-mobile
npm ci
npm run android
# Subsequent JS development:
npm start
```

Android emulator API URL: `http://10.0.2.2:8000/api/v1/`. Physical Android: use the PC LAN IP in `EXPO_PUBLIC_API_URL`, run API on `0.0.0.0`, add that IP to API ALLOWED_HOSTS, and allow local TCP 8000 in the firewall. Keep phone and PC on the same network. Restart Metro after environment changes. Native config changes require rebuilding; Expo Go is not the supported integration-test target. Production builds require HTTPS and server credentials never belong in EXPO_PUBLIC variables.

## Demo accounts and storefronts

Development-only password for newly seeded accounts: **DemoOnly!2026**.

| Shop | Owner username | Cashier username | Storefront |
| --- | --- | --- | --- |
| Kampala Corner Shop | kampala-corner-owner | kampala-corner-cashier | /shop/kampala-corner |
| Jinja Daily Market | jinja-daily-owner | jinja-daily-cashier | /shop/jinja-daily |

Each has eight Ugandan sample products, opening stock, a customer and a pickup order. Use owner registration in the web app for a new shop. Owners create managers/cashiers in Team. Managers and owners can manage stock, discounts, reports and order fulfilment; cashiers can check out, read operational history and maintain customers. Cashier permissions are enforced on the API, not just hidden in the UI.

## Working flows

1. Sign in, create categories/products, and record opening stock or supplier receipts in Inventory.
2. In Checkout, search or scan a keyboard barcode, add quantities, optionally choose a customer, enter cash received and complete. Owners/managers may discount the first line. Manual MTN/Airtel records remain explicitly unverified. Download a text receipt or use the browser print dialog.
3. On Android, sign in online, refresh to cache products, disconnect and complete a cash sale. Queue states survive restarts. Reconnect to upload; repeated uploads cannot duplicate the sale/payment/stock movement. Share receipts through the native share sheet.
4. Visit the public storefront, add published products, choose pickup or configured shop delivery, and place an order. The customer receives a private capability URL. In Orders, accept, prepare, mark ready, then record payment and complete. Cancel or expire pending reservations to release stock.
5. Overview shows business-local daily totals, payment methods, transaction counts, low stock and estimated gross profit. It explicitly warns that unsynchronized sales are absent.

## API and tests

Interactive API documentation: `http://127.0.0.1:8000/api/v1/docs/`; schema: `/api/v1/schema/`; health: `/health/`. Static contract: [docs/openapi.yaml](docs/openapi.yaml). All protected domain routes live under `/api/v1/businesses/{business_id}/`; a matching active membership is always required.

```powershell
cd perpetual-pos-api
# Fast unit/API suite (SQLite test-only)
..\.venv\Scripts\python.exe manage.py test apps.common apps.accounts --settings=config.settings.test
# Full PostgreSQL suite including row-lock/concurrency tests
$env:TEST_DATABASE_URL='postgresql://perpetual:perpetual_dev@127.0.0.1:55432/perpetual_pos'
..\.venv\Scripts\python.exe manage.py test apps.common apps.accounts --settings=config.settings.test --noinput
..\.venv\Scripts\python.exe manage.py makemigrations --check --dry-run --settings=config.settings.test
..\.venv\Scripts\python.exe manage.py spectacular --file ../docs/openapi.yaml --validate --fail-on-warn --settings=config.settings.test
```

```powershell
cd perpetual-pos-mobile
npm run typecheck
npm run lint
npm test
npx expo install --check
npx expo export --platform android --output-dir dist
```

```powershell
cd perpetual-pos-web
npm run typecheck
npm run lint
npm run build
# With seeded API and web dev servers running; uses installed Microsoft Edge
npx playwright test
```

The browser smoke test creates demo sales/orders. Run against development data only. The SQLite queue tests exercise the same queue SQL and synchronization implementation through Node's SQLite adapter; Android process-kill and hardware checks remain separate.

## Operational boundaries

See [architecture](docs/architecture.md), [offline behavior](docs/offline-sync.md), [deployment instructions](docs/deployment.md), and [validation results](docs/validation.md).

Implemented: tenancy/roles, business/staff setup, categories/products, controlled stock operations, cash/manual-payment checkout, immutable sale snapshots, receipts, durable offline cash queue, storefront orders, reservation lifecycle, customers/history and daily reports. Product images and logos accept hosted URLs; media uploading is deferred. UGX is the pilot ledger currency; changing an existing business currency is intentionally disabled to avoid mixing historical ledgers. Future currency support needs denomination-aware presentation and onboarding.

Development fallback: FCM adapter logs order events unless explicitly configured. No live payment provider is installed. Physical printers have an interface only, and are not claimed to work. Staff account creation is implemented; email invitations, password recovery, refunds/returns, image uploads, review-case workflow, and a native APK/device acceptance test remain follow-up work. The owner can reconcile stock conflicts using audited adjustments; source sales remain immutable.

Reference Pendeza projects were read for structural patterns only and were not modified. No credentials, environment files, production data or branding were copied. Passing tests alone does not establish production readiness.


## API layout and Google sign-in

Django domain apps live in `perpetual-pos-api/apps/`. HTTP routes, serializers,
and views live in `perpetual-pos-api/api/v1/`. `config/urls.py` mounts that router
at `/api/v1/`; `/health/` stays unversioned. App labels and existing migration
names are preserved, so existing tables do not need to be recreated.

Google sign-in uses verified Google ID tokens and a persistent Google subject
mapping. Web login establishes an HttpOnly Django session with CSRF protection;
mobile login returns the existing rotating JWT pair stored in SecureStore.
Existing accounts can use an optional Google email entered during owner/staff
creation. Duplicate emails and inactive accounts are rejected. Gmail and verified
Google Workspace addresses can match an existing account; other external emails
require password login. New Google users receive no tenant access automatically:
create a business in the web dashboard before using mobile checkout.

1. Create Google OAuth credentials for Perpetual POS. Do not copy PendezaConnect
   secrets or its Android package identity. Set the API `GOOGLE_CLIENT_IDS` to
   the comma-separated trusted web client IDs.
2. Set `NEXT_PUBLIC_GOOGLE_CLIENT_ID` in the web environment and register the web
   origin (for example `http://localhost:3000`) under authorized JavaScript origins.
   Rebuild/restart the web app after changing this build-time setting.
3. Set mobile `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` to a trusted web client ID.
   Register Android package `com.perpetuallabs.pos` with the development/release
   signing certificate SHA-1 fingerprints in Google Cloud.
4. For iOS, configure the app bundle identifier and matching iOS OAuth client;
   set `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` and its reversed `GOOGLE_IOS_URL_SCHEME`.
5. Install dependencies, run `manage.py migrate`, and rebuild the native app.
   Google sign-in requires a development or release native build, not Expo Go.
   Buttons appear when the corresponding public client ID is configured.

Endpoints: `POST /api/v1/auth/google/` (mobile tokens),
`POST /api/v1/auth/google/session/` (CSRF-protected browser session), and
`POST /api/v1/businesses/` (authenticated business creation).
Google endpoints accept `{ "id_token": "..." }`. Client IDs are public identifiers;
no Google client secret is required for these ID-token flows.


Google UI regression tests use mocked Google/API responses. To run them without
real credentials, start the web dev server with `NEXT_PUBLIC_GOOGLE_CLIENT_ID=browser-test-client`
on port 3101, then set `GOOGLE_TEST_URL=http://localhost:3101` and run
`npx playwright test tests/google-auth.spec.ts`. Real OAuth and native device
acceptance still require the Google configuration above.

Verification follows Google's server-side ID-token guidance:
https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
