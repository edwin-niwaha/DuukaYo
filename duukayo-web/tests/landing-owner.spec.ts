import { test, expect } from "@playwright/test";

test("landing shows ownership, shop search and working saved-cart links", async ({ page }) => {
  const shop = { name: "Everyday Market", slug: "everyday", currency: "UGX", logo: "", contact: "", delivery_enabled: true, delivery_fee: 3000, categories: ["Pantry"], product_count: 4, preview_products: [{ id: 1, name: "Rice", image: "/demo/rice.svg", price: 12000, available: 10 }] };
  await page.addInitScript(() => localStorage.setItem("duukayo-cart:everyday", JSON.stringify({ 1: 2 })));
  await page.route("**/api/backend/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("auth/me/")) return route.fulfill({ status: 403, json: {} });
    if (path.endsWith("featured-products/")) return route.fulfill({ json: { products: shop.preview_products.map(p => ({ ...p, slug: shop.slug, shop: shop.name, currency: shop.currency })) } });
    if (path.endsWith("shops/")) return route.fulfill({ json: { shops: [shop] } });
    return route.fulfill({ json: {} });
  });
  await page.goto("/");
  await expect(page.locator("footer").getByText("Crafted by Perpetual Labs", { exact: true })).toBeVisible();
  await expect(page.locator("main").getByText(/Perpetual Labs/)).toHaveCount(0);
  await expect(page.locator(".landing-owner-logo")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Cart · everyday →", exact: true })).toHaveAttribute("href", "/shop/everyday#cart");
  await expect(page.getByRole("heading", { name: "Everyday Market" })).toBeVisible();
  await page.locator("footer").scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator(".landing-owner-logo img").evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "../output/landing-owner-desktop.png", fullPage: true });
  await page.getByRole("searchbox", { name: "Search shops" }).fill("missing");
  await expect(page.getByRole("heading", { name: "No shops match your search" })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByRole("heading", { name: "Everyday Market" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "../output/landing-owner-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
