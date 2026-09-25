import { test, expect } from "@playwright/test";

for (const isAdmin of [true, false]) {
  test(isAdmin ? "admin without a shop sees administration instead of workspace setup" : "ordinary account without a shop still sees workspace setup", async ({ page }) => {
    await page.route("**/api/backend/auth/me/", route => route.fulfill({ json: {
      id: 1, username: isAdmin ? "Admin" : "customer", memberships: [],
      is_staff: isAdmin, admin_url: isAdmin ? "http://localhost:8000/admin/" : null,
      can_manage_platform: isAdmin, can_manage_admins: isAdmin,
    } }));
    await page.route("**/api/backend/platform/reports/**", route => route.fulfill({ json: { shops: 0, suspended_shops: 0, users: 1, pending_orders: 0, from: "2026-09-01", to: "2026-09-23", totals: [] } }));
    await page.goto("/dashboard");
    if (isAdmin) {
      await expect(page.getByRole("heading", { name: "Platform overview" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Django maintenance" })).toHaveAttribute("href", "http://localhost:8000/admin/");
      await expect(page.getByRole("button", { name: "Create business" })).toHaveCount(0);
    } else {
      await expect(page.getByRole("heading", { name: "Your account is ready" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Open Django Admin" })).toHaveCount(0);
    }
  });
}
