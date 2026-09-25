import { test, expect } from "@playwright/test";

test("people directory edits profiles, assigns roles, manages registered users", async ({ page }) => {
  const users = [
    { id: 1, username: "Admin", first_name: "Platform", last_name: "Admin", email: "admin@example.com", phone: "", is_active: true, is_superuser: true, platform_admin: true, job_title: "Platform administrator", shop_access: [] },
    { id: 2, username: "amina", first_name: "Amina", last_name: "Nabirye", email: "amina@example.com", phone: "+256 700 111222", is_active: true, is_superuser: false, platform_admin: false, job_title: "Store supervisor", shop_access: [{ business: 7, branch: 8, role: "manager", active: true, shop_name: "Kampala Central", branch_name: "Main branch" }] },
  ];
  await page.route("**/api/backend/**", async route => {
    const req = route.request(), path = new URL(req.url()).pathname.replace(/\/$/, "");
    if (path.endsWith("auth/me")) return route.fulfill({ json: { id: 1, username: "Admin", memberships: [], can_manage_platform: true, can_manage_admins: true } });
    if (path.endsWith("auth/session")) return route.fulfill({ json: { csrfToken: "test" } });
    if (path.endsWith("platform/reports")) return route.fulfill({ json: { shops: 1, suspended_shops: 0, users: 2, pending_orders: 0, from: "2026-09-01", to: "2026-09-23", totals: [] } });
    if (path.endsWith("platform/shops")) return route.fulfill({ json: { count: 1, next: null, results: [{ id: 7, name: "Kampala Central", branches: [{ id: 8, name: "Main branch" }] }] } });
    if (path.endsWith("platform/users")) {
      if (req.method() === "POST") { const body = req.postDataJSON(); expect(body.shop_access[0]).toMatchObject({ business: 7, branch: 8, role: "cashier" }); users.push({ ...body, id: 3, is_superuser: false }); return route.fulfill({ status: 201, json: users[2] }); }
      return route.fulfill({ json: { count: users.length, next: null, previous: null, results: users } });
    }
    if (/platform\/users\/\d+$/.test(path)) {
      const id = Number(path.split("/").pop()), index = users.findIndex(u => u.id === id);
      if (req.method() === "DELETE") { expect(req.postDataJSON().confirm_username).toBe(users[index].username); users.splice(index, 1); return route.fulfill({ status: 204 }); }
      Object.assign(users[index], req.postDataJSON()); return route.fulfill({ json: users[index] });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Users", exact: true }).click();
  await expect(page.getByRole("button", { name: "Delete Admin", exact: true })).toBeDisabled();
  await expect(page.getByText("Amina Nabirye")).toBeVisible();
  await page.screenshot({ path: "../docs/screenshots/people-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Edit amina", exact: true }).click();
  await page.getByLabel("Phone number").fill("+256 777 123456");
  await page.getByLabel("Location", { exact: true }).fill("Entebbe");
  await page.getByRole("combobox", { name: "Role for Kampala Central", exact: true }).selectOption("cashier");
  await expect(page.getByRole("group", { name: "Profile picture" })).toBeVisible();
  await page.screenshot({ path: "../docs/screenshots/people-editor.png", fullPage: true });
  await page.getByRole("button", { name: "Save account", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("+256 777 123456")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add user", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Copy registration link" })).toBeVisible();
  await page.getByRole("button", { name: "Edit amina", exact: true }).click();
  await expect(page.getByLabel("Username", { exact: true })).toHaveAttribute("readonly", "");
  await expect(page.getByLabel("Email", { exact: true })).toHaveAttribute("readonly", "");
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Close editor" }).click();
  await page.getByRole("button", { name: "Delete amina", exact: true }).click();
  await expect(page.getByRole("button", { name: "Delete user", exact: true })).toBeDisabled();
  await page.getByLabel("Type amina to confirm").fill("amina");
  await page.getByRole("button", { name: "Delete user", exact: true }).click();
  await expect(page.getByText("@amina", { exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "../docs/screenshots/people-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
