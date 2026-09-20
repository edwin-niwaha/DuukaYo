# Environment configuration

API settings load shell/container variables first, then `.env.local`, then `.env`.
Local files stay excluded from Git. `.env.example` uses the borrowed key names with
local defaults and empty service credentials.

| Purpose | API variables | Behavior |
| --- | --- | --- |
| Settings | `DJANGO_ENV` | `development`, `production`, or `test`; explicit `DJANGO_SETTINGS_MODULE` overrides it |
| Database | `DATABASE_URL` or `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT` | Nonblank URL wins; leave it blank to use the separate fields |
| Browser origins | `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS` | Separate comma-separated allowlists; CORS does not grant CSRF trust |
| Queue | `CELERY_BROKER_URL`, `REDIS_URL`, `CELERY_RESULT_BACKEND`, `CELERY_TASK_DEFAULT_QUEUE` | Explicit broker wins over Redis URL; use a queue dedicated to this project |
| Google | `GOOGLE_KEY`, `GOOGLE_CLIENT_IDS`, `MOBILE_GOOGLE_CLIENT_IDS` | Combined trusted ID-token audiences; `GOOGLE_SECRET` is unused |
| Firebase | `PUSH_BACKEND`, `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_B64`, `GOOGLE_APPLICATION_CREDENTIALS` | Defaults to log-only; `fcm` enables sends. Base64 JSON takes precedence, then the SDK's credential-file/default-credential lookup |
| SMTP | `EMAIL_BACKEND`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `EMAIL_USE_TLS`, `EMAIL_USE_SSL`, `DEFAULT_FROM_EMAIL` | Console backend by default; SMTP is opt-in; do not enable both TLS and SSL |

Development settings also allow local API hosts and the localhost:3000 web proxy.
Production does not add these local defaults. No schema migrations or network
requests are performed just by parsing the environment.

The Next.js server uses `API_URL` and `WEB_ORIGIN`. Set the public
`NEXT_PUBLIC_GOOGLE_CLIENT_ID` to the API's `GOOGLE_KEY` (or another trusted web
client ID). Only public OAuth client IDs belong in browser/mobile settings.

Mobile uses `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_APP_ENV`, and
`EXPO_PUBLIC_API_TIMEOUT_MS` (default 15000, maximum 120000). Legacy
`EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_ENV` still work. Production requires HTTPS.
The base URL includes `/api/v1/`; a missing trailing slash is normalized.

`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` must be trusted by the API. The Android client
ID identifies the Google Cloud registration for the app's package and signing
certificate; it is not passed as the native SDK's web client ID. iOS uses
`EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` and `GOOGLE_IOS_URL_SCHEME`.
Keep machine-specific `ANDROID_HOME` in mobile `.env.local`. Restart servers and
Metro after environment edits; native OAuth configuration changes need a rebuild.

Cloudinary, GitHub OAuth, Resend delivery, and MTN/MoMo payment variables remain
reserved. Setting them does not enable those features. `RESEND_FROM_EMAIL` is
accepted only as a fallback sender address. No secrets from the borrowed file
are copied into templates or documentation.
