import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

// Requires the dedicated platform_browser API at 8015 and web portal at 3108.
// Never runs against the user's shop database as part of the default test suite.
test.skip(process.env.RUN_PLATFORM_E2E !== "1", "Uses the isolated platform browser database");

test("platform admin manages accounts, shops, catalog, stock, orders, refunds and settings", async ({ page, request }) => {
  test.setTimeout(90000);
  expect(process.env.PW_BASE_URL).toBe("http://localhost:3108");
  const suffix = Date.now().toString(), owner = "owner-" + suffix, worker = "staff-" + suffix;
  const shopName = "Portal Shop " + suffix, slug = "portal-" + suffix;
  const password = "BrowserTestOnly!7392";
  const nav = (name: string) => page.getByRole("navigation", { name: "Platform navigation" }).getByRole("button", { name, exact: true });
  const shopNav = (name: string) => page.getByRole("navigation", { name: "Shop administration" }).getByRole("button", { name, exact: true });
  await page.goto("/dashboard");
  await page.getByRole("textbox", { name: "Username", exact: true }).fill("portal-e2e-admin");
  await page.getByLabel("Password", { exact: true }).fill("PortalTestOnly!2026");
  await page.getByRole("button", { name: "Sign in →", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Platform overview" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your account is ready" })).toHaveCount(0);

  await nav("Users").click();
  for (const username of [owner, worker]) {
    const registration = await request.post("http://127.0.0.1:8015/api/v1/auth/accounts/", { data: { username, email: `${username}@example.com`, password, confirm_password: password } });
    expect(registration.status()).toBe(201);
    await page.getByLabel("Search accounts", { exact: true }).fill(username);
    await page.getByRole("button", { name: "Search accounts", exact: true }).click();
    await page.getByRole("button", { name: `Edit ${username}`, exact: true }).click();
    if (username === owner) {
      await page.getByLabel("First name", { exact: true }).fill("Amina");
      await page.getByLabel("Phone number", { exact: true }).fill("+256 700 123456");
      await page.getByLabel("Choose image", { exact: true }).setInputFiles({ name: "profile.png", mimeType: "image/png", buffer: await page.screenshot() });
      await page.getByRole("button", { name: "Upload selected image", exact: true }).click();
      await expect(page.getByRole("textbox", { name: "Image URL", exact: true })).toHaveValue(/\/profiles\/\d+\/.+\.png$/);
    }
    const saved = page.waitForResponse(r => /platform\/users\/\d+\/?$/.test(r.url()) && r.request().method() === "PATCH" && r.status() !== 308);
    await page.getByRole("button", { name: "Save account", exact: true }).click();
    expect((await saved).status()).toBe(200);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await nav("Shops").click();
  await page.getByRole("button", { name: "Create shop", exact: true }).click();
  await page.getByRole("textbox", { name: "Shop name", exact: true }).fill(shopName);
  await page.getByRole("textbox", { name: "Shop URL name", exact: true }).fill(slug);
  await page.getByRole("textbox", { name: "Owner username", exact: true }).fill(owner);
  const created = page.waitForResponse(r => /platform\/shops\/?$/.test(r.url()) && r.request().method() === "POST" && r.status() !== 308);
  await page.getByRole("button", { name: "Create shop", exact: true }).click();
  const shopResponse = await created;
  expect(shopResponse.status()).toBe(201);
  const shop = await shopResponse.json();
  await expect(page.getByRole("heading", { name: shopName, exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: "Publish storefront", exact: true }).check();
  await page.getByRole("spinbutton", { name: "Safety buffer", exact: true }).fill("0");
  await page.getByRole("button", { name: "Save shop details", exact: true }).click();
  await expect(page.getByText("Shop details saved", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "New branch name", exact: true }).fill("Warehouse");
  await page.getByRole("button", { name: "Add branch", exact: true }).click();
  await expect(page.getByText("Branch created", { exact: true })).toBeVisible();

  await shopNav("Access").click();
  await page.getByRole("button", { name: "Assign shop access", exact: true }).click();
  await page.getByRole("textbox", { name: "Existing username", exact: true }).fill(worker);
  await page.getByRole("combobox", { name: "Shop role", exact: true }).first().selectOption("manager");
  await page.getByRole("combobox", { name: "Assigned branch", exact: true }).first().selectOption({ label: "Warehouse" });
  await page.getByRole("dialog").getByRole("button", { name: "Assign shop access", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await shopNav("Catalog").click();
  await page.locator("summary").filter({ hasText: /^Manage categories$/ }).click();
  await page.getByRole("textbox", { name: "New category name", exact: true }).fill("Pantry");
  await page.getByRole("button", { name: "Add category", exact: true }).click();
  await expect(page.getByText("Category created", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  const editor = page.getByRole("region", { name: "Product editor" });
  await editor.getByRole("textbox", { name: "Product name", exact: true }).fill("E2E Beans");
  await editor.getByRole("textbox", { name: "SKU", exact: true }).fill("BEANS");
  await editor.getByRole("spinbutton", { name: "Price", exact: true }).fill("2500");
  await editor.getByRole("spinbutton", { name: "Cost", exact: true }).fill("1500");
  await editor.getByRole("combobox", { name: "Category", exact: true }).selectOption({ label: "Pantry" });
  await editor.getByRole("checkbox", { name: "Published", exact: true }).check();
  await editor.getByLabel("Choose image", { exact: true }).setInputFiles({ name: "test-product.png", mimeType: "image/png", buffer: await page.screenshot() });
  await editor.getByRole("button", { name: "Upload selected image", exact: true }).click();
  await expect(editor.getByRole("textbox", { name: "Image URL", exact: true })).toHaveValue(/\/businesses\/\d+\/.+\.png$/);
  const productSaved = page.waitForResponse(r => /products\/variant-set\/?$/.test(r.url()) && r.request().method() === "POST" && r.status() !== 308);
  await editor.getByRole("button", { name: "Save products", exact: true }).click();
  const productResponse = await productSaved;
  expect(productResponse.status()).toBe(200);
  const product = (await productResponse.json()).products[0];
  await expect(page.getByRole("heading", { name: "E2E Beans", exact: true })).toBeVisible();

  await shopNav("Stock").click();
  await page.getByRole("combobox", { name: "Stock product", exact: true }).selectOption(String(product.id));
  await page.getByRole("spinbutton", { name: "Quantity change", exact: true }).fill("10");
  await page.getByRole("textbox", { name: "Reason", exact: true }).fill("Opening delivery");
  let loseStockResponse = true;
  await page.route(/\/api\/backend\/platform\/shops\/\d+\/branches\/\d+\/stock\/adjust\/?$/, async route => {
    if (loseStockResponse) { loseStockResponse = false; await route.fetch(); await route.abort("failed"); }
    else await route.continue();
  });
  await page.getByRole("button", { name: "Record stock movement", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry saved operation", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Retry saved operation", exact: true }).click();
  await expect(page.getByText("Operation recorded", { exact: true })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "E2E Beans" })).toContainText("10");

  const orderResponse = await request.post(`http://127.0.0.1:8015/api/v1/shop/${slug}/`, { data: { client_id: randomUUID(), name: "Browser customer", phone: "+256700000000", lines: [{ product: product.id, quantity: 1 }] } });
  expect(orderResponse.status()).toBe(201);
  const order = await orderResponse.json();
  await shopNav("Orders").click();
  await page.getByRole("button", { name: `Update order #${order.id}`, exact: true }).click();
  await expect(page.getByRole("heading", { name: `Order #${order.id} · accepted`, exact: true })).toBeVisible();

  const tokenResponse = await request.post("http://127.0.0.1:8015/api/v1/auth/token/", { data: { username: owner, password } });
  expect(tokenResponse.status()).toBe(200);
  const token = (await tokenResponse.json()).access;
  const saleResponse = await request.post(`http://127.0.0.1:8015/api/v1/businesses/${shop.id}/sales/`, { headers: { Authorization: `Bearer ${token}` }, data: { client_id: randomUUID(), method: "cash", tendered: 5000, lines: [{ product: product.id, price: 2500, quantity: 2 }] } });
  expect(saleResponse.status()).toBe(201);
  const sale = await saleResponse.json();
  await shopNav("Sales").click();
  await page.locator("summary").filter({ hasText: `Sale #${sale.id} ·` }).click();
  await page.getByRole("spinbutton", { name: "Return quantity", exact: true }).fill("1");
  await page.getByRole("textbox", { name: "Return reason", exact: true }).fill("Customer changed mind");
  await page.getByRole("button", { name: `Record refund for sale #${sale.id}`, exact: true }).click();
  await expect(page.getByText("Operation recorded", { exact: true })).toBeVisible();
  await expect(page.getByText(/Return #.*Customer changed mind/)).toBeVisible();

  await shopNav("Details").click();
  await page.getByRole("checkbox", { name: "Suspend shop access and new orders", exact: true }).check();
  await page.getByRole("button", { name: "Save shop details", exact: true }).click();
  await expect(page.getByText("Shop details saved", { exact: true })).toBeVisible();
  expect((await request.get(`http://127.0.0.1:8015/api/v1/shop/${slug}/`)).status()).toBe(404);
  await page.getByRole("checkbox", { name: "Suspend shop access and new orders", exact: true }).uncheck();
  await page.getByRole("button", { name: "Save shop details", exact: true }).click();
  await expect(page.getByText("Shop details saved", { exact: true })).toBeVisible();

  await nav("Settings").click();
  await page.getByRole("textbox", { name: "Marketplace announcement", exact: true }).fill("Portal integration verified");
  await page.getByRole("checkbox", { name: "Accept new customer orders", exact: true }).uncheck();
  await page.getByRole("button", { name: "Save platform settings", exact: true }).click();
  await expect(page.getByText("Saved successfully", { exact: true })).toBeVisible();
  expect((await (await request.get("http://127.0.0.1:8015/api/v1/public/settings/")).json()).orders_enabled).toBe(false);
  await page.getByRole("checkbox", { name: "Accept new customer orders", exact: true }).check();
  await page.getByRole("button", { name: "Save platform settings", exact: true }).click();
  await expect(page.getByText("Saved successfully", { exact: true })).toBeVisible();

  await nav("Audit").click();
  await page.getByRole("searchbox", { name: "Search audit trail", exact: true }).fill(shopName);
  await page.getByRole("button", { name: "Search audit", exact: true }).click();
  await expect(page.locator("summary").filter({ hasText: "sale.returned" })).toBeVisible();
  await nav("Overview").click();
  await expect(page.getByRole("heading", { name: "Platform overview", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Sales from/ })).toBeVisible();
  await page.screenshot({ path: "../docs/screenshots/platform-admin-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "../docs/screenshots/platform-admin-mobile.png", fullPage: true });
});
