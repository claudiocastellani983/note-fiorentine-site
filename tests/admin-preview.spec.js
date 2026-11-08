const { test, expect } = require('@playwright/test');

test('admin separato: login simulato, schede e caricamenti mock senza Supabase reale', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Simulazione admin eseguita una volta sola');
  const targets = [
    { label: 'preview Vercel', url: process.env.ADMIN_BASE_URL, local: false },
    { label: 'sorgente corrente del branch', url: process.env.LOCAL_ADMIN_BASE_URL, local: true }
  ].filter(target => target.url);
  test.skip(!targets.length, 'Nessun endpoint admin configurato');

  const realSupabaseRequests = [];
  const pageErrors = [];

  // Il client Supabase viene sostituito con un mock in memoria.
  await page.route('https://esm.sh/@supabase/supabase-js@2', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `
        let signedIn = false;
        export function createClient() {
          function query(table) {
            const q = {
              select() { return this; },
              eq() { return this; },
              order() { return this; },
              limit() { return this; },
              update() { window.__adminMockUpdates = (window.__adminMockUpdates || 0) + 1; return this; },
              upsert() { window.__adminMockUpserts = (window.__adminMockUpserts || 0) + 1; return this; },
              insert() { window.__adminMockInserts = (window.__adminMockInserts || 0) + 1; return this; },
              delete() { return this; },
              maybeSingle() {
                if (table === 'homepage_popup') return Promise.resolve({ data: { id: 'mock-popup', active: false, contact_email: 'test@example.invalid', media_files: [] }, error: null });
                if (table === 'site_content') return Promise.resolve({ data: { content_value: {} }, error: null });
                return Promise.resolve({ data: null, error: null });
              },
              single() { return Promise.resolve({ data: { id: 'mock-popup', active: true }, error: null }); },
              then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject); }
            };
            return q;
          }
          return {
            auth: {
              getSession: async () => ({ data: { session: signedIn ? { user: { id: 'mock-admin', email: 'test@example.invalid' } } : null }, error: null }),
              signInWithPassword: async () => { signedIn = true; return { error: null }; },
              signOut: async () => { signedIn = false; return { error: null }; }
            },
            rpc: async () => ({ data: true, error: null }),
            from: query,
            storage: {
              from: bucket => ({
                getPublicUrl: path => ({ data: { publicUrl: 'https://mock.invalid/' + path } }),
                upload: async () => {
                  window.__adminMockUploads = (window.__adminMockUploads || 0) + 1;
                  window.__adminMockBuckets = window.__adminMockBuckets || {};
                  window.__adminMockBuckets[bucket] = (window.__adminMockBuckets[bucket] || 0) + 1;
                  return { error: null };
                },
                remove: async () => ({ error: null }),
                list: async () => ({ data: [], error: null })
              })
            }
          };
        }
      `
    })
  );

  // Nessun accesso di rete al progetto Supabase reale durante il test.
  await page.route('https://nculgrwlzjitggjcgbpp.supabase.co/**', async route => {
    realSupabaseRequests.push({ method: route.request().method(), url: route.request().url() });
    await route.abort('blockedbyclient');
  });
  page.on('pageerror', error => pageErrors.push(error.message));

  for (const target of targets) {
  const response = await page.goto(new URL('/src/index.html', target.url).toString());
  expect(response).not.toBeNull();
  expect(response.status()).toBe(200);
  await expect(page).toHaveTitle(/Note Fiorentine.*Gestione/i);
  await expect(page.locator('#loginForm')).toBeVisible();
  if (target.local) {
    const source = await page.content();
    expect(source).not.toContain('Nessun supplemento');
    expect(source).not.toContain('Firenze · Ristorante toscano');
    expect(source).not.toContain('La tua serata a Firenze');
  }

  await page.locator('#nf-debug-toggle').click();
  await expect(page.locator('#nf-debug-output')).toContainText('Modulo amministrativo: AVVIATO');
  await page.locator('#nf-debug-close').click();

  await page.locator('#email').fill('test@example.invalid');
  await page.locator('#password').fill('mock-password');
  await page.locator('#loginForm button').click();
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#tabs button')).toHaveCount(9);
  await expect(page.locator('a.admin-tools-link')).toHaveAttribute('href', 'https://www.notefiorentine.it/gestione-immagini.html');

  // Scheda contenuti sito: caricamento editor e campi.
  await page.locator('[data-tab="Testi e grafica"]').click();
  await expect(page.locator('#siteEditorForm')).toBeVisible();
  await expect(page.locator('[data-site-field="hero_description"]')).toBeVisible();
  if (target.local) {
    await expect(page.locator('#siteEditorForm a[href="https://www.notefiorentine.it/"]')).toBeVisible();
  } else {
    await expect(page.locator('#siteEditorForm a')).toBeVisible();
  }

  // Scheda popup: PDF simulato e aggiornamento database simulato.
  await page.locator('[data-tab="Popup"]').click();
  await expect(page.locator('#popupAdminFiles')).toBeVisible();
  await page.locator('#popupAdminFiles').setInputFiles({
    name: 'menu-test.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n% mock test file\n%%EOF')
  });
  await page.locator('#savePopupAdmin').click();
  await expect.poll(() => page.evaluate(() => window.__adminMockUploads || 0)).toBe(1);
  await expect(page.locator('#popupAdminStatus')).toContainText('Impostazioni salvate');

  // Libreria media: caricamento immagine simulato.
  await page.locator('[data-tab="Immagini e popup"]').click();
  await expect(page.locator('#libraryFiles')).toBeVisible();
  await page.locator('#libraryFiles').setInputFiles({
    name: 'library-test.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pXcAAAAASUVORK5CYII=', 'base64')
  });
  await page.locator('#uploadLibrary').click();
  await expect.poll(() => page.evaluate(() => window.__adminMockUploads || 0)).toBe(2);

  // Gestione musica dal vivo: selezione file e inserimento record simulato.
  await page.locator('[data-tab="Musica dal vivo"]').click();
  await page.locator('#add').click();
  await expect(page.locator('#editForm')).toBeVisible();
  await page.locator('[name="title"]').fill('Performance di test');
  await page.locator('[name="video_file"]').setInputFiles({
    name: 'performance-test.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from('mock-video')
  });
  await page.locator('#editForm button[type="submit"]').click();
  await expect.poll(() => page.evaluate(() => window.__adminMockUploads || 0)).toBe(3);
  await expect.poll(() => page.evaluate(() => window.__adminMockInserts || 0)).toBe(1);
  await expect(page.locator('#status')).toContainText('Contenuto musicale salvato correttamente');

  const buckets = await page.evaluate(() => window.__adminMockBuckets || {});
  expect(buckets['site-media']).toBe(2);
  expect(buckets['performance-videos']).toBe(1);
  }
  expect(realSupabaseRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});
