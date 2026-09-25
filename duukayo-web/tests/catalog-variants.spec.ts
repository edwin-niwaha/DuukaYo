import { test, expect } from "@playwright/test";

const shop = {
  name: "Fragrance Corner",
  slug: "fragrance",
  currency: "UGX",
  logo: "",
  contact: "0700000000",
  delivery_enabled: false,
  delivery_fee: 0,
};
const products = [
  {
    id: 1,
    name: "Fresh scent",
    image: "/demo/milk.svg",
    gallery: ["/demo/rice.svg"],
    price: 40000,
    cost: 25000,
    available: 3,
    quantity: 3,
    reserved: 0,
    sku: "F-50",
    barcode: "",
    active: true,
    published: true,
    low_stock_threshold: 5,
    category: 1,
    category_name: "Fragrance",
    variant_group: "fresh",
    attributes: { Volume: "50 ml" },
  },
  {
    id: 2,
    name: "Fresh scent",
    image: "/demo/rice.svg",
    price: 70000,
    cost: 40000,
    available: 0,
    quantity: 0,
    reserved: 0,
    sku: "F-100",
    barcode: "",
    active: true,
    published: true,
    low_stock_threshold: 5,
    category: 1,
    category_name: "Fragrance",
    variant_group: "fresh",
    attributes: { Volume: "100 ml" },
  },
  {
    id: 3,
    name: "Fresh scent",
    image: "/demo/sugar.svg",
    price: 90000,
    cost: 60000,
    available: 2,
    quantity: 2,
    reserved: 0,
    sku: "F-200",
    barcode: "",
    active: true,
    published: true,
    low_stock_threshold: 5,
    category: 1,
    category_name: "Fragrance",
    variant_group: "fresh",
    attributes: { Volume: "200 ml" },
  },
];
const catalog = {
  shop,
  products,
  categories: [{ id: 1, name: "Fragrance" }],
  availability_notice: "The shop confirms availability.",
};
test("variant selection, wishlist persistence and exact checkout identity", async ({
  page,
}) => {
  page.on("dialog", (dialog) => void dialog.accept());
  let order: { lines: { product: number; price: number }[] } | undefined;
  await page.route("**/api/backend/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes("auth/me"))
      return route.fulfill({ status: 403, json: { detail: "Guest" } });
    if (path.includes("auth/session"))
      return route.fulfill({ json: { csrfToken: "test" } });
    if (route.request().method() === "POST") {
      order = route.request().postDataJSON();
      return route.fulfill({
        status: 503,
        json: { detail: "Keep the draft for inspection" },
      });
    }
    return route.fulfill({ json: catalog });
  });
  await page.goto("/shop/fragrance");
  await expect(page.locator(".shelf-card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Choose options for Fresh scent" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Volume: 100 ml · Unavailable" })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Add to cart +" }),
  ).toBeDisabled();
  await dialog
    .getByRole("button", { name: "Volume: 200 ml", exact: true })
    .click();
  await expect(dialog.locator(".detail-price")).toHaveText("UGX 90,000");
  await dialog
    .getByRole("button", {
      name: "Save Fresh scent — Volume: 200 ml to wishlist",
    })
    .click();
  await expect(
    dialog.getByRole("button", {
      name: "Remove Fresh scent — Volume: 200 ml from wishlist",
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.setViewportSize({ width: 390, height: 900 });
  await page.screenshot({
    path: "../docs/screenshots/variant-detail-mobile.png",
  });
  await expect(dialog.locator(".detail-art img")).toHaveCSS(
    "border-radius",
    "16px",
  );
  await dialog.getByRole("button", { name: "Add to cart +" }).click();
  await expect(page).toHaveURL(/\/shop\/fragrance$/);
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".shopping-cart")).toContainText("Volume: 200 ml");
  await page.getByLabel("Your name", { exact: true }).fill("Buyer");
  await page.getByLabel("Phone number").fill("0700000000");
  await page.getByRole("button", { name: "Place order →" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Keep the draft" }),
  ).toBeVisible();
  expect(order?.lines).toEqual([{ product: 3, price: 90000, quantity: 1 }]);
  await page.goto("/wishlist");
  await expect(
    page.getByRole("heading", { name: "Fresh scent — Volume: 200 ml" }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", {
      name: "Remove Fresh scent — Volume: 200 ml from wishlist",
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your wishlist is empty" }),
  ).toBeVisible();
});

test("catalog creates variants atomically, retains failed edits and manages deletion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const business = {
    ...shop,
    id: 1,
    timezone: "Africa/Kampala",
    description: "",
    website: "",
    published: true,
    safety_buffer: 0,
    branches: [{ id: 1, name: "Main" }],
  };
  let rows: Record<string, unknown>[] = [];
  let fail = true,
    saved: { products: Record<string, unknown>[] } | undefined;
  page.on("dialog", (dialog) => void dialog.accept());
  await page.route("**/api/backend/**", async (route) => {
    const path = new URL(route.request().url()).pathname,
      method = route.request().method();
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
    if (path.endsWith("variant-set/")) {
      saved = route.request().postDataJSON();
      if (fail) {
        fail = false;
        return route.fulfill({
          status: 400,
          json: { products: { "1": { sku: ["Choose a unique SKU."] } } },
        });
      }
      rows = saved!.products.map((p, i) => ({
        ...p,
        id: p.id || i + 10,
        quantity: 0,
        reserved: 0,
      }));
      return route.fulfill({ json: { products: rows } });
    }
    if (method === "DELETE") {
      rows = rows.filter((p) => !path.endsWith("/" + p.id + "/"));
      return route.fulfill({ status: 204 });
    }
    if (method === "PATCH") {
      const patch = route.request().postDataJSON();
      rows = rows.map((p) =>
        path.endsWith("/" + p.id + "/") ? { ...p, ...patch } : p,
      );
      return route.fulfill({ json: patch });
    }
    if (path.endsWith("products/")) return route.fulfill({ json: rows });
    if (path.endsWith("categories/"))
      return route.fulfill({ json: catalog.categories });
    if (path.endsWith("reports/"))
      return route.fulfill({
        json: {
          total: 0,
          transactions: 0,
          estimated_gross_profit: 0,
          known_pending_sales: 0,
          low_stock: [],
          by_payment_method: {},
        },
      });
    return route.fulfill({ json: [] });
  });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Catalog", exact: true }).click();
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  await page.getByLabel("Product name", { exact: true }).fill("New perfume");
  await page.getByLabel("SKU", { exact: true }).fill("NEW");
  await page.getByLabel("Price", { exact: true }).fill("40000");
  await page.getByLabel("Cost", { exact: true }).fill("25000");
  await page.getByLabel("Option name").fill("Volume");
  await page.getByLabel("Values, separated by commas").fill("50 ml, 100 ml");
  await page.getByRole("button", { name: "Generate variants" }).click();
  await expect(page.locator(".variant-editor")).toHaveCount(2);
  await page.getByLabel("Price", { exact: true }).nth(1).fill("70000");
  await page.getByRole("button", { name: "Save products" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Choose a unique SKU" }),
  ).toBeVisible();
  await expect(page.getByLabel("Price", { exact: true }).nth(1)).toHaveValue(
    "70000",
  );
  await page.getByRole("button", { name: "Save products" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Products saved." })).toContainText("Products saved.");
  expect(saved?.products.map((p) => p.attributes)).toEqual([
    { Volume: "50 ml" },
    { Volume: "100 ml" },
  ]);
  expect(saved?.products[0].variant_group).toBe(
    saved?.products[1].variant_group,
  );
  await expect(page.locator(".catalog-row")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Edit variants", exact: true })
    .first()
    .click();
  await page.getByLabel("Price", { exact: true }).first().fill("45000");
  await page.getByRole("button", { name: "Save products" }).click();
  await expect(page.locator(".catalog-row").first()).toContainText("45,000");
  await page.getByRole("button", { name: "Edit variants", exact: true }).first().click();
  await expect(page.getByLabel("Option name")).toHaveValue("Volume");
  await page.getByLabel("Values, separated by commas").fill("50 ml, 100 ml, 200 ml");
  await page.getByRole("button", { name: "Generate variants" }).click();
  await expect(page.locator(".variant-editor")).toHaveCount(3);
  await expect(page.getByLabel("Price", { exact: true }).first()).toHaveValue("45000");
  await expect(page.getByLabel("Price", { exact: true }).nth(1)).toHaveValue("70000");
  await page.getByRole("button", { name: "Save products" }).click();
  await expect(page.locator(".catalog-row")).toHaveCount(3);
  expect(saved?.products.slice(0, 2).map(p => p.id)).toEqual([10, 11]);
  expect(saved?.products[2].id).toBeUndefined();
  expect(saved?.products[2].attributes).toEqual({ Volume: "200 ml" });
  await expect(page.getByRole("button", { name: "Catalog", exact: true }).locator("svg")).toHaveCount(1);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = "auto";
      window.scrollTo(0, 0);
    });
    if (width === 390)
      await expect(
        page.getByRole("button", { name: "Open navigation", exact: true }),
      ).toBeVisible();
    await page.screenshot({
      path: "../docs/screenshots/catalog-variants-" + width + ".png",
      fullPage: true,
      animations: "disabled",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page
    .getByRole("button", { name: "Delete", exact: true })
    .first()
    .click();
  await expect(page.locator(".catalog-row")).toHaveCount(2);
  await page.getByRole("button", { name: "Delete", exact: true }).first().click();
  await expect(page.locator(".catalog-row")).toHaveCount(1);
  await page.getByRole("navigation", { name: "Catalog views" }).getByRole("button", { name: "Active", exact: true }).click();
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(page.locator(".catalog-row")).toHaveCount(0);
  await page.getByRole("navigation", { name: "Catalog views" }).getByRole("button", { name: "Archived", exact: true }).click();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.locator(".catalog-row")).toHaveCount(0);
});
