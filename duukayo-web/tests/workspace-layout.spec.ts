import { test, expect, type Page } from "@playwright/test";
const business = { id: 1, name: "DuukaYo Studio", slug: "studio", currency: "UGX", timezone: "Africa/Kampala", branches: [{ id: 3, name: "Central branch" }] };
async function workspace(page: Page) {
  await page.route("**/api/backend/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes("auth/me")) return route.fulfill({ json: { id: 1, username: "drake", memberships: [{ business, branch: 3, role: "owner" }] } });
    if (path.endsWith("reports/")) return route.fulfill({ json: { total: 145000, transactions: 12, estimated_gross_profit: 38000, known_pending_sales: 0, sync_notice: "Latest synchronized sales.", low_stock: [], by_payment_method: { cash: 145000 } } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Your business, at a glance." })).toBeVisible();
}

test("desktop sidebar collapses, expands and scrolls in short windows", async ({ page }) => {
  await workspace(page);
  await expect(page.locator(".workspace-context")).toContainText("Central branch");
  const expanded = await page.locator(".sidebar").boundingBox();
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(page.getByRole("button", { name: "Expand sidebar" })).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".sidebar")).toHaveCSS("width", "84px");
  expect((await page.locator(".sidebar").boundingBox())!.width).toBeLessThan(expanded!.width);
  await page.getByRole("button", { name: "Orders", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Orders", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await expect(page.getByLabel("Business", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.screenshot({ path: "../docs/screenshots/workspace-expanded.png", fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 1280, height: 480 });
  expect(await page.locator(".sidebar-scroll").evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await page.getByRole("button", { name: "Team", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Team", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("mobile drawer traps focus, closes with Escape and selection, and restores focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await workspace(page);
  const open = page.getByRole("button", { name: "Open navigation", exact: true });
  await expect(page.getByRole("navigation", { name: "Business navigation" })).not.toBeVisible();
  await open.click();
  const dialog = page.getByRole("dialog", { name: "Workspace navigation" });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("button", { name: "Close navigation", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  // The first control is the brand link; focus remains in the drawer.
  expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
  await dialog.getByRole("button", { name: "Sign out", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("link", { name: "DuukaYo marketplace" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible(); await expect(open).toBeFocused();
  await open.click();
  await dialog.getByRole("button", { name: "Orders", exact: true }).click();
  await expect(dialog).not.toBeVisible(); await expect(open).toBeFocused();
  await expect(page.getByRole("heading", { name: "Orders", exact: true })).toBeVisible();
  await open.click();
  await page.screenshot({ path: "../docs/screenshots/workspace-mobile-navigation.png", animations: "disabled" });
  await page.getByRole("button", { name: "Close navigation overlay" }).click({ position: { x: 380, y: 400 } });
  await expect(dialog).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("marketplace discovery is responsive with product artwork and search", async ({ page }) => {
  const shop = { name: "Everyday Store", slug: "everyday", currency: "UGX", delivery_enabled: true, delivery_fee: 3000, categories: ["Essentials"], product_count: 2, preview_products: [{ id: 1, name: "Fresh Milk", image: "/demo/milk.svg", price: 2500 }, { id: 2, name: "Rice", image: "/demo/rice.svg", price: 5000 }] };
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/backend/**", route => route.fulfill({ json: new URL(route.request().url()).pathname.includes("featured-products/") ? { products: shop.preview_products.map(p => ({ ...p, slug: shop.slug, shop: shop.name, currency: shop.currency })) } : new URL(route.request().url()).pathname.includes("shops/") ? { shops: [shop] } : {} }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Discover.*more/ })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Search shops" })).toBeVisible();
  await expect(page.locator(".showcase-slide:not([inert]) .showcase-product img")).toBeVisible();
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const image = await page.locator(".showcase-slide:not([inert]) .showcase-image").boundingBox();
    expect(image!.height).toBeGreaterThanOrEqual(190);
    await page.screenshot({ path: `../docs/screenshots/discover-marketplace-${width}.png`, fullPage: true, animations: "disabled" });
  }
});
