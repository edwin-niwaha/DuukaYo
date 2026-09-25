import { test, expect } from "@playwright/test";

for (const width of [1440, 390]) {
  test(`validation toasts are readable and dismissible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let writes = 0;
    await page.route("**/api/backend/**", route => {
      const request = route.request();
      if (request.url().includes("auth/me")) return route.fulfill({ status: 401, json: { detail: "Sign in" } });
      if (request.method() === "GET") return route.fulfill({ json: { csrfToken: "test" } });
      writes++;
      return route.fulfill({ status: 400, json: { username: ["This account could not be found."], code: "validation_error" } });
    });
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Sign in →", exact: true }).click();
    const notifications = page.getByRole("region", { name: "Notifications" });
    await expect(notifications.getByRole("alert")).toContainText("Username");
    await expect(page.getByLabel("Username", { exact: true })).toBeFocused();
    expect(writes).toBe(0);
    await notifications.getByRole("button", { name: "Dismiss notification" }).click();
    await expect(notifications.getByRole("alert")).toHaveCount(0);
    await page.getByLabel("Username", { exact: true }).fill("missing");
    await page.getByLabel("Password", { exact: true }).fill("incorrect");
    await page.getByRole("button", { name: "Sign in →", exact: true }).click();
    await expect(notifications.getByRole("alert")).toContainText("This account could not be found.");
    const bounds = await notifications.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `../output/validation-toast-${width}.png`, fullPage: true });
  });
}
