const { test, expect } = require('@playwright/test');

test('gestione immagini: struttura protetta e controlli media presenti senza backend reale', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Smoke test gestione immagini eseguito una volta sola');

  const baseUrl = process.env.PLAYWRIGHT_BASE_URL;
  test.skip(!baseUrl, 'PLAYWRIGHT_BASE_URL non configurato');

  const supabaseRequests = [];
  const pageErrors = [];

  // La pagina viene caricata in preview, ma nessuna richiesta raggiunge Supabase.
  await page.route('https://nculgrwlzjitggjcgbpp.supabase.co/**', async route => {
    supabaseRequests.push({
      method: route.request().method(),
      url: route.request().url()
    });
    await route.abort('blockedbyclient');
  });

  page.on('pageerror', error => pageErrors.push(error.message));

  const response = await page.goto(new URL('/gestione-immagini.html', baseUrl).toString());
  expect(response, 'La pagina gestione immagini deve rispondere').not.toBeNull();
  expect(response.status()).toBeLessThan(400);

  await expect(page).toHaveTitle(/Gestione immagini.*Note Fiorentine/i);
  await expect(page.getByRole('heading', { name: 'Accesso amministratore' })).toBeVisible();
  await expect(page.locator('#email')).toHaveAttribute('type', 'email');
  await expect(page.locator('#password')).toHaveAttribute('type', 'password');
  await expect(page.locator('#loginBtn')).toBeVisible();

  // Le aree operative restano nascoste finché non si effettua l'accesso.
  await expect(page.locator('#manager')).toBeHidden();
  await expect(page.locator('#homepagePopupControl')).toBeHidden();
  await expect(page.locator('#galleryAdminPanel')).toBeHidden();
  await expect(page.locator('#artistMediaAdminPanel')).toBeHidden();

  // Nessuna operazione di login, upload, modifica o pubblicazione viene eseguita.
  expect(supabaseRequests).toEqual([]);
  expect(pageErrors).toEqual([]);

  const managerHtml = await page.content();
  expect(managerHtml).toContain('Il file originale resta conservato come copia di sicurezza.');
  const eventSaveStart = managerHtml.indexOf('async function saveEvent()');
  const eventSaveEnd = managerHtml.indexOf("$('eventSaveBtn').addEventListener", eventSaveStart);
  const eventSaveSource = managerHtml.slice(eventSaveStart, eventSaveEnd);
  expect(eventSaveSource).toContain('dbWriteSucceeded');
  expect(eventSaveSource).not.toContain('remove([existing.image_path])');
});
