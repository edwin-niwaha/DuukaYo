# API developer portal

The API now serves a responsive developer guide at `/`, `/api/v1/`, and `/api/v1/docs/`. Interactive Swagger documentation is at `/api/v1/docs/explorer/`; the OpenAPI schema remains at `/api/v1/schema/`.

The portal includes public discovery examples, JWT and session authentication guidance, marketplace and POS workflows, error handling, and an endpoint directory generated from the current schema. Search filters methods, paths and summaries. Links open the matching operation in Swagger. Mobile navigation collapses behind a menu; the directory has a bounded scroll area. No account credentials are stored by the portal or persisted by Swagger.

Django templates are configured in base settings so documentation renders in all environments. Swagger still uses drf-spectacular's default external UI assets; the custom guide itself uses no external fonts, scripts or stylesheets. No database migration is required.

Verification: Django rendering checks for all entry points and schema; Playwright `tests/api-docs.spec.ts` covers live search, empty search results, operation links, phone layout, navigation and schema failure recovery.

Use `/api/v1/schema/` for the current API contract. To export and validate a local snapshot, run `python manage.py spectacular --file ../output/api-schema.yml --validate` from `duukayo-api` after creating the root `output` directory. Generated schemas, logs and browser screenshots are ignored by Git; regenerate them when needed instead of committing stale copies.
