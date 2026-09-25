import { test, expect } from "@playwright/test";

test("marketplace checkout recovers the same request after a lost response", async ({
  page,
}) => {
  const ids: string[] = [];
  await page.addInitScript(() => {
    if (!localStorage.getItem("duukayo-cart:one"))
      localStorage.setItem("duukayo-cart:one", JSON.stringify({ 1: 2 }));
    if (!localStorage.getItem("duukayo-cart:two"))
      localStorage.setItem("duukayo-cart:two", JSON.stringify({ 2: 1 }));
  });
  await page.route("**/api/backend/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes("auth/session"))
      return route.fulfill({ json: { csrfToken: "test" } });
    if (path.endsWith("/carts/"))
      return route.fulfill({ json: { id: 3, token: "private-cart" } });
    if (path.endsWith("/quotes/"))
      return route.fulfill({
        json: {
          id: 7,
          total: 14000,
          currency: "UGX",
          expires_at: new Date(Date.now() + 300000).toISOString(),
          groups: [
            {
              shop: "Shop One",
              total: 5000,
              delivery_fee: 0,
              lines: [{ product: 1, name: "Milk", quantity: 2, price: 2500 }],
            },
            {
              shop: "Shop Two",
              total: 9000,
              delivery_fee: 0,
              lines: [{ product: 2, name: "Coffee", quantity: 1, price: 9000 }],
            },
          ],
        },
      });
    if (path.endsWith("/checkout/")) {
      expect(route.request().headers()["x-cart-token"]).toBe("private-cart");
      ids.push(route.request().postDataJSON().client_id);
      if (ids.length === 1) return route.abort("connectionreset");
      return route.fulfill({
        json: {
          id: 1,
          total: 14000,
          currency: "UGX",
          orders: [
            { id: 21, token: "order-one", shop: "Shop One" },
            { id: 22, token: "order-two", shop: "Shop Two" },
          ],
        },
      });
    }
    return route.fulfill({ json: { id: 3, lines: [] } });
  });
  await page.goto("/cart");
  await page.getByLabel("Your name").fill("Customer");
  await page.getByLabel("Phone number").fill("+256700000000");
  await page
    .getByRole("button", { name: "Review current prices & availability" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Total UGX 14,000" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Place all orders" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Unable to connect" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Recover pending checkout" }).click();
  await expect(
    page.getByRole("heading", { name: "Your orders are with the shops" }),
  ).toBeVisible();
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("duukayo-marketplace-pending"),
    ),
  ).toBeNull();
  await expect(
    page.getByRole("link", { name: /Track Shop Two/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "../docs/screenshots/marketplace-checkout-confirmation.png",
    fullPage: true,
  });
});

test("cashier drawer retries an uncertain opening with the same command identifier", async ({
  page,
}) => {
  const ids: string[] = [];
  const business = {
    id: 1,
    name: "Test Shop",
    slug: "one",
    currency: "UGX",
    branches: [{ id: 1, name: "Main" }],
  };
  await page.route("**/api/backend/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes("auth/me"))
      return route.fulfill({
        json: {
          id: 7,
          username: "cashier",
          memberships: [{ business, branch: 1, role: "cashier" }],
        },
      });
    if (path.includes("auth/session"))
      return route.fulfill({ json: { csrfToken: "test" } });
    if (path.endsWith("/registers/"))
      return route.fulfill({ json: [{ id: 2, name: "Front counter" }] });
    if (path.endsWith("/shifts/")) {
      if (route.request().method() === "POST") {
        ids.push(route.request().postDataJSON().client_id);
        if (ids.length === 1) return route.abort("connectionreset");
        return route.fulfill({
          json: { id: 5, expected_cash: 1000, closed: false },
        });
      }
      return route.fulfill({
        json: ids.length
          ? [
              {
                id: 5,
                cashier: 7,
                register_name: "Front counter",
                expected_cash: 1000,
                counted_cash: null,
                closed: false,
              },
            ]
          : [],
      });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Operations", exact: true }).click();
  await page.getByLabel("Opening cash").fill("1000");
  await page.getByRole("button", { name: "Open shift", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Retry pending operation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry pending operation" }).click();
  await expect(page.getByRole("status")).toContainText("Operation recorded");
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
  await expect(
    page.getByRole("heading", { name: "Returns & refunds" }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "../docs/screenshots/register-operations.png",
    fullPage: true,
  });
});


test("cash and mobile money split is submitted with exact allocations", async ({ page }) => {
  let payload: Record<string, unknown> | null = null;
  const business = { id: 1, name: "Test Shop", slug: "one", currency: "UGX" };
  const product = { id: 1, name: "Daily Milk", sku: "milk", barcode: "123", price: 2500, cost: 1000, quantity: 8, reserved: 0, active: true, published: true };
  await page.route("**/api/backend/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes("auth/me")) return route.fulfill({ json: { id: 7, username: "cashier", memberships: [{ business, branch: 1, role: "cashier" }] } });
    if (path.includes("auth/session")) return route.fulfill({ json: { csrfToken: "test" } });
    if (path.endsWith("products/")) return route.fulfill({ json: [product] });
    if (path.endsWith("sales/") && route.request().method() === "POST") {
      payload = route.request().postDataJSON();
      return route.fulfill({ json: { id: 4, total: 2500, currency: "UGX", delivery_fee: 0, review_reasons: [], lines: [{ name: "Daily Milk", quantity: 1, price: 2500, discount: 0 }], payment: { method: "split", change: 0 }, allocations: payload!.payments } });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /Daily Milk/ }).click();
  await page.getByRole("combobox", { name: "Payment method", exact: true }).selectOption("split");
  await page.getByLabel("Cash portion").fill("1000");
  await page.getByLabel("Payment reference").fill("MTN-123");
  await page.getByLabel("I checked the funds independently.").check();
  await page.getByRole("button", { name: "Complete sale →" }).click();
  await expect(page.getByText("Sale completed", { exact: true })).toBeVisible();
  expect(payload!.payments).toEqual([{ method: "cash", amount: 1000, tendered: 1000 }, { method: "manual_mtn", amount: 1500, tendered: 1500, reference: "MTN-123" }]);
});
