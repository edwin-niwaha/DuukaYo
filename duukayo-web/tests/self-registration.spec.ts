import { test, expect } from "@playwright/test";
for (const width of [1440, 390]) {
  test(`self-registration at ${width}px submits only account details`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const bodies: Record<string, unknown>[] = [];
    await page.route("**/api/backend/**", route => {
      if (route.request().url().includes("auth/session")) return route.fulfill({ json: { csrfToken: "test" } });
      bodies.push(route.request().postDataJSON());
      return route.fulfill({ status: 201, json: { detail: "Account created. Sign in to continue." } });
    });
    await page.goto("/signup");
    await page.getByLabel("Username", { exact: true }).fill("new-person");
    await page.getByLabel("Email", { exact: true }).fill("person@example.com");
    await page.getByLabel("Password", { exact: true }).fill("Personal-passphrase-895");
    await page.getByLabel("Confirm password", { exact: true }).fill("Different-passphrase-985");
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(page.getByRole("region", { name: "Notifications" }).getByRole("alert")).toContainText("Passwords do not match");
    expect(bodies).toHaveLength(0);
    await page.getByLabel("Confirm password", { exact: true }).fill("Personal-passphrase-895");
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(page.getByRole("link", { name: "Continue to sign in" })).toBeVisible();
    expect(bodies).toHaveLength(1);
    expect(Object.keys(bodies[0]).sort()).toEqual(["confirm_password", "email", "password", "username"]);
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
