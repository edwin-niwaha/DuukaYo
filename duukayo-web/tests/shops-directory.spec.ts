import { test, expect } from "@playwright/test";

for (const width of [1440, 390, 320]) test(`shop directory search and creation at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  let creates = 0;
  const shops = [
    { id: 1, name: "Kampala Corner", slug: "kampala", owners: ["Amina Nabirye"], published: true, branches: [{ id: 1, name: "Main" }, { id: 2, name: "North" }], currency: "UGX" },
    { id: 2, name: "The Everyday Store", slug: "everyday", owners: ["David"], suspended: true, branches: [{ id: 3, name: "Main" }], currency: "UGX" },
    { id: 3, name: "A new neighbourhood shop with a longer name", slug: "neighbourhood", owners: [], published: false, branches: [], currency: "UGX" },
  ];
  await page.route("**/api/backend/**", route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    if (path.includes("auth/me")) return route.fulfill({ json: { id: 1, username: "Admin", memberships: [], can_manage_platform: true, can_manage_admins: true } });
    if (path.includes("auth/session")) return route.fulfill({ json: { csrfToken: "test" } });
    if (path.endsWith("platform/shops/")) {
      if (request.method() === "POST") {
        creates++;
        expect(request.postDataJSON()).toMatchObject({ name: "New shop", slug: "new-shop", owner: "amina", branch_name: "Main branch" });
        return creates === 1 ? route.fulfill({ status: 400, json: { owner: ["Please retry creating this shop."] } }) : route.fulfill({ status: 201, json: { id: 4 } });
      }
      const results = shops.filter(shop => shop.name.toLowerCase().includes((url.searchParams.get("q") || "").toLowerCase()));
      return route.fulfill({ json: { count: results.length, results, next: null } });
    }
    if (path.endsWith("platform/shops/4/")) return route.fulfill({ json: { ...shops[0], id: 4, name: "New shop", slug: "new-shop", timezone: "Africa/Kampala", delivery_fee: 0, safety_buffer: 0 } });
    return route.fulfill({ json: { shops: 3, users: 2, pending_orders: 0, suspended_shops: 1, totals: [] } });
  });
  await page.goto("/dashboard");
  if (width <= 850) await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await page.getByRole("navigation", { name: "Platform navigation" }).getByRole("button", { name: "Shops", exact: true }).click();
  await expect(page.locator(".shop-management-card")).toHaveCount(3);
  await expect(page.getByRole("link", { name: /View .* storefront in a new tab/ })).toHaveCount(1);
  await page.screenshot({ path: `../output/shops-refined-${width}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("searchbox", { name: "Search shops", exact: true }).fill("missing");
  await page.getByRole("button", { name: "Search shops", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No shops found." })).toBeVisible();
  await page.getByRole("button", { name: "Show all shops" }).click();
  await expect(page.locator(".shop-management-card")).toHaveCount(3);
  await page.getByRole("button", { name: "Create shop", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Create shop", exact: true });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Create shop", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Create shop", exact: true }).click();
  await dialog.getByLabel("Shop name", { exact: true }).fill("New shop");
  await dialog.getByLabel("Shop URL name", { exact: true }).fill("new-shop");
  await dialog.getByLabel("Owner username", { exact: true }).fill("amina");
  await page.screenshot({ path: `../output/create-shop-refined-${width}.png`, fullPage: true });
  await dialog.getByRole("button", { name: "Create shop", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Please retry creating this shop.");
  await expect(dialog.getByLabel("Shop name", { exact: true })).toHaveValue("New shop");
  await dialog.getByRole("button", { name: "Create shop", exact: true }).click();
  await expect(page.getByRole("heading", { name: "New shop", exact: true })).toBeVisible();
  await expect(dialog).toHaveCount(0);
});
