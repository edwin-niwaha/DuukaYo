import { test, expect } from "@playwright/test";
test("held cashier sale survives reload and a confirmed receipt survives refresh failure", async ({ page }) => {
  const business = { id: 1, name: "Test Shop", slug: "test", currency: "UGX", contact: "", delivery_enabled: false, delivery_fee: 0 };
  const profile = { id: 71, username: "cashier", memberships: [{ business, branch: 1, role: "cashier" }] };
  const product = { id: 1, name: "Daily Milk", sku: "MILK", barcode: "123", category: 1, category_name: "Dairy", image: "/demo/milk.svg", price: 2500, cost: 1000, quantity: 8, reserved: 0, active: true, published: true, low_stock_threshold: 2 };
  let sales = 0, productLoads = 0;
  let releaseProducts: (() => void) | undefined;
  await page.route("**/api/backend/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes("auth/me")) return route.fulfill({ json: profile });
    if (path.includes("auth/session")) return route.fulfill({ json: { csrfToken: "test" } });
    if (path.endsWith("/sales/") && route.request().method() === "POST") {
      sales++;
      return route.fulfill({ json: { id: 41, review_reasons: [], delivery_fee: 0, total: 2500, currency: "UGX", occurred_at: new Date().toISOString(), lines: [{ product: 1, name: "Daily Milk", quantity: 1, price: 2500, discount: 0 }], payment: { method: "cash", tendered: 5000, change: 2500 } } });
    }
    if (path.endsWith("/products/")) {
      productLoads++;
      if (productLoads === 2) await new Promise<void>(resolve => { releaseProducts = resolve; });
      return sales ? route.fulfill({ status: 503, json: { detail: "Refresh unavailable" } }) : route.fulfill({ json: [product] });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /Daily Milk/ }).click();
  await page.getByRole("button", { name: "Hold sale", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Resume sale 1" })).toBeDisabled();
  await expect.poll(() => Boolean(releaseProducts)).toBe(true);
  releaseProducts!();
  await page.getByRole("button", { name: "Resume sale 1" }).click();
  await expect(page.getByLabel("Quantity of Daily Milk")).toHaveValue("1");
  await expect(page.getByLabel(/Discount on first line/)).toHaveCount(0);
  await page.getByLabel("Cash received").fill("5000");
  await page.screenshot({ path: "../docs/screenshots/upgraded-pos.png", fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Complete sale →" }).click();
  await expect(page.getByText("Sale completed", { exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "receipt below is confirmed" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download receipt" })).toBeVisible();
  expect(sales).toBe(1);
});
