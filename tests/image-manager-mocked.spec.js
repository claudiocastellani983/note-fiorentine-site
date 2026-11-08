const { test, expect } = require('@playwright/test');

test('gestione immagini: UI autenticata simulata, senza chiamate o scritture reali', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Simulazione admin eseguita una volta sola');

  const baseUrl = process.env.PLAYWRIGHT_BASE_URL;
  test.skip(!baseUrl, 'PLAYWRIGHT_BASE_URL non configurato');

  const realSupabaseRequests = [];
  const pageErrors = [];

  // Sostituisce il client Supabase con un mock in memoria: nessun account o dato reale.
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `
        export function createClient() {
          function query(table) {
            const q = {
              select() { return this; },
              eq() { return this; },
              order() { return this; },
              limit() { return this; },
              update() { window.__mockDbUpdates = (window.__mockDbUpdates || 0) + 1; return this; },
              insert() { return Promise.resolve({ data: null, error: null }); },
              delete() { return this; },
              maybeSingle() {
                if (table === 'admin_users') return Promise.resolve({ data: { user_id: 'mock-admin' }, error: null });
                if (table === 'homepage_popup') return Promise.resolve({ data: { id: 'mock-popup', active: false, updated_at: new Date().toISOString() }, error: null });
                if (table === 'site_images') return Promise.resolve({ data: { image_key: 'mock-slot', image_path: 'mock/file.png' }, error: null });
                return Promise.resolve({ data: null, error: null });
              },
              single() { return Promise.resolve({ data: { id: 'mock-popup', active: true, updated_at: new Date().toISOString() }, error: null }); },
              then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject); }
            };
            return q;
          }
          return {
            auth: {
              getSession: async () => ({ data: { session: { user: { id: 'mock-admin', email: 'test@example.invalid' } } }, error: null }),
              signInWithPassword: async () => ({ error: null }),
              signOut: async () => ({ error: null })
            },
            from: query,
            storage: { from: () => ({ getPublicUrl: path => ({ data: { publicUrl: 'https://mock.invalid/' + path } }), upload: async () => { window.__mockStorageUploads = (window.__mockStorageUploads || 0) + 1; return { error: null }; }, remove: async () => ({ error: null }) }) }
          };
        }
      `
    })
  );

  // Ulteriore barriera: ogni tentativo di raggiungere il progetto reale viene bloccato e registrato.
  await page.route('https://nculgrwlzjitggjcgbpp.supabase.co/**', async route => {
    realSupabaseRequests.push({ method: route.request().method(), url: route.request().url() });
    await route.abort('blockedbyclient');
  });
  page.on('pageerror', error => pageErrors.push(error.message));

  const response = await page.goto(new URL('/gestione-immagini.html', baseUrl).toString());
  expect(response).not.toBeNull();
  expect(response.status()).toBeLessThan(400);

  await expect(page.locator('#manager')).toBeVisible();
  await expect(page.locator('#homepagePopupControl')).toBeVisible();
  await expect(page.locator('#galleryAdminPanel')).toBeVisible();
  await expect(page.locator('#artistMediaAdminPanel')).toBeVisible();
  await expect(page.locator('#imageCards article')).toHaveCount(7);
  await expect(page.locator('[data-gallery-admin]')).toHaveCount(3);
  await expect(page.locator('[data-artist-media]')).toHaveCount(2);
  await expect(page.locator('#popupVisibilityBtn')).toBeEnabled();

  // Verifica che i selettori file siano presenti, senza selezionare né caricare file.
  await expect(page.locator('#galleryAdminPanel input[type="file"]')).toHaveCount(3);
  await expect(page.locator('#artistMediaAdminPanel input[type="file"]')).toHaveCount(2);

  // Il toggle viene provato solo contro il client fittizio: nessuna scrittura sul backend reale.
  await page.locator('#popupVisibilityBtn').click();
  await expect(page.locator('#popupVisibilityStatus')).toContainText('Popup attualmente VISIBILE');
  await expect(page.locator('#popupVisibilityBtn')).toHaveText('Nascondi popup');

  // Selezione e sostituzione provate con un PNG in memoria e storage/database simulati.
  const firstImageCard = page.locator('#imageCards article').first();
  await firstImageCard.locator('input[type="file"]').setInputFiles({
    name: 'test-image.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pXcAAAAASUVORK5CYII=', 'base64')
  });
  await expect(firstImageCard.locator('.selected-file')).toContainText('test-image.png');
  await expect(firstImageCard.locator('.cropbox')).toBeVisible();
  await firstImageCard.getByRole('button', { name: 'Sostituisci immagine' }).click();
  await expect.poll(() => page.evaluate(() => window.__mockStorageUploads || 0)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__mockDbUpdates || 0)).toBeGreaterThan(0);

  expect(realSupabaseRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});
