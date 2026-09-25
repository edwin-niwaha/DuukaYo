# Dynamic shops, products and homepage slides

Implemented on 21 September 2026 across Django, Next.js and Expo.

## Using the features

- Web: Business dashboard → Catalog for product creation, details, images, publication and archive/restore. Inventory continues to record stock movements. Settings contains shop metadata, logo, publication, delivery and fulfilment branch, plus branch creation.
- Mobile: Account → App & support → Manage shops and products. Select a business or create a draft shop. Owners edit shop details; owners/managers edit catalog, categories, images and stock at their assigned branch. Cashiers retain POS access. Unknown stock responses have a saved recovery request.
- New shops start as drafts. Existing shops retain their previous visibility through the migration. Unpublishing blocks new orders while retaining recovery of existing order attempts and order tracking.
- Imported products with unknown purchase costs remain inactive/unpublished. Both serializer validation and a database constraint enforce this. Enter the actual cost before activation. Archive replaces destructive product deletion to preserve ledger history.

## Homepage feed and motion

`GET /api/v1/featured-products/?limit=12` returns at most 24 items. It requires active, published products with images in published shops with a branch. A SQL window ranks products per shop: each eligible shop gets its first placement before another gets its second. Daily deterministic shop ordering rotates exposure when there are more shops than slots. Products within a shop use update time and ID. Results contain exact product destinations and branch availability, never costs.

The clients refresh the independent feed every 30 seconds while visible/active and on return to the app/window. Responses prohibit caching. Search does not affect the feed. Web uses a translated horizontal track; native uses a paged horizontal FlatList. Both expose previous/next, position, and explicit pause/play. Manual interaction pauses for eight seconds without changing explicit pause. Inactive slides are excluded from accessibility navigation. Native honors screen-reader and reduced-motion settings; web respects reduced motion and stops on keyboard focus. Browsers provide no reliable screen-reader detection API, so web uses accessible carousel controls and focus pause rather than claiming screen-reader detection.

## Images and configuration

Install API dependencies from `requirements.lock.txt`, run `python manage.py migrate`, and install mobile dependencies with `npm ci`. Rebuild the native development client after adding Expo Image Picker; a JavaScript reload alone does not install native modules.

`POST /api/v1/businesses/{id}/images/` accepts authenticated multipart `image` uploads from owners/managers. JPEG, PNG and WebP only, maximum 8 MB, dimensions 32–6000 pixels, maximum 24 megapixels. Pillow verifies and decodes actual bytes, applies orientation, strips metadata and re-encodes PNG capped at 2000 pixels. UUID storage keys are scoped per business. Saved foreign-shop upload URLs cannot be assigned through another shop's product/logo fields. Existing remote image URLs remain valid. Removal detaches the URL; it does not delete shared or historical files.

Configure:

```dotenv
MEDIA_ROOT=/persistent/duukayo/media
MEDIA_URL=/media/
PUBLIC_MEDIA_ORIGIN=https://api.example.com
```

Development Django serves media with DEBUG. Production must serve MEDIA_URL from the persistent MEDIA_ROOT using the reverse proxy/media host, or configure Django's default storage backend. Mount and back up this directory with the database; ephemeral container disks are unsuitable. Set a request-body limit of at least 9 MB on the reverse proxy. The current mobile `.env` points at `127.0.0.1:8000`. On a USB-connected Android device, this requires `adb reverse tcp:8000 tcp:8000`; otherwise set EXPO_PUBLIC_API_BASE_URL to the PC LAN API address, add that host to Django ALLOWED_HOSTS, and restart the app/API. For a physical phone over Wi-Fi, PUBLIC_MEDIA_ORIGIN must use an address reachable from both phone and web browser, not localhost. HTTPS is required in production. Image uploads use public product URLs; do not upload private identity documents. Unattached images can be cleaned separately after confirming no references.

## Imported catalog removal

The static Jobell source manifest, import scripts, reports and screenshots have been retired. Catalog entries are managed through Dashboard > Catalog.

`python manage.py remove_jobell_content` previews removal of imported JOBELL- SKUs for jobell-inc; `--apply` removes unused products and their unreferenced local images. Products with inventory or transaction history are archived and their images cleared. Business accounts and ownership remain intact. This command can be repeated safely.
