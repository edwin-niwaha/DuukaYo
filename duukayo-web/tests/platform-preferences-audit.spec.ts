import { test, expect } from "@playwright/test";

for (const width of [1440, 390, 320]) test(`settings and audit controls at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  let settings = { name: "DuukaYo", support_email: "help@example.com", notice: "Delivery updates available from your shop.", orders_enabled: true, shop_registration_enabled: true };
  let saves = 0;
  const event = { id: 7, actor: "Amina Nabirye", shop: "Kampala Central", action: "shop.updated", reference: "shop:42", created_at: "2026-09-24T10:15:00Z", detail: { published: true, note: "A long detail " + "reference-".repeat(30) } };
  await page.route("**/api/backend/**", route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    if (path.includes("auth/me")) return route.fulfill({ json: { id: 1, username: "Admin", memberships: [], can_manage_platform: true, can_manage_admins: true } });
    if (path.includes("auth/session")) return route.fulfill({ json: { csrfToken: "test" } });
    if (path.includes("platform/settings")) {
      if (request.method() === "PATCH") {
        saves++;
        if (saves === 1) return route.fulfill({ status: 400, json: { support_email: ["Please retry saving your settings."] } });
        settings = request.postDataJSON();
      }
      return route.fulfill({ json: settings });
    }
    if (path.includes("platform/audit")) return route.fulfill({ json: { count: url.searchParams.get("q") === "missing" ? 0 : 2, next: url.searchParams.get("page") === "2" ? null : "/next", results: url.searchParams.get("q") === "missing" ? [] : [{ ...event, id: url.searchParams.get("page") === "2" ? 8 : 7 }] } });
    return route.fulfill({ json: { shops: 1, users: 1, pending_orders: 0, suspended_shops: 0, totals: [] } });
  });
  await page.goto("/dashboard");
  async function navigate(name: string) {
    if (width <= 850) await page.getByRole("button", { name: "Open navigation", exact: true }).click();
    await page.getByRole("navigation", { name: "Platform navigation" }).getByRole("button", { name, exact: true }).click();
  }
  await navigate("Settings");
  const save = page.getByRole("button", { name: "Save platform settings" });
  await expect(save).toBeDisabled();
  await page.getByLabel("Platform name", { exact: true }).fill("DuukaYo Market");
  await page.getByLabel("Marketplace announcement", { exact: true }).fill("New shops this week.");
  await page.getByRole("checkbox", { name: "Accept new customer orders", exact: true }).uncheck();
  await expect(page.locator(".announcement-preview")).toContainText("New shops this week.");
  await page.screenshot({ path: `../output/platform-settings-refined-${width}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await save.click();
  await expect(page.getByRole("main").getByText(/Please retry saving your settings/)).toBeVisible();
  await expect(page.getByLabel("Platform name", { exact: true })).toHaveValue("DuukaYo Market");
  await save.click();
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  expect(settings.orders_enabled).toBe(false);
  expect(settings.shop_registration_enabled).toBe(true);
  await page.getByLabel("Platform name", { exact: true }).fill("Discard me");
  await page.getByRole("button", { name: "Discard changes" }).click();
  await expect(page.getByLabel("Platform name", { exact: true })).toHaveValue("DuukaYo Market");
  while (await page.getByRole("button", { name: "Dismiss notification" }).count()) await page.getByRole("button", { name: "Dismiss notification" }).first().click();
  await navigate("Audit");
  await page.locator(".audit-event > summary").click();
  await expect(page.getByLabel("Details for event 7", { exact: true })).toContainText('"published": true');
  await page.screenshot({ path: `../output/audit-refined-${width}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await page.locator(".audit-event > summary").click();
  await expect(page.getByLabel("Details for event 8", { exact: true })).toBeVisible();
  await page.getByLabel("Search audit trail", { exact: true }).fill("missing");
  await page.getByRole("button", { name: "Search audit", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No matching events" })).toBeVisible();
  await page.getByRole("button", { name: "Show all events" }).click();
  await expect(page.locator(".audit-event")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Previous page", exact: true })).toBeDisabled();
});
