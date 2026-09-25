# Discover more: marketplace and workspace layouts

The customer-facing headline is now **Discover more.** Mobile and web copy, web page metadata, product showcase labels and order-completion messages no longer position DuukaYo as exclusively local shopping. This introduces broader marketplace branding without claiming worldwide fulfilment or payment integrations that are not available.

## Landing pages

- Web: prominent marketplace search, spacious product carousel, clearer marketplace sections and responsive shop cards. Saved carts and order links appear when there is something to resume.
- Mobile: search above the featured products, compact navigation shortcuts, larger store artwork and less nested padding. The wide product stage and reduced promotional wording are retained.

## Business workspaces

- Web: new dark-green sidebar, fixed brand/session areas and an independently scrollable navigation area. The hamburger collapses to a labelled icon rail on desktop and opens a drawer on small screens. The drawer supports Escape, backdrop dismissal, focus trapping, focus restoration and an inert background. The current branch comes from business data rather than a hard-coded Main branch label.
- Web dashboard: clearer title hierarchy, a quick-action panel and better spacing for statistics and operational panels.
- Mobile: a new Overview with actual loaded pending-order, sync-queue, held-sale and active-product counts. Managers open on Overview; cashiers retain direct access to Checkout. Larger product artwork and improved content spacing support both phones and tablets.
- A browser regression check revealed that a saved POS draft could be resumed before products finished loading. Checkout now waits for catalog readiness before allowing restoration, preserving the saved sale until stock can be validated.

## Verification

Web TypeScript, lint and production build; mobile TypeScript, lint, all 25 unit/component tests, and Android bundle export. All 10 affected browser checks passed, including reruns after fixing drawer focus and held-sale loading. Browser checks cover marketplace widths of 390/768/1440 px, desktop expand/collapse, scrolling in a short window, mobile drawer keyboard behaviour, product navigation, checkout recovery and delayed-stock held-sale restoration. Screenshots are under docs/screenshots/discover-marketplace-*.png and workspace-*.png.

Native-device visual testing remains unverified. Browser screenshots use controlled test fixtures, not live business metrics.
