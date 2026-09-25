import { test, expect } from "@playwright/test";

test("owner grants an existing account branch access and can revoke that access", async ({ page }) => {
  const business = { id: 1, name: "First shop", slug: "first", currency: "UGX", timezone: "Africa/Kampala", branches: [{ id: 1, name: "Main" }, { id: 2, name: "Second" }] };
  let staff: { id: number; user__username: string; role: string; branch: number; active: boolean }[] = [];
  let added: unknown;
  let updated: unknown;
  await page.route("**/api/backend/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path.endsWith("auth/me/")) return route.fulfill({ json: { id: 1, username: "owner", memberships: [{ business, role: "owner", branch: 1 }] } });
    if (path.endsWith("auth/session/")) return route.fulfill({ json: { csrfToken: "test" } });
    if (path.endsWith("staff/") && method === "POST") {
      added = route.request().postDataJSON();
      staff = [{ id: 7, user__username: "buyer", role: "cashier", branch: 2, active: true }];
      return route.fulfill({ status: 201, json: { id: 7 } });
    }
    if (path.endsWith("staff/7/") && method === "PATCH") {
      updated = route.request().postDataJSON();
      staff = [{ ...staff[0], active: false }];
      return route.fulfill({ json: staff[0] });
    }
    if (path.endsWith("staff/")) return route.fulfill({ json: staff });
    if (path.endsWith("reports/")) return route.fulfill({ json: { total: 0, transactions: 0, estimated_gross_profit: 0, low_stock: [], by_payment_method: {} } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Team", exact: true }).click();
  await page.getByLabel("Existing username", { exact: true }).fill("buyer");
  await page.getByRole("combobox", { name: "Assigned branch", exact: true }).selectOption("2");
  await page.getByRole("button", { name: "Add shop access", exact: true }).click();
  await expect(page.getByText("Shop access added", { exact: true })).toBeVisible();
  expect(added).toEqual({ username: "buyer", role: "cashier", branch: 2, existing_account: true });
  await page.getByLabel("Active access for buyer", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Save access for buyer", exact: true }).click();
  await expect(page.getByText("Shop access updated", { exact: true })).toBeVisible();
  expect(updated).toEqual({ role: "cashier", branch: 2, active: false });
});

test("switching shops resets shop detail fields before saving", async ({ page }) => {
  const shops = [1, 2].map(id => ({ id, name: `Shop ${id}`, slug: `shop-${id}`, contact: `Contact ${id}`, website: "", description: `Description ${id}`, logo: "", currency: "UGX", timezone: "Africa/Kampala", published: true, delivery_enabled: false, delivery_fee: 0, safety_buffer: 0, branches: [{ id, name: "Main" }] }));
  let saved: { path: string; data: Record<string, unknown> } | undefined;
  await page.route("**/api/backend/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("auth/me/")) return route.fulfill({ json: { id: 1, username: "owner", memberships: shops.map(business => ({ business, branch: business.id, role: "owner" })) } });
    if (path.endsWith("auth/session/")) return route.fulfill({ json: { csrfToken: "test" } });
    if (route.request().method() === "PATCH") {
      saved = { path, data: route.request().postDataJSON() };
      return route.fulfill({ json: { ...shops[1], ...saved.data } });
    }
    if (path.endsWith("reports/")) return route.fulfill({ json: { total: 0, transactions: 0, estimated_gross_profit: 0, low_stock: [], by_payment_method: {} } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("name", { exact: true })).toHaveValue("Shop 1");
  await page.getByLabel("name", { exact: true }).fill("Unsaved first shop");
  await page.getByLabel("Business", { exact: true }).selectOption("1");
  await expect(page.getByLabel("name", { exact: true })).toHaveValue("Shop 2");
  await expect(page.getByRole("textbox", { name: "Description", exact: true })).toHaveValue("Description 2");
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  await expect(page.getByText("Saved successfully", { exact: true })).toBeVisible();
  expect(saved?.path).toBe("/api/backend/businesses/2/");
  expect(saved?.data.name).toBe("Shop 2");
});
