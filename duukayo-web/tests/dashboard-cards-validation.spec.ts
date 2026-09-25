import { test, expect } from "@playwright/test";

for (const width of [1440, 390]) {
  test(`dashboard cards and dialog validation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    let writes = 0;
    await page.route("**/api/backend/**", route => {
      const req = route.request(), path = new URL(req.url()).pathname;
      if (path.includes("auth/me")) return route.fulfill({ json: { id: 1, username: "Admin", memberships: [], can_manage_platform: true, can_manage_admins: true } });
      if (path.includes("auth/session")) return route.fulfill({ json: { csrfToken: "test" } });
      if (path.includes("platform/reports")) return route.fulfill({ json: { shops: 24, suspended_shops: 2, users: 148, pending_orders: 12, from: "2026-09-01", to: "2026-09-23", totals: [{ currency: "UGX", sales: 4250000, refunds: 120000, net: 4130000, transactions: 86 }] } });
      if (path.includes("platform/users") && req.method() === "PATCH") { writes++; return route.fulfill({ status: 400, json: { phone: ["Enter a valid phone number."], code: "validation_error" } }); }
      if (path.includes("platform/shops")) return route.fulfill({ json: { count: 2, next: null, results: [{ id: 1, name: "Kampala Corner", slug: "kampala-corner", owners: ["Amina"], published: true }, { id: 2, name: "The Everyday Store", slug: "everyday", owners: ["David"], suspended: true }] } });
      return route.fulfill({ json: { count: 1, next: null, results: [{ id: 2, username: "test-user", email: "test@example.com", is_active: true, shop_access: [] }] } });
    });
    await page.goto("/dashboard");
    await expect(page.locator(".overview-metrics .metric-card")).toHaveCount(4);
    await expect(page.locator(".overview-metrics .metric-card svg")).toHaveCount(4);
    await expect(page.getByText("UGX 4,130,000", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `../output/dashboard-cards-${width}.png`, fullPage: true });
    if (width > 850) {
      await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
      await expect(page.getByRole("button", { name: "Expand sidebar", exact: true })).toHaveAttribute("aria-expanded", "false");
      await expect(page.locator(".platform-sidebar")).toHaveCSS("width", "76px");
      await page.screenshot({ path: "../output/dashboard-collapsed-1440.png", fullPage: true });
      await page.getByRole("button", { name: "Expand sidebar", exact: true }).click();
    } else {
      await page.getByRole("button", { name: "Open navigation", exact: true }).click();
      await expect(page.getByRole("button", { name: "Close navigation", exact: true })).toBeFocused();
      await page.screenshot({ path: "../output/dashboard-drawer-390.png" });
      await page.keyboard.press("Shift+Tab");
      await expect(page.getByRole("button", { name: "Audit", exact: true })).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(page.getByRole("button", { name: "Close navigation", exact: true })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: "Open navigation", exact: true })).toBeFocused();
      await page.getByRole("button", { name: "Open navigation", exact: true }).click();
    }
    await page.getByRole("navigation", { name: "Platform navigation" }).getByRole("button", { name: "Shops", exact: true }).click();
    await expect(page.locator(".shop-management-card")).toHaveCount(2);
    await page.screenshot({ path: `../output/dashboard-shops-${width}.png`, fullPage: true });
    if (width <= 850) await page.getByRole("button", { name: "Open navigation", exact: true }).click();
    await page.getByRole("navigation", { name: "Platform navigation" }).getByRole("button", { name: "Users", exact: true }).click();
    await expect(page.getByRole("button", { name: "Add user", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Edit test-user", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Edit test-user" });
    await expect(dialog.locator('input[type="password"]')).toHaveCount(0);
    await dialog.getByLabel("Image URL", { exact: true }).fill("not-a-url");
    await dialog.getByRole("button", { name: "Save account", exact: true }).click();
    const toast = dialog.getByRole("alert");
    await expect(toast).toContainText("Image URL:");
    await expect(dialog.getByLabel("Image URL", { exact: true })).toBeFocused();
    expect(writes).toBe(0);
    expect(await toast.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= innerHeight && element.contains(document.elementFromPoint(rect.x + 25, rect.y + 25));
    })).toBe(true);
    await page.screenshot({ path: `../output/dialog-validation-${width}.png`, fullPage: true });
    await toast.getByRole("button", { name: "Dismiss notification" }).click();
    await dialog.getByLabel("Image URL", { exact: true }).fill("");
    await dialog.getByRole("button", { name: "Save account", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("Enter a valid phone number.");
    expect(writes).toBe(1);
    await dialog.getByRole("button", { name: "Close editor" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Notifications" })).toHaveCount(1);
  });
}
