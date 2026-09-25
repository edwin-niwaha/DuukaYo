import { test, expect } from '@playwright/test';
for (const mobile of [false, true]) {
  test(`workspace logout on ${mobile ? 'phone' : 'desktop'}`, async ({ page }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    let signedIn = true; let logouts = 0;
    const profile = { id: 1, username: 'owner', memberships: [{ role: 'cashier', branch: 1, business: { id: 1, name: 'Local Shop', slug: 'local', currency: 'UGX', contact: '', delivery_enabled: false, delivery_fee: 0 } }] };
    await page.route('**/api/backend/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/auth/session/')) {
        if (route.request().method() === 'DELETE') { expect(route.request().headers()['x-csrftoken']).toBe('csrf'); signedIn = false; logouts++; }
        return route.fulfill({ json: { csrfToken: 'csrf' } });
      }
      if (path.endsWith('/auth/me/')) return route.fulfill({ status: signedIn ? 200 : 403, json: signedIn ? profile : { detail: 'Sign in' } });
      if (path.endsWith('/shops/')) return route.fulfill({ json: { shops: [] } });
      return route.fulfill({ json: [] });
    });
    await page.goto('/dashboard');
    const logout = page.getByRole('button', { name: 'Log out', exact: true });
    await expect(logout).toBeVisible(); await logout.click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: /Discover.*more/ })).toBeVisible();
    expect(logouts).toBe(1);
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  });
}
test('storefront logout reports failure and can be retried', async ({ page }) => {
  let signedIn = true; let attempts = 0;
  await page.route('**/api/backend/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me/')) return route.fulfill({ status: signedIn ? 200 : 403, json: signedIn ? { username: 'owner' } : { detail: 'Sign in' } });
    if (path.endsWith('/auth/session/')) {
      if (route.request().method() === 'DELETE') { if (++attempts === 1) return route.fulfill({ status: 503, json: { detail: 'Please retry logout' } }); signedIn = false; }
      return route.fulfill({ json: { csrfToken: 'csrf' } });
    }
    return route.fulfill({ json: { shops: [] } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page.locator('.nav-error')).toHaveText('Please retry logout');
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect.poll(() => attempts).toBe(2);
  await expect(page.getByRole('link', { name: 'Sign in ↗', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Log out', exact: true })).toHaveCount(0);
});
