# DuukaYo

Retail POS with a web dashboard, public storefront, and mobile offline cash checkout.

| Folder | Application |
| --- | --- |
| `duukayo-api` | Django API; domain apps in `apps/`, HTTP endpoints in `api/v1/` |
| `duukayo-web` | Next.js dashboard and storefront |
| `duukayo-mobile` | Expo / React Native mobile app |
| `infra` | Local PostgreSQL and Redis |

## Setup

Install Python 3.12+, Node.js 24, and Docker Desktop. Android builds also need Android Studio and an emulator or connected device. Start Docker Desktop, then run these PowerShell commands from the repository root:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r duukayo-api/requirements.lock.txt
docker compose -f infra/compose.yaml up -d --wait

# Create missing environment files; keep existing settings.
if (!(Test-Path duukayo-api/.env)) { Copy-Item duukayo-api/.env.example duukayo-api/.env }
if (!(Test-Path duukayo-web/.env.local)) { Copy-Item duukayo-web/.env.example duukayo-web/.env.local }
if (!(Test-Path duukayo-mobile/.env)) { Copy-Item duukayo-mobile/.env.example duukayo-mobile/.env }
```

The example environment files use local PostgreSQL on port `55432`, Redis on `6379`, and the API on `8000`. When copying the API template, generate a secret with `python -c "import secrets; print(secrets.token_urlsafe(64))"` and set it as `SECRET_KEY`. Local environment files are excluded from Git.

See [environment configuration](docs/environment.md) for the borrowed variable format, database precedence, Google IDs, and optional services.

## Run the API

With the virtual environment activated:

```powershell
cd duukayo-api
python manage.py migrate
python manage.py seed_demo
python manage.py runserver 0.0.0.0:8000
```

API docs: [localhost:8000/api/v1/docs/](http://localhost:8000/api/v1/docs/).

## Run the web app

Open another terminal from the repository root:

```powershell
cd duukayo-web
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). Use this origin to match the cookie and CSRF settings.

- Owner: `kampala-corner-owner`
- Cashier: `kampala-corner-cashier`
- Password: `DemoOnly!2026`
- Storefront: [Kampala Corner Shop](http://localhost:3000/shop/kampala-corner).

## Run the mobile app

Open another terminal from the repository root:

```powershell
cd duukayo-mobile
npm ci
npm run mobile
```

`npm run mobile` builds and opens the Android development app using Metro on port `8082`. After the app is installed, use `npm start` for subsequent JavaScript changes on the same port. Rebuild after native configuration changes.

If Gradle reports `SDK location not found`, create `duukayo-mobile/.env.local` and set `ANDROID_HOME` to your Android SDK folder (usually `C:/Users/<your-user>/AppData/Local/Android/Sdk` on Windows), then rerun `npm run mobile`. Use forward slashes in the path.

The Android emulator uses `http://10.0.2.2:8000/api/v1/`. For a physical phone, set `EXPO_PUBLIC_API_BASE_URL` in the mobile `.env` to your PC's LAN address, add that IP to the API's `ALLOWED_HOSTS`, and restart both servers. Keep both devices on the same network and allow inbound port `8000` through the PC firewall.

## Background jobs

For notifications and reservation expiry, open two terminals from the repository root. Activate the virtual environment and enter the API folder in each:

```powershell
.\.venv\Scripts\Activate.ps1
cd duukayo-api
```

Run `celery -A config worker -l INFO --pool=solo` in one terminal and `celery -A config beat -l INFO` in the other.

## Google sign-in

Set the same Google OAuth **web client ID** in these files:

| File | Variable |
| --- | --- |
| `duukayo-api/.env` | `GOOGLE_KEY` (or `GOOGLE_CLIENT_IDS`) |
| `duukayo-web/.env.local` | `NEXT_PUBLIC_GOOGLE_CLIENT_ID` |
| `duukayo-mobile/.env` | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` |

Register `http://localhost:3000` as an authorized JavaScript origin in Google Cloud. For Android, register package `com.perpetuallabs.pos` and the build's signing-certificate SHA-1. For iOS, configure the matching bundle identifier, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, and its reversed `GOOGLE_IOS_URL_SCHEME`.

Restart the servers after editing environment files and rebuild the native app. Google sign-in needs an installed development or release build; Expo Go is unsupported. Blank client IDs leave Google sign-in disabled. New Google users create their business in the web dashboard before using mobile checkout.

## Checks

From the API folder with the virtual environment activated:

```powershell
python manage.py check
python manage.py test apps.common apps.accounts config.tests --settings=config.settings.test
python manage.py makemigrations --check --dry-run --settings=config.settings.test
```

Run `npm run typecheck` and `npm run lint` in both client folders. Run `npm run build` in the web folder and `npm test` in the mobile folder.

See [deployment](docs/deployment.md), [architecture](docs/architecture.md), and [offline sync](docs/offline-sync.md) for more detail.
