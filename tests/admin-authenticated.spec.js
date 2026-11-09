const { test, expect } = require('@playwright/test');

const ADMIN_PREVIEW_URL = process.env.ADMIN_PREVIEW_URL;
const ADMIN_EMAIL = process.env.NF_TEST_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.NF_TEST_ADMIN_PASSWORD;
const SUPABASE_URL = 'https://iuxskknbopboynjlsxbk.supabase.co';
const SUPABASE_PUBLIC_KEY = 'sb_publishable_GTGiyYl8pZsY6letaozS2Q_dmh9vrRc';

test('Admin: login autorizzato, gestione immagini e upload reale su Supabase Test', async ({ page }) => {
  expect(ADMIN_PREVIEW_URL, 'ADMIN_PREVIEW_URL deve puntare alla Preview Admin').toBeTruthy();
  expect(ADMIN_EMAIL, 'Secret NF_TEST_ADMIN_EMAIL mancante o vuoto').toBeTruthy();
  expect(ADMIN_PASSWORD, 'Secret NF_TEST_ADMIN_PASSWORD mancante o vuoto').toBeTruthy();

  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto(ADMIN_PREVIEW_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#loginForm')).toBeVisible();
  await page.locator('#email').fill(ADMIN_EMAIL);
  await page.locator('#password').fill(ADMIN_PASSWORD);
  await page.locator('#loginForm button[type="submit"]').click();

  await expect(page.locator('#app')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('#logout')).toBeVisible();
  await expect(page.locator('#login')).toBeHidden();

  const tabNames = await page.locator('#tabs button').allTextContents();
  expect(tabNames.length, 'Le schede amministrative devono essere caricate').toBeGreaterThan(0);

  await page.locator('#openImagesTab').click();
  await expect(page.locator('#uploadLibrary')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#libraryFiles')).toBeVisible();

  const initialPaths = await page.locator('#libraryItems input[readonly]').evaluateAll(nodes => nodes.map(n => n.value));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j0ioAAAAASUVORK5CYII=', 'base64');
  let uploadedPath = null;
  let cleanupResult = null;

  try {
    await page.locator('#libraryFiles').setInputFiles({
      name: 'playwright-admin-check.png',
      mimeType: 'image/png',
      buffer: png
    });
    await page.locator('#uploadLibrary').click();
    await expect(page.locator('#libraryStatus')).toContainText('File caricati correttamente.', { timeout: 30000 });

    await expect.poll(async () => {
      const paths = await page.locator('#libraryItems input[readonly]').evaluateAll(nodes => nodes.map(n => n.value));
      uploadedPath = paths.find(path => path.startsWith('library/') && !initialPaths.includes(path)) || null;
      return uploadedPath;
    }, { timeout: 30000 }).toBeTruthy();
  } finally {
    if (uploadedPath) {
      cleanupResult = await page.evaluate(async ({ path, publicKey, supabaseUrl }) => {
        const storageKey = Object.keys(localStorage).find(key => key.endsWith('-auth-token'));
        if (!storageKey) return { ok: false, reason: 'sessione Supabase non trovata per il cleanup' };
        let session;
        try { session = JSON.parse(localStorage.getItem(storageKey) || '{}'); }
        catch { return { ok: false, reason: 'sessione Supabase non leggibile' }; }
        if (!session.access_token) return { ok: false, reason: 'access token non disponibile per il cleanup' };
        const response = await fetch(supabaseUrl + '/storage/v1/object/site-media', {
          method: 'DELETE',
          headers: {
            apikey: publicKey,
            Authorization: 'Bearer ' + session.access_token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ prefixes: [path] })
        });
        return { ok: response.ok, status: response.status, body: response.ok ? '' : await response.text() };
      }, { path: uploadedPath, publicKey: SUPABASE_PUBLIC_KEY, supabaseUrl: SUPABASE_URL });
    }
  }

  expect(uploadedPath, 'Il file di test deve comparire nella libreria Storage').toBeTruthy();
  expect(cleanupResult && cleanupResult.ok, 'Il file temporaneo deve essere rimosso da Supabase Storage').toBe(true);
  expect(pageErrors, 'Errori JavaScript non gestiti nel pannello Admin').toEqual([]);
});
