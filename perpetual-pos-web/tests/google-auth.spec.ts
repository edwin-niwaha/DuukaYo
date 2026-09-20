import { test, expect } from "@playwright/test";

test.use({ baseURL: process.env.GOOGLE_TEST_URL || "http://localhost:3101" });
test.skip(
  !process.env.GOOGLE_TEST_URL,
  "Start the web app with NEXT_PUBLIC_GOOGLE_CLIENT_ID and set GOOGLE_TEST_URL.",
);

test("Google login submits CSRF, onboards a new user, and allows sign-out", async ({
  page,
}) => {
  let signedIn = false;
  let submissions = 0;
  let businessCreated = false;
  await page.route("https://accounts.google.com/gsi/client", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.google = { accounts: { id: {
      initialize(options) { this.callback = options.callback; },
      renderButton(element) { const button = document.createElement('button'); button.textContent = 'Continue with Google'; button.type = 'button'; button.onclick = () => this.callback({credential: 'test-id-token'}); element.append(button); }
    } } };`,
    }),
  );
  await page.route("**/api/backend/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("auth/me/")) {
      await route.fulfill({
        status: signedIn ? 200 : 403,
        json: signedIn
          ? { id: 1, username: "google_user", memberships: [] }
          : { detail: "Sign in" },
      });
    } else if (path.endsWith("auth/google/session/")) {
      expect(request.headers()["x-csrftoken"]).toBe("csrf-test");
      expect(request.postDataJSON()).toEqual({ id_token: "test-id-token" });
      submissions++;
      signedIn = true;
      await route.fulfill({ json: { csrfToken: "csrf-rotated" } });
    } else if (path.endsWith("auth/session/")) {
      if (request.method() === "DELETE") signedIn = false;
      await route.fulfill({ json: { csrfToken: "csrf-test" } });
    } else if (path.endsWith("businesses/")) {
      expect(request.postDataJSON()).toEqual({
        name: "Test Shop",
        slug: "test-shop",
      });
      businessCreated = true;
      await route.fulfill({ status: 201, json: { id: 1 } });
    } else {
      await route.fulfill({ status: 404, json: {} });
    }
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(
    page.getByRole("heading", { name: "Set up your workspace" }),
  ).toBeVisible();
  expect(submissions).toBe(1);
  await page.getByLabel("Business name").fill("Test Shop");
  await page.getByLabel("Shop URL name").fill("test-shop");
  await page
    .getByRole("button", { name: "Create business", exact: true })
    .click();
  await expect.poll(() => businessCreated).toBe(true);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();
});

test("Google rejection shows a recoverable error", async ({ page }) => {
  await page.route("https://accounts.google.com/gsi/client", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.google = { accounts: { id: {
      initialize(options) { this.callback = options.callback; },
      renderButton(element) { const button = document.createElement('button'); button.textContent = 'Continue with Google'; button.onclick = () => this.callback({credential: 'expired'}); element.append(button); }
    } } };`,
    }),
  );
  await page.route("**/api/backend/**", (route) =>
    route.fulfill({
      status: route.request().url().endsWith("auth/session/") ? 200 : 403,
      json: route.request().url().endsWith("auth/session/")
        ? { csrfToken: "csrf-test" }
        : { detail: "Invalid or expired Google sign-in token." },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Invalid or expired" }),
  ).toContainText("Invalid or expired");
  await expect(
    page.getByRole("button", { name: "Sign in →", exact: true }),
  ).toBeEnabled();
});
