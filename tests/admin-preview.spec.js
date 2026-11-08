const { test, expect } = require('@playwright/test');

test('la preview del pannello admin risponde e carica la pagina', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Smoke test admin eseguito una volta sola');
  const adminBaseUrl = process.env.ADMIN_BASE_URL;

  test.skip(!adminBaseUrl, 'ADMIN_BASE_URL non configurato');

  const response = await page.goto(new URL('/src/index.html', adminBaseUrl).toString());
  expect(response, 'La preview admin deve restituire una risposta HTTP').not.toBeNull();
  expect(response.status()).toBeLessThan(400);
  await expect(page.locator('body')).not.toBeEmpty();
});
