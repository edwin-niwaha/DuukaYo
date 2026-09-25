import { test, expect } from "@playwright/test";
const shop = { name: "Test Corner", slug: "test", currency: "UGX", logo: "", contact: "0700000000", delivery_enabled: true, delivery_fee: 3000, categories: ["Pantry"], product_count: 2, preview_products: [{ id: 1, name: "Daily Milk", image: "/missing-product.png", price: 2500, available: 8 }, { id: 2, name: "Rice", image: "/demo/rice.svg", price: 5000, available: 5 }] };
const catalog = { shop, availability_notice: "The shop confirms availability.", categories: [{ id: 1, name: "Pantry" }], products: shop.preview_products.map(p => ({ ...p, category: 1, category_name: "Pantry" })) };
test.beforeEach(async ({ page }) => {
  page.on("dialog", dialog => void dialog.accept());
});
test("carousel controls, exact product deep links and responsive detail dialog", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/backend/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes("featured-products/")) return route.fulfill({ json: { products: shop.preview_products.map(p => ({ ...p, slug: shop.slug, shop: shop.name, currency: shop.currency })) } });
    if (path.includes("auth/me")) return route.fulfill({ status: 403, json: { detail: "Guest" } });
    return route.fulfill({ json: path.includes("shops/") ? { shops: [shop] } : catalog });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Motion off" })).toBeDisabled();
  await expect(page.locator(".showcase-slide:not([inert]) .showcase-product")).toHaveAttribute("href", "/shop/test?product=1");
  await page.getByRole("button", { name: "Next product" }).click();
  await expect(page.locator(".showcase-slide:not([inert]) .showcase-product")).toHaveAttribute("href", "/shop/test?product=2");
  await page.locator(".showcase-slide:not([inert]) .showcase-product").click();
  await expect(page.getByRole("dialog")).toContainText("Rice");
  await page.reload();
  await expect(page.getByRole("dialog")).toContainText("Rice");
  await page.screenshot({ path: "../docs/screenshots/upgraded-product-detail.png", animations: "disabled" });
  await page.getByRole("button", { name: "Add to cart +", exact: true }).click();
  await expect(page.getByLabel("Quantity of Rice")).toHaveText("1");
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: "../docs/screenshots/upgraded-shop-" + width + ".png", fullPage: true, animations: "disabled" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.goto("/shop/test?product=999");
  await expect(page.getByRole("dialog")).toContainText("This product is unavailable");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("lost checkout response survives reload and recovers the same order key", async ({ page }) => {
  const requests: Record<string, unknown>[] = [];
  await page.addInitScript(() => localStorage.setItem("duukayo-orders", "malformed"));
  await page.route("**/api/backend/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes("featured-products/")) return route.fulfill({ json: { products: shop.preview_products.map(p => ({ ...p, slug: shop.slug, shop: shop.name, currency: shop.currency })) } });
    if (path.includes("auth/me")) return route.fulfill({ status: 403, json: { detail: "Guest" } });
    if (path.includes("auth/session")) return route.fulfill({ json: { csrfToken: "test" } });
    if (route.request().method() === "POST") {
      requests.push(route.request().postDataJSON());
      if (requests.length === 1) return route.abort("failed");
      return route.fulfill({ status: 201, json: { token: "recovered", id: 42 } });
    }
    if (path.includes("guest-orders")) return route.fulfill({ json: { id: 42, shop: shop.name, shop_slug: shop.slug, currency: "UGX", total: 2500, delivery: false, delivery_fee: 0, payment_state: "unpaid", status: "completed", lines: [{ name: "Daily Milk", quantity: 1, price: 2500 }], expires_at: new Date().toISOString() } });
    return route.fulfill({ json: catalog });
  });
  await page.goto("/shop/test");
  await page.getByRole("button", { name: "Add Daily Milk to cart", exact: true }).click();
  await page.getByLabel("Your name", { exact: true }).fill("Buyer");
  await page.getByLabel("Phone number").fill("0700000000");
  await page.getByRole("button", { name: "Place order →" }).click();
  await expect(page.getByRole("button", { name: "Recover order" })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Your name", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Recover order" }).click();
  await expect(page).toHaveURL(/order\/recovered/);
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
  expect(await page.evaluate(() => localStorage.getItem("duukayo-checkout:test"))).toBeNull();
  await page.screenshot({ path: "../docs/screenshots/upgraded-confirmation.png", fullPage: true, animations: "disabled" });
});
test("checkout revalidates price before any order is submitted", async ({ page }) => {
  let changed = false; let writes = 0;
  await page.route("**/api/backend/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes("featured-products/")) return route.fulfill({ json: { products: shop.preview_products.map(p => ({ ...p, slug: shop.slug, shop: shop.name, currency: shop.currency })) } });
    if (path.includes("auth/me")) return route.fulfill({ status: 403, json: { detail: "Guest" } });
    if (route.request().method() === "POST") writes++;
    return route.fulfill({ json: { ...catalog, products: catalog.products.map(p => ({ ...p, price: changed ? p.price + 500 : p.price })) } });
  });
  await page.goto("/shop/test");
  await page.getByRole("button", { name: "Add Daily Milk to cart", exact: true }).click();
  await page.getByLabel("Your name", { exact: true }).fill("Buyer");
  await page.getByLabel("Phone number").fill("0700000000");
  changed = true;
  await page.getByRole("button", { name: "Place order →" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Your cart changed" })).toBeVisible();
  expect(writes).toBe(0);
});

test("autoplay advances, pauses on keyboard focus and honors explicit pause", async ({ page }) => {
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.route("**/api/backend/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes("featured-products/")) return route.fulfill({ json: { products: shop.preview_products.map(p => ({ ...p, slug: shop.slug, shop: shop.name, currency: shop.currency })) } });
    return path.includes("auth/me") ? route.fulfill({ status: 403, json: { detail: "Guest" } }) : route.fulfill({ json: { shops: [shop] } });
  });
  await page.goto("/");
  await page.clock.fastForward(500);
  const card = page.locator(".showcase-slide:not([inert]) .showcase-product");
  await expect(card).toHaveAttribute("href", "/shop/test?product=1");
  await page.clock.fastForward(5500);
  await expect(card).toHaveAttribute("href", "/shop/test?product=2");
  await card.focus();
  await page.mouse.move(1, 1);
  await page.clock.fastForward(6000);
  await expect(card).toHaveAttribute("href", "/shop/test?product=2");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByLabel("Search shops").focus();
  await page.clock.fastForward(6000);
  await expect(card).toHaveAttribute("href", "/shop/test?product=2");
});
