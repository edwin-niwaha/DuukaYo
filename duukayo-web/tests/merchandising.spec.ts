import { test, expect } from "@playwright/test";
const products = [1, 2, 3].map((id) => ({
  id,
  name: `Product ${id}`,
  price: 40000,
  image: "/demo/rice.svg",
  shop: `Shop ${id}`,
  slug: `shop-${id}`,
  currency: "UGX",
  available: 5,
}));
test("carousel swipe suppresses navigation and temporary interaction resumes autoplay", async ({
  page,
}) => {
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.route("**/api/backend/**", (route) =>
    route.fulfill({
      json: route.request().url().includes("featured-products")
        ? { products }
        : { shops: [] },
    }),
  );
  await page.goto("/");
  await page.clock.fastForward(500);
  const active = page.locator(".showcase-slide:not([inert]) .showcase-product");
  await expect(active).toHaveAttribute("href", "/shop/shop-1?product=1");
  await page
    .locator(".product-showcase")
    .dispatchEvent("touchstart", {
      touches: [{ identifier: 1, clientX: 300 }],
    });
  await page
    .locator(".product-showcase")
    .dispatchEvent("touchend", {
      changedTouches: [{ identifier: 1, clientX: 90 }],
    });
  await expect(active).toHaveAttribute("href", "/shop/shop-2?product=2");
  await active.dispatchEvent("click");
  await expect(page).toHaveURL(/\/$/);
  await page.mouse.move(1, 1);
  await page.getByLabel("Search shops").focus();
  await page.clock.fastForward(11000);
  await expect(active).toHaveAttribute("href", "/shop/shop-3?product=3");
  await expect(page.locator(".showcase-track")).not.toHaveCSS(
    "transform",
    "none",
  );
});
test("feed stays independent of search and handles changing, single and empty lists", async ({
  page,
}) => {
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: "reduce" });
  let featured = products;
  await page.route("**/api/backend/**", (route) =>
    route.fulfill({
      json: route.request().url().includes("featured-products")
        ? { products: featured }
        : { shops: [] },
    }),
  );
  await page.goto("/");
  await page.clock.fastForward(500);
  await page.getByRole("button", { name: "Next product" }).click();
  await page.getByLabel("Search shops").fill("no matches");
  await page.clock.fastForward(1000);
  await expect(page.locator(".showcase-slide:not([inert])")).toContainText(
    "Product 2",
  );
  featured = [products[2]];
  await page.clock.fastForward(31000);
  await expect(page.locator(".showcase-slide:not([inert])")).toContainText(
    "Product 3",
  );
  await expect(page.getByRole("button", { name: "Next product" })).toHaveCount(
    0,
  );
  featured = [];
  await page.clock.fastForward(31000);
  await expect(page.getByText("Your next discovery awaits.")).toBeVisible();
});

test("catalog uploads preview images and shop settings save publication", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1600 });
  const business = {
    id: 1,
    name: "Test Shop",
    slug: "test",
    currency: "UGX",
    timezone: "Africa/Kampala",
    contact: "",
    description: "",
    website: "",
    logo: "",
    published: false,
    delivery_enabled: false,
    delivery_fee: 0,
    safety_buffer: 2,
    branches: [{ id: 1, name: "Main branch" }],
    storefront_branch: 1,
  };
  let saved: Record<string, unknown> | null = null,
    settings: Record<string, unknown> | null = null;
  let uploaded = false;
  await page.route("**/api/backend/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes("auth/me"))
      return route.fulfill({
        json: {
          id: 1,
          username: "owner",
          memberships: [{ business, branch: 1, role: "owner" }],
        },
      });
    if (path.includes("auth/session"))
      return route.fulfill({ json: { csrfToken: "test" } });
    if (path.endsWith("images/")) {
      expect(route.request().headers()["content-type"]).toContain(
        "multipart/form-data",
      );
      uploaded = true;
      return route.fulfill({
        status: 201,
        json: { url: "http://localhost:3107/demo/rice.svg" },
      });
    }
    if (path.endsWith("products/variant-set/") && route.request().method() === "POST") {
      saved = route.request().postDataJSON().products[0];
      return route.fulfill({ status: 201, json: { id: 10, ...saved } });
    }
    if (
      path.endsWith("businesses/1/") &&
      route.request().method() === "PATCH"
    ) {
      settings = route.request().postDataJSON();
      return route.fulfill({ json: { ...business, ...settings } });
    }
    return route.fulfill({
      json: path.endsWith("reports/")
        ? {
            total: 0,
            transactions: 0,
            estimated_gross_profit: 0,
            known_pending_sales: 0,
            low_stock: [],
            by_payment_method: {},
          }
        : [],
    });
  });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Catalog", exact: true }).click();
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  const form = page
    .locator("form")
    .filter({
      has: page.getByRole("button", { name: "Save products", exact: true }),
    });
  await form.getByLabel("Product name", { exact: true }).fill("New discovery");
  await form.getByLabel("SKU", { exact: true }).fill("NEW-1");
  await form.getByLabel("Price", { exact: true }).fill("40000");
  await form.getByLabel("Cost", { exact: true }).fill("25000");
  await form
    .getByLabel("Choose image")
    .setInputFiles({
      name: "test.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6ZkAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  await expect(form.getByAltText("Image preview")).toBeVisible();
  await form.getByRole("button", { name: "Upload selected image" }).click();
  await expect(form.getByLabel("Image URL", { exact: true })).toHaveValue(
    "http://localhost:3107/demo/rice.svg",
  );
  await form.getByRole("button", { name: "Save products", exact: true }).click();
  await expect(
    page.getByText("Products saved.", { exact: true }),
  ).toBeVisible();
  expect(uploaded).toBe(true);
  expect(saved).toMatchObject({
    name: "New discovery",
    price: 40000,
    cost: 25000,
    image: "http://localhost:3107/demo/rice.svg",
  });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByLabel("Description", { exact: true })
    .fill("Find your next favourite.");
  await page.getByLabel("Publish storefront").check();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(
    page.getByText("Published storefront", { exact: true }),
  ).toBeVisible();
  expect(settings).toMatchObject({
    description: "Find your next favourite.",
    published: true,
  });
  await page.evaluate(() => { document.documentElement.style.scrollBehavior = "auto"; window.scrollTo(0, 0); });
  await expect(page.locator(".sidebar")).toHaveCSS("width", "248px");
  await page.screenshot({
    path: "../docs/screenshots/shop-management.png",
    fullPage: false,
    animations: "disabled",
  });
});


test("failed spotlight feed offers retry and renders preview slides after recovery", async ({ page }) => {
  let failed = true;
  await page.route("**/api/backend/**", route => {
    if (route.request().url().includes("featured-products")) {
      return route.fulfill(failed ? { status: 503, json: { detail: "Temporarily unavailable" } } : { json: { products: products.map(p => ({ ...p, preview: true, available: 0 })) } });
    }
    return route.fulfill({ json: { shops: [] } });
  });
  await page.goto("/");
  await expect(page.getByRole("alert").filter({ hasText: "Product images could not load" })).toBeVisible();
  await expect(page.getByText("Products will appear here when shops open their shelves.")).toHaveCount(0);
  failed = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.locator(".showcase-slide:not([inert])")).toContainText("PREVIEW · COMING SOON");
  await expect(page.locator(".showcase-slide:not([inert]) img")).toBeVisible();
  await page.getByRole("button", { name: "Next product" }).click();
  await expect(page.locator(".showcase-slide:not([inert])")).toContainText("Product 2");
});
