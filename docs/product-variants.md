# Products, variants and wishlist

## Managing products on the web
Open Dashboard > Catalog. Search by product name, SKU, barcode or variant, and filter by category or status. Add product opens an explicit-save editor; Edit variants opens all SKUs in the selected family. Failed saves retain the edited values and identify the invalid row and field.

For a new family, enter the product name, base SKU, price and cost, then define options such as Volume = 50 ml, 100 ml or Size = S, M, L and Colour = Black, White. Generate variants creates the combinations (maximum 100). Review each SKU, price, cost, image and publication status before Save products. All rows save atomically. Opening a saved family preloads its option names and values. Add more comma-separated values and Generate variants to append missing combinations while retaining existing IDs, prices, SKUs, barcodes, images and stock. Existing combinations are never removed by the generator. Add another variant also adds a combination manually. The catalog initially shows all statuses so drafts and previews remain easy to find. Converting a single existing product retains its ID, SKU and stock on the first generated combination. New variants start without stock; record their quantities using Inventory.

Each variant is an existing Product record with its own SKU and stock. variant_group links related products within one business; attributes holds the option combination. Option names must match across a family, combinations must be unique (case-insensitive), and names/values cannot be empty. Ordinary products continue to work without variants.

Duplicate copies product details into an unsaved draft, clears SKUs/barcodes, and gives a copied family a new group identity. Archive hides an item and preserves its history; Restore reactivates it without automatically publishing it. Delete permanently removes an unused product after confirmation. Products with stock, cart or transaction references cannot be deleted: use Archive.

## Managing products on mobile

Open Accounts > App & support > Manage shops and products, then select your business. The editor supports names, SKUs, barcodes, prices, costs, descriptions, categories, images and publication for each variant. Define comma-separated option values, generate combinations, and use the variant buttons to review each SKU. Save products writes the family atomically; failed requests retain every edited row. Existing IDs, stock and variant details are preserved when extending a family. New variants start without stock and can be adjusted after saving.

Navigation uses bundled image icons instead of font symbols. Recovered POS receipts use actual line breaks. To discard an old Metro bundle, stop Metro and run `npm start -- --clear` in `duukayo-mobile`, then reload the development app. No new native dependencies were added.

## Shopping
The web and mobile shelves group variants into one product card. Choose options opens the product details. Selecting an option changes the image, price, available quantity and wishlist identity. Unavailable options remain inspectable but cannot be added to a cart. Search includes option labels. Carts, orders and receipts show the chosen variant; historical order/sale names are snapshots and do not change with later catalog edits.

Product photos and galleries have rounded corners and preserve their aspect ratio. The Next.js development indicator is disabled in previews. Workspace navigation, catalog actions and carousel arrows use accessible SVG icons. No literal backtick-n text was found in the application source.

Outlined wishlist hearts save a product; filled hearts remove it. Mobile stores the wishlist on the device; web stores it in the current browser and includes a Wishlist page. These are not synchronized between devices or accounts. Saved prices are informational; opening the product/checkout checks current availability and pricing.

## API and migrations
- POST /api/v1/businesses/{business_id}/products/variant-set/ accepts {products: [...]} with optional existing IDs, up to 100 rows. Changes are atomic and use the business lock; all products must belong to that business. Owners/managers only.
- Existing product create/PATCH endpoints enforce the same variant validation.
- DELETE /api/v1/businesses/{business_id}/products/{id}/ only removes products without protected references.
- orders.0005_variant_line_names and sales.0004_variant_line_names expand snapshot name fields to 4000 characters. Existing names are unchanged. Both migrations were applied to the local development database.

## Verification
API tests cover atomic rollback, duplicate combinations, permissions, cross-shop IDs, protected deletion and historical variant labels. PostgreSQL additionally verifies concurrent duplicate saves. Browser tests cover product options, wishlist persistence, exact checkout IDs, catalog editing/retry, deletion/archive/restore, upload validation and responsive layouts. Mobile component tests cover selected-variant stock and wishlist identity. Physical-device visual verification is still required.
