import { test, expect } from "@playwright/test";
test("owner checkout, guest order, fulfilment and responsive storefront", async ({
  page,
  browser,
}) => {
  const runId = Date.now();
  const evidence = `../docs/screenshots/run-${runId}`;
  const customerName = `Browser smoke ${runId}`;
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await page.screenshot({
    path: `${evidence}/login.png`,
    fullPage: true,
  });
  await page
    .getByLabel("Username", { exact: true })
    .fill("kampala-corner-owner");
  await page.getByLabel("Password", { exact: true }).fill("DemoOnly!2026");
  await page.getByRole("button", { name: "Sign in →", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A good day for business." }),
  ).toBeVisible();
  await expect(page.getByText("Sales today", { exact: true })).toBeVisible();
  await page.screenshot({
    path: `${evidence}/dashboard.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Checkout", exact: false })
    .first()
    .click();
  await page.getByRole("button", { name: /Fresh Dairy Milk/ }).click();
  await page.getByLabel("Cash received").fill("5000");
  await page.getByRole("button", { name: "Complete sale →" }).click();
  await expect(page.getByText("Sale completed", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download receipt" }),
  ).toBeVisible();
  await page.screenshot({
    path: `${evidence}/checkout.png`,
    fullPage: true,
  });
  const guest = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const shop = await guest.newPage();
  await shop.goto("http://localhost:3000/shop/kampala-corner");
  await expect(
    shop.getByRole("heading", { name: "Kampala Corner Shop" }),
  ).toBeVisible();
  await shop.getByRole("button", { name: /Kakira Sugar/ }).click();
  await shop.getByLabel("Your name").fill(customerName);
  await shop.getByLabel("Phone number").fill("+256700123456");
  await shop.screenshot({
    path: `${evidence}/storefront-mobile.png`,
    fullPage: true,
  });
  expect(
    await shop.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await shop.getByRole("button", { name: "Place order →" }).click();
  await expect(shop).toHaveURL(/\/order\/[A-Za-z0-9_-]+/);
  await expect(shop.getByText("pending", { exact: true })).toBeVisible();
  await expect(
    shop.getByRole("heading", { name: "Kampala Corner Shop" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Orders/ })
    .first()
    .click();
  await page.getByRole("button", { name: "↻ Refresh" }).click();
  const card = page
    .locator(".order-grid .panel")
    .filter({ hasText: customerName })
    .first();
  await card.getByRole("button", { name: "Accept order" }).click();
  await card.getByRole("button", { name: "Start preparing" }).click();
  await card.getByRole("button", { name: "Mark ready" }).click();
  await card.getByRole("button", { name: "Record payment & complete" }).click();
  await expect(card.getByText("completed", { exact: true })).toBeVisible();
  await shop.reload();
  await expect(shop.getByText("completed", { exact: true })).toBeVisible();
  await guest.close();
});
