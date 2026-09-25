import { test, expect } from "@playwright/test";

test("admin can hide, show and confirm shop deletion; errors keep the shop open", async ({ page }) => {
  let deleted = false, rejectDelete = true;
  const shop = { id: 42, name: "Lifecycle shop", slug: "lifecycle", published: true, suspended: false, owners: ["owner"], branches: [{ id: 1, name: "Main" }], currency: "UGX", timezone: "Africa/Kampala", description: "", website: "", contact: "", logo: "", delivery_enabled: false, delivery_fee: 0, safety_buffer: 0 };
  await page.route("**/api/backend/**", async route => {
    const path = new URL(route.request().url()).pathname.replace(/\/$/, "");
    if (path.endsWith("auth/me")) return route.fulfill({ json: { id: 1, username: "Admin", memberships: [], can_manage_platform: true, can_manage_admins: true } });
    if (path.endsWith("auth/session")) return route.fulfill({ json: { csrfToken: "test-csrf" } });
    if (path.endsWith("platform/reports")) return route.fulfill({ json: { shops: 1, suspended_shops: 0, users: 1, pending_orders: 0, from: "2026-09-01", to: "2026-09-23", totals: [] } });
    if (path.endsWith("platform/shops")) return route.fulfill({ json: { count: deleted ? 0 : 1, results: deleted ? [] : [shop], next: null, previous: null } });
    if (path.endsWith("platform/shops/42")) {
      if (route.request().method() === "PATCH") Object.assign(shop, route.request().postDataJSON());
      if (route.request().method() === "DELETE") {
        expect(route.request().postDataJSON()).toEqual({ confirm_slug: "lifecycle" });
        if (rejectDelete) return route.fulfill({ status: 400, json: ["Complete or cancel all outstanding orders before deleting this shop."] });
        deleted = true;
        return route.fulfill({ status: 204 });
      }
      return route.fulfill({ json: shop });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Shops", exact: true }).click();
  await page.getByRole("button", { name: "Manage Lifecycle shop" }).click();
  await page.getByRole("button", { name: "Hide shop", exact: true }).click();
  await expect(page.getByRole("button", { name: "Show shop", exact: true })).toBeVisible();
  expect(shop.published).toBe(false);
  await page.getByRole("button", { name: "Show shop", exact: true }).click();
  await expect(page.getByRole("button", { name: "Hide shop", exact: true })).toBeVisible();
  await page.locator(".shop-danger > summary").click();
  const remove = page.getByRole("button", { name: "Delete shop", exact: true });
  await expect(remove).toBeDisabled();
  await page.getByLabel("Type lifecycle to confirm deletion").fill("wrong");
  await expect(remove).toBeDisabled();
  await page.getByLabel("Type lifecycle to confirm deletion").fill("lifecycle");
  await remove.click();
  await expect(page.getByRole("main").getByText("Complete or cancel all outstanding orders before deleting this shop.", { exact: true })).toBeVisible();
  expect(deleted).toBe(false);
  rejectDelete = false;
  await remove.click();
  await expect(page.getByText("No shops found.")).toBeVisible();
  expect(deleted).toBe(true);
});
