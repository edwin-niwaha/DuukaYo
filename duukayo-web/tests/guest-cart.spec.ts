import { test, expect } from "@playwright/test";

const products = [
  { id: 1, name: "Everyday cotton tote", image: "/demo/rice.svg", price: 25000, available: 12, category: 1, category_name: "Essentials" },
  { id: 2, name: "Handcrafted ceramic mug", image: "", price: 18000, available: 8, category: 1, category_name: "Essentials" },
];
const shop = { name: "The Corner Store", slug: "corner", currency: "UGX", logo: "", contact: "0700000000", delivery_enabled: true, delivery_fee: 3000, description: "Thoughtful everyday essentials." };
const catalog = { shop, products, categories: [{ id: 1, name: "Essentials" }], availability_notice: "Availability is checked at checkout." };

test("old cart links and stored checkout attempts migrate without losing items", async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("migration-seeded")) return;
    sessionStorage.setItem("migration-seeded", "1");
    localStorage.setItem("duukayo-bag:corner", JSON.stringify({ 1: 2 }));
    localStorage.setItem("duukayo-marketplace-pending", JSON.stringify({ cart: { id: 20, token: "original-token" }, body: { client_id: "original-command", quote: 3 }, bags: { "duukayo-bag:corner": JSON.stringify({ 1: 2 }) } }));
  });
  await page.route("**/api/backend/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("auth/me/")) return route.fulfill({ status: 403, json: {} });
    if (path.endsWith("auth/session/")) return route.fulfill({ json: { csrfToken: "test" } });
    if (path.endsWith("shop/corner/")) return route.fulfill({ json: catalog });
    if (path.endsWith("checkout/")) {
      expect(route.request().postDataJSON().client_id).toBe("original-command");
      expect(route.request().headers()["x-cart-token"]).toBe("original-token");
      return route.fulfill({ json: { total: 50000, currency: "UGX", orders: [] } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/bag");
  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.getByLabel("Quantity of Everyday cotton tote")).toHaveText("2");
  expect(await page.evaluate(() => localStorage.getItem("duukayo-bag:corner"))).toBeNull();
  await page.getByRole("button", { name: "Recover pending checkout" }).click();
  await expect(page.getByRole("heading", { name: "Your orders are with the shops" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("duukayo-cart:corner"))).toBeNull();
});

test("guest can add on the shop page and complete the cart checkout", async ({ page }) => {
  let submitted = 0;
  await page.route("**/api/backend/**", route => {
    const path = new URL(route.request().url()).pathname.replace("/api/backend/", "");
    if (path === "auth/me/") return route.fulfill({ status: 403, json: { detail: "Guest" } });
    if (path === "auth/session/") return route.fulfill({ json: { csrfToken: "test" } });
    if (path === "shop/corner/") return route.fulfill({ json: catalog });
    if (path === "carts/") return route.fulfill({ json: { id: 20, token: "guest" } });
    if (path === "carts/20/quotes/") return route.fulfill({ json: { id: 1, expires_at: new Date(Date.now() + 600000).toISOString(), total: 25000, currency: "UGX", groups: [{ shop: shop.name, total: 25000, delivery_fee: 0, lines: [{ product: 1, name: products[0].name, quantity: 1, price: 25000 }] }] } });
    if (path === "carts/20/checkout/") { submitted++; return route.fulfill({ json: { total: 25000, currency: "UGX", orders: [{ id: 1, token: "test-order", shop: shop.name, total: 25000 }] } }); }
    return route.fulfill({ json: {} });
  });
  await page.goto("/shop/corner");
  await page.getByRole("button", { name: "Add Everyday cotton tote to cart", exact: true }).click();
  await page.goto("/cart");
  await expect(page.getByLabel("Quantity of Everyday cotton tote")).toHaveText("1");
  await page.getByLabel("Your name", { exact: true }).fill("Test shopper");
  await page.getByLabel("Phone number").fill("+256700000000");
  await page.getByRole("button", { name: "Review order" }).click();
  await expect(page.getByRole("heading", { name: "Review your order" })).toBeVisible();
  await page.getByRole("button", { name: "Place all orders" }).click();
  await expect(page.getByRole("heading", { name: "Your orders are with the shops" })).toBeVisible();
  expect(submitted).toBe(1);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();
});

test("guest wishlist and cart persist, merge on login once, and stay private on logout", async ({ page }) => {
  let signedIn = false;
  let quantities: Record<number, number> = { 1: 3 };
  let guest: Record<number, number> = {};
  let merges = 0;
  let failFirstMergeResponse = true;
  const cart = () => ({ id: 10, lines: Object.entries(quantities).map(([product, quantity]) => ({ product: Number(product), quantity, slug: "corner" })) });
  await page.route("**/api/backend/**", async route => {
    const path = new URL(route.request().url()).pathname.replace("/api/backend/", "");
    const method = route.request().method();
    if (path === "auth/me/") return route.fulfill({ status: signedIn ? 200 : 403, json: signedIn ? { id: 1, username: "customer", memberships: [] } : { detail: "Guest" } });
    if (path === "auth/session/") { if (method === "DELETE") signedIn = false; return route.fulfill({ json: { csrfToken: "test" } }); }
    if (path === "public/settings/") return route.fulfill({ json: {} });
    if (path === "shop/corner/") return route.fulfill({ json: catalog });
    if (path === "my/cart/") return route.fulfill({ json: cart() });
    if (path === "carts/" && method === "POST") return route.fulfill({ json: { id: 20, token: "guest-token" } });
    if (path === "carts/20/" && method === "PUT") { guest = Object.fromEntries(route.request().postDataJSON().lines.map((line: { product: number; quantity: number }) => [line.product, line.quantity])); return route.fulfill({ json: {} }); }
    if (path === "carts/10/merge/") {
      if (merges === 0) { for (const [id, q] of Object.entries(guest)) quantities[Number(id)] = (quantities[Number(id)] || 0) + q; merges++; }
      if (failFirstMergeResponse) { failFirstMergeResponse = false; return route.fulfill({ status: 503, json: { detail: "Response lost. Retry." } }); }
      return route.fulfill({ json: cart() });
    }
    if (path === "carts/10/") {
      if (method === "PUT") quantities = Object.fromEntries(route.request().postDataJSON().lines.map((line: { product: number; quantity: number }) => [line.product, line.quantity]));
      return route.fulfill({ json: cart() });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/wishlist");
  await page.evaluate(items => { localStorage.setItem("duukayo-wishlist-v1", JSON.stringify(items)); window.dispatchEvent(new Event("wishlist-change")); }, products.map(p => ({ ...p, slug: shop.slug, shop: shop.name, currency: shop.currency })));
  await expect(page.getByRole("heading", { name: "Wishlist 2" })).toBeVisible();
  await page.getByRole("button", { name: "Add to cart +", exact: true }).first().click();
  await expect(page.getByRole("status")).toContainText("added to your cart");
  await page.getByRole("searchbox", { name: "Search wishlist" }).fill("ceramic");
  await expect(page.locator(".collection-wishlist-card")).toHaveCount(1);
  await page.getByRole("searchbox", { name: "Search wishlist" }).fill("");
  await page.getByRole("combobox", { name: "Sort wishlist" }).selectOption("name");
  await page.screenshot({ path: "../output/wishlist-desktop.png", fullPage: true });
  await page.goto("/cart");
  await expect(page.getByRole("heading", { name: "Everyday cotton tote" })).toBeVisible();
  await page.getByRole("button", { name: "Increase Everyday cotton tote" }).click();
  await expect(page.getByLabel("Quantity of Everyday cotton tote")).toHaveText("2");
  await page.reload();
  await expect(page.getByLabel("Quantity of Everyday cotton tote")).toHaveText("2");
  await page.screenshot({ path: "../output/cart-desktop.png", fullPage: true });
  signedIn = true;
  await page.evaluate(() => window.dispatchEvent(new Event("session-change")));
  await expect(page.getByRole("button", { name: "Retry sync" })).toBeVisible();
  await page.getByRole("button", { name: "Retry sync" }).click();
  await expect(page.getByLabel("Quantity of Everyday cotton tote")).toHaveText("5");
  await expect.poll(() => quantities[1]).toBe(5);
  await page.reload();
  await expect(page.getByLabel("Quantity of Everyday cotton tote")).toHaveText("5");
  expect(merges).toBe(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "../output/cart-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.goto("/wishlist");
  await expect(page.getByRole("heading", { name: "Everyday cotton tote" })).toBeVisible();
  await page.screenshot({ path: "../output/wishlist-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL("http://localhost:3000/");
  await page.goto("/cart");
  await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();
  expect(quantities[1]).toBe(5);
});
