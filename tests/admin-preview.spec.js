const { test, expect } = require('@playwright/test');

test('admin separato: pagina, accesso e diagnostica si caricano senza scrivere su Supabase', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Smoke test admin eseguito una volta sola');
  const adminBaseUrl = process.env.ADMIN_BASE_URL;
  test.skip(!adminBaseUrl, 'ADMIN_BASE_URL non configurato');

  await page.route('https://nculgrwlzjitggjcgbpp.supabase.co/**', route => route.abort('blockedbyclient'));
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  const response = await page.goto(new URL('/src/index.html', adminBaseUrl).toString());
  expect(response, 'La preview admin deve restituire una risposta HTTP').not.toBeNull();
  expect(response.status()).toBe(200);
  await expect(page).toHaveTitle(/Note Fiorentine.*Gestione/i);
  await expect(page.locator('#loginForm')).toBeVisible();
  await expect(page.locator('#email')).toHaveAttribute('type', 'email');
  await expect(page.locator('#password')).toHaveAttribute('type', 'password');
  await expect(page.locator('#nf-debug-toggle')).toBeVisible();

  await page.locator('#nf-debug-toggle').click();
  await expect(page.locator('#nf-debug-panel')).toBeVisible();
  await expect(page.locator('#nf-debug-output')).toContainText('Modulo amministrativo: AVVIATO');
  await expect(page.locator('a.admin-tools-link')).toHaveAttribute('href', 'https://www.notefiorentine.it/gestione-immagini.html');
  expect(pageErrors, 'La pagina admin non deve generare eccezioni JavaScript').toEqual([]);
});
