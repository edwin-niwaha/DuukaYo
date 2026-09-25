import { test, expect } from "@playwright/test";

test.use({ baseURL: process.env.PW_BASE_URL || "http://localhost:3105" });
const shop = {
  name: "Kampala Corner Shop",
  slug: "kampala-corner",
  logo: "",
  currency: "UGX",
  contact: "+256 700 123 456",
  delivery_enabled: true,
  delivery_fee: 3000,
  product_count: 3,
  categories: ["Dairy", "Pantry"],
  preview_products: [
    { id: 1, name: "Fresh Dairy Milk 500ml", image: "/demo/milk.svg", price: 2500 },
    { id: 2, name: "Kakira Sugar 1kg", image: "/demo/sugar.svg", price: 5000 },
    { id: 3, name: "Kaiso Rice 1kg", image: "/demo/rice.svg", price: 4500 },
  ],
};
const catalog = {
  shop,
  availability_notice: "The shop confirms availability.",
  categories: [
    { id: 1, name: "Dairy" },
    { id: 2, name: "Pantry" },
  ],
  products: shop.preview_products.map((p, i) => ({
    ...p,
    category: i ? 2 : 1,
    category_name: i ? "Pantry" : "Dairy",
    available: i === 2 ? 0 : 5,
  })),
};

test("customers discover shops, filter products, retain a cart, order delivery and track it", async ({
  page,
}) => {
  page.on("dialog", dialog => void dialog.accept());
  let orders = 0;
  await page.route("**/api/backend/**", async (route) => {
    if (new URL(route.request().url()).pathname.endsWith("/featured-products/")) return route.fulfill({ json: { products: shop.preview_products.map(p => ({ ...p, slug: shop.slug, shop: shop.name, currency: shop.currency })) } });
    if (new URL(route.request().url()).pathname.endsWith("/auth/me/")) return route.fulfill({status:403,json:{detail:"Not signed in"}});
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/shops/"))
      return route.fulfill({
        json: {
          shops: [
            shop,
            { ...shop, name: "Jinja Daily Market", slug: "jinja-daily" },
          ],
        },
      });
    if (path.endsWith("/auth/session/"))
      return route.fulfill({ json: { csrfToken: "test" } });
    if (path.includes("/guest-orders/"))
      return route.fulfill({
        json: {
          id: 10,
          shop: shop.name,
          shop_slug: shop.slug,
          contact: shop.contact,
          status: "pending",
          payment_state: "unpaid",
          total: 5500,
          currency: "UGX",
          delivery: true,
          delivery_fee: 3000,
          expires_at: new Date(Date.now() + 1800000).toISOString(),
          lines: [{ name: "Fresh Dairy Milk 500ml", price: 2500, quantity: 1 }],
        },
      });
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      expect(body.delivery).toBe(true);
      expect(body.address).toBe("Plot 12, Kampala");
      expect(body.lines).toEqual([{ product: 1, quantity: 1, price: 2500 }]);
      expect(body.client_id).toMatch(/^[a-f0-9-]{36}$/);
      orders++;
      return route.fulfill({
        status: 201,
        json: { id: 10, token: "private-test-token" },
      });
    }
    return route.fulfill({ json: catalog });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Discover.*more/ }),
  ).toBeVisible();
  await expect(page.locator(".showcase-slide:not([inert]) .showcase-product")).toBeVisible();
  await expect(page.locator(".showcase-slide:not([inert]) .showcase-image img")).toBeVisible();
  expect(await page.locator(".showcase-slide:not([inert]) .showcase-image img").evaluate(image => {
    const artwork = image.parentElement!.getBoundingClientRect();
    const photo = image.getBoundingClientRect();
    const title = image.closest(".showcase-product")!.querySelector("strong")!.getBoundingClientRect();
    return photo.bottom <= artwork.bottom + 1 && artwork.bottom <= title.top + 1;
  })).toBe(true);
  await page.screenshot({
    path: "../docs/screenshots/storefront-landing-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByLabel("Search shops").fill("Kampala");
  await expect(page.getByRole("heading", { name: /Jinja/ })).toHaveCount(0);
  await page.locator(".shop-card").filter({ hasText: "Kampala Corner Shop" }).click();
  await expect(page.getByRole("heading", { name: shop.name })).toBeVisible();
  await page.getByRole("button", { name: "Dairy", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Kakira Sugar 1kg" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Add Fresh Dairy Milk 500ml to cart",
      exact: true,
    })
    .click();
  await page.reload();
  await expect(
    page.getByLabel("Quantity of Fresh Dairy Milk 500ml"),
  ).toHaveText("1");
  await page.getByRole("button", { name: /Delivery.*UGX/ }).click();
  await page.getByLabel("Your name", { exact: true }).fill("Customer");
  await page.getByLabel("Phone number").fill("+256700123456");
  await page.getByLabel("Delivery address").fill("Plot 12, Kampala");
  await page.screenshot({
    path: "../docs/screenshots/storefront-shop-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Place order →" }).click();
  await expect(page).toHaveURL(/\/order\/private-test-token/);
  await expect(
    page.getByText("pending", { exact: true }).first(),
  ).toBeVisible();
  expect(orders).toBe(1);
  await page.getByRole("link", { name: "Back to the shop →" }).click();
  await expect(page.getByText("A little room for")).toBeVisible();
});

test("small screens, empty searches, unavailable stock and recoverable request failures", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let requests = 0;
  await page.route("**/api/backend/**", async (route) => {
    if (new URL(route.request().url()).pathname.endsWith("/featured-products/")) return route.fulfill({ json: { products: shop.preview_products.map(p => ({ ...p, slug: shop.slug, shop: shop.name, currency: shop.currency })) } });
    if (new URL(route.request().url()).pathname.endsWith("/auth/me/")) return route.fulfill({status:403,json:{detail:"Not signed in"}});
    if (new URL(route.request().url()).pathname.endsWith("/shops/"))
      return route.fulfill({ json: { shops: [shop] } });
    if (requests++ === 0)
      return route.fulfill({
        status: 503,
        json: { detail: "Shop temporarily unavailable" },
      });
    return route.fulfill({ json: catalog });
  });
  await page.goto("/");
  await expect(page.locator(".showcase-slide:not([inert]) .showcase-product")).toBeVisible();
  await expect(page.locator(".showcase-slide:not([inert]) .showcase-image img")).toBeVisible();
  expect(await page.locator(".showcase-slide:not([inert]) .showcase-image img").evaluate(image => {
    const artwork = image.parentElement!.getBoundingClientRect();
    const photo = image.getBoundingClientRect();
    const title = image.closest(".showcase-product")!.querySelector("strong")!.getBoundingClientRect();
    return photo.bottom <= artwork.bottom + 1 && artwork.bottom <= title.top + 1;
  })).toBe(true);
  await page.screenshot({
    path: "../docs/screenshots/storefront-landing-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.goto("/shop/kampala-corner");
  await expect(page.locator(".error[role=alert]")).toContainText(
    "Shop temporarily unavailable",
  );
  await page.getByRole("button", { name: "Refresh availability" }).click();
  await expect(
    page.getByRole("button", { name: "Add Kaiso Rice 1kg to cart" }),
  ).toBeDisabled();
  await page.getByLabel("Search products").fill("nothing-like-this");
  await expect(page.getByText("Nothing matches yet.")).toBeVisible();
  await page.getByLabel("Search products").fill("");
  await page
    .getByRole("button", { name: "Add Fresh Dairy Milk 500ml to cart" })
    .click();
  await page.screenshot({
    path: "../docs/screenshots/storefront-shop-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Remove Fresh Dairy Milk 500ml" })
    .click();
  await expect(
    page.getByRole("button", { name: "Place order →" }),
  ).toBeDisabled();
});
