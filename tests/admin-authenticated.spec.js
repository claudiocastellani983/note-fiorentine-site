const { test, expect } = require('@playwright/test');

// The login form contains test credentials: never store traces or screenshots for this test.
test.use({ trace: 'off', screenshot: 'off' });
const { createHash, randomUUID } = require('node:crypto');

const ADMIN_PREVIEW_URL = process.env.ADMIN_PREVIEW_URL;
const ADMIN_EMAIL = process.env.NF_TEST_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.NF_TEST_ADMIN_PASSWORD;
const SUPABASE_URL = 'https://iuxskknbopboynjlsxbk.supabase.co';
const SUPABASE_PUBLIC_KEY = 'sb_publishable_GTGiyYl8pZsY6letaozS2Q_dmh9vrRc';

test('Admin: ottimizzazione WebP reale su Supabase Test, riferimento aggiornato e originale integro', async ({ page }) => {
  test.skip(!ADMIN_PREVIEW_URL || !ADMIN_EMAIL || !ADMIN_PASSWORD,
    'Test autenticato eseguito soltanto nel job CI con credenziali di test.');
  test.setTimeout(240000);

  const host = new URL(ADMIN_PREVIEW_URL).hostname;
  expect(host).toMatch(/^note-fiorentine-admin-.+\.vercel\.app$/);

  const errors = [];
  const fixtureId = randomUUID();
  const fixturePath = 'optimizer-input/playwright-' + fixtureId + '.png';
  let fixtureCreated = false;
  let cleanupResult = null;
  let originalMeta = null;
  page.on('pageerror', error => errors.push(error.message));

  try {
    const response = await page.goto(ADMIN_PREVIEW_URL, { waitUntil: 'domcontentloaded' });
    expect(response && response.status()).toBe(200);
    await expect(page.locator('#loginForm')).toBeVisible();
    await page.locator('#email').fill(ADMIN_EMAIL);
    await page.locator('#password').fill(ADMIN_PASSWORD);
    await page.locator('#loginForm button').click();
    // The submit handler captures both values synchronously before its first await.
    // Clear them immediately so a failed assertion cannot expose credentials in artifacts.
    await page.locator('#email').fill('');
    await page.locator('#password').fill('');
    await expect(page.locator('#app')).toBeVisible({ timeout: 45000 });
    await expect(page.locator('#logout')).toBeVisible();
    await expect(page.locator('#login')).toBeHidden();

    // Remove only stale fixtures created by this Playwright suite, never real media.
    const staleCleanup = await page.evaluate(async ({ publicKey, supabaseUrl }) => {
      const storageKey = Object.keys(localStorage).find(key => key.endsWith('-auth-token'));
      if (!storageKey) return { ok: false, reason: 'sessione assente per pulizia fixture precedenti' };
      const session = JSON.parse(localStorage.getItem(storageKey) || '{}');
      if (!session.access_token) return { ok: false, reason: 'token assente per pulizia fixture precedenti' };
      const headers = { apikey: publicKey, Authorization: 'Bearer ' + session.access_token };
      const lookup = await fetch(supabaseUrl + '/rest/v1/site_images?select=id,image_path&category=eq.playwright-test', { headers });
      if (!lookup.ok) return { ok: false, reason: 'lettura fixture precedenti fallita: ' + lookup.status };
      const rows = await lookup.json();
      const paths = new Set(rows.map(row => row.image_path).filter(path =>
        /^optimizer-input\\/playwright-[0-9a-f-]+\\.png$/i.test(path || '')
      ));
      for (const prefix of ['optimizer-input', 'optimization-review/optimizer-input']) {
        const listing = await fetch(supabaseUrl + '/storage/v1/object/list/site-media', {
          method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefix, limit: 1000, offset: 0, search: 'playwright-' })
        });
        if (!listing.ok) return { ok: false, reason: 'ricerca file temporanei fallita: ' + listing.status };
        for (const entry of await listing.json()) {
          const name = entry.name || '';
          if (/^playwright-[0-9a-f-]+\\.png(?:\\.\\d+\\.webp)?$/i.test(name)) paths.add(prefix + '/' + name);
        }
      }
      for (const row of rows) {
        const removed = await fetch(supabaseUrl + '/rest/v1/site_images?id=eq.' + row.id, {
          method: 'DELETE', headers: { ...headers, Prefer: 'return=minimal' }
        });
        if (!removed.ok) return { ok: false, reason: 'rimozione fixture precedente fallita: ' + removed.status };
      }
      if (paths.size) {
        const removed = await fetch(supabaseUrl + '/storage/v1/object/site-media', {
          method: 'DELETE', headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefixes: [...paths] })
        });
        if (!removed.ok) return { ok: false, reason: 'rimozione file fixture precedenti fallita: ' + removed.status };
      }
      const verify = await fetch(supabaseUrl + '/rest/v1/site_images?select=id&category=eq.playwright-test', { headers });
      if (!verify.ok) return { ok: false, reason: 'verifica pulizia fixture fallita: ' + verify.status };
      if ((await verify.json()).length) return { ok: false, reason: 'sono rimaste righe fixture precedenti' };
      return { ok: true, removedRows: rows.length, removedObjects: paths.size };
    }, { publicKey: SUPABASE_PUBLIC_KEY, supabaseUrl: SUPABASE_URL });
    expect(staleCleanup.ok, 'Le fixture Playwright precedenti devono essere rimosse prima del test').toBe(true);

    const fixture = await page.evaluate(async ({ path, publicKey, supabaseUrl, id }) => {
      const storageKey = Object.keys(localStorage).find(key => key.endsWith('-auth-token'));
      if (!storageKey) throw new Error('Sessione Supabase autenticata non trovata.');
      const session = JSON.parse(localStorage.getItem(storageKey) || '{}');
      if (!session.access_token) throw new Error('Access token Supabase assente.');

      const width = 1200, height = 900;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas non disponibile.');
      const pixels = context.createImageData(width, height);
      let seed = 0x4e465031;
      for (let index = 0; index < pixels.data.length; index += 4) {
        seed = (1664525 * seed + 1013904223) >>> 0;
        pixels.data[index] = seed >>> 24;
        seed = (1664525 * seed + 1013904223) >>> 0;
        pixels.data[index + 1] = seed >>> 24;
        seed = (1664525 * seed + 1013904223) >>> 0;
        pixels.data[index + 2] = seed >>> 24;
        pixels.data[index + 3] = 255;
      }
      context.putImageData(pixels, 0, 0);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob || blob.size <= 1024 * 1024) throw new Error('Il PNG campione non supera 1 MB.');
      if (blob.size > 12 * 1024 * 1024) throw new Error('Il PNG campione supera 12 MB.');
      const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
      const sha256 = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');

      const upload = await fetch(supabaseUrl + '/storage/v1/object/site-media/' + path, {
        method: 'POST',
        headers: { apikey: publicKey, Authorization: 'Bearer ' + session.access_token,
          'Content-Type': 'image/png', 'x-upsert': 'false' },
        body: blob
      });
      if (!upload.ok) throw new Error('Upload campione Test fallito: ' + upload.status + ' ' + await upload.text());

      const record = {
        id,
        image_key: 'playwright_' + id.replace(/-/g, ''),
        label: 'Playwright test fixture',
        category: 'playwright-test',
        image_path: path,
        alt_text: 'Temporary automated test image',
        sort_order: 999999,
        is_active: false,
        focal_x: 50,
        focal_y: 50,
        focal_zoom: 1
      };
      const insert = await fetch(supabaseUrl + '/rest/v1/site_images', {
        method: 'POST',
        headers: { apikey: publicKey, Authorization: 'Bearer ' + session.access_token,
          'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(record)
      });
      if (!insert.ok) throw new Error('Creazione riferimento temporaneo fallita: ' + insert.status + ' ' + await insert.text());
      const rows = await insert.json();
      if (!rows.length || rows[0].image_path !== path) throw new Error('Il riferimento temporaneo non è stato verificato.');
      return { size: blob.size, sha256, row: rows[0] };
    }, { path: fixturePath, publicKey: SUPABASE_PUBLIC_KEY, supabaseUrl: SUPABASE_URL, id: fixtureId });

    fixtureCreated = true;
    originalMeta = { size: fixture.size, sha256: fixture.sha256 };

    await page.locator('#openImagesTab').click();
    await expect(page.locator('#storageOptimizer')).toBeVisible({ timeout: 45000 });
    const runButton = page.locator('#optimizerRun');
    await expect(runButton).toBeVisible();
    await expect(runButton).toBeEnabled();
    await runButton.click();

    await expect(page.locator('#optimizerStatus')).toContainText('Operazione conclusa', { timeout: 150000 });
    await expect(page.locator('#optimizerSummary')).toContainText('1 sostituite');

    const state = await page.evaluate(async ({ id, publicKey, supabaseUrl }) => {
      const storageKey = Object.keys(localStorage).find(key => key.endsWith('-auth-token'));
      const session = JSON.parse(localStorage.getItem(storageKey) || '{}');
      const result = await fetch(supabaseUrl + '/rest/v1/site_images?select=id,image_path&id=eq.' + id, {
        headers: { apikey: publicKey, Authorization: 'Bearer ' + session.access_token }
      });
      if (!result.ok) throw new Error('Verifica DB fallita: ' + result.status + ' ' + await result.text());
      return await result.json();
    }, { id: fixtureId, publicKey: SUPABASE_PUBLIC_KEY, supabaseUrl: SUPABASE_URL });

    expect(state).toHaveLength(1);
    const outputPath = state[0].image_path;
    expect(outputPath).toMatch(/^optimization-review\/optimizer-input\/playwright-.+\.png\.\d+\.webp$/);
    expect(outputPath).not.toBe(fixturePath);

    const originalUrl = SUPABASE_URL + '/storage/v1/object/public/site-media/' + fixturePath;
    const optimizedUrl = SUPABASE_URL + '/storage/v1/object/public/site-media/' + outputPath;
    const originalResponse = await page.request.get(originalUrl);
    expect(originalResponse.status(), 'L’originale deve restare disponibile').toBe(200);
    expect((originalResponse.headers()['content-type'] || '').toLowerCase()).toContain('image/png');
    const originalBytes = await originalResponse.body();
    expect(originalBytes.length).toBe(originalMeta.size);
    expect(createHash('sha256').update(originalBytes).digest('hex')).toBe(originalMeta.sha256);

    const optimizedResponse = await page.request.get(optimizedUrl);
    expect(optimizedResponse.status(), 'La copia WebP deve essere scaricabile').toBe(200);
    expect((optimizedResponse.headers()['content-type'] || '').toLowerCase()).toContain('image/webp');
    const optimizedBytes = await optimizedResponse.body();
    expect(optimizedBytes.length).toBeLessThan(originalBytes.length);
    expect(optimizedBytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(optimizedBytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
    expect(optimizedBytes.length / originalBytes.length).toBeLessThan(0.97);
  } finally {
    cleanupResult = await page.evaluate(async ({ id, fixturePath, publicKey, supabaseUrl }) => {
      const storageKey = Object.keys(localStorage).find(key => key.endsWith('-auth-token'));
      if (!storageKey) return { ok: false, reason: 'sessione Supabase assente durante il cleanup' };
      let session;
      try { session = JSON.parse(localStorage.getItem(storageKey) || '{}'); }
      catch { return { ok: false, reason: 'sessione Supabase non leggibile durante il cleanup' }; }
      if (!session.access_token) return { ok: false, reason: 'access token assente durante il cleanup' };
      const headers = { apikey: publicKey, Authorization: 'Bearer ' + session.access_token };

      const lookup = await fetch(supabaseUrl + '/rest/v1/site_images?select=image_path&id=eq.' + id, { headers });
      if (!lookup.ok) return { ok: false, reason: 'lettura fixture per cleanup fallita: ' + lookup.status };
      const rows = await lookup.json();
      const paths = new Set([fixturePath, rows[0]?.image_path].filter(Boolean));

      const reviewList = await fetch(supabaseUrl + '/storage/v1/object/list/site-media', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: 'optimization-review/optimizer-input', limit: 100,
          offset: 0, search: 'playwright-' + id })
      });
      if (!reviewList.ok) return { ok: false, reason: 'ricerca copie temporanee fallita: ' + reviewList.status };
      const entries = await reviewList.json();
      for (const entry of entries) {
        const name = entry.name || '';
        if (name.startsWith('playwright-' + id + '.png.') && name.endsWith('.webp')) {
          paths.add('optimization-review/optimizer-input/' + name);
        }
      }

      const rowDelete = await fetch(supabaseUrl + '/rest/v1/site_images?id=eq.' + id, {
        method: 'DELETE', headers: { ...headers, Prefer: 'return=minimal' }
      });
      if (!rowDelete.ok) return { ok: false, reason: 'rimozione riga temporanea fallita: ' + rowDelete.status + ' ' + await rowDelete.text() };

      const cleanupPaths = [...paths];
      const storageDelete = await fetch(supabaseUrl + '/storage/v1/object/site-media', {
        method: 'DELETE',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: cleanupPaths })
      });
      if (!storageDelete.ok) return { ok: false, reason: 'rimozione file temporanei fallita: ' + storageDelete.status + ' ' + await storageDelete.text() };
      return { ok: true, removedPaths: cleanupPaths };
    }, { id: fixtureId, fixturePath, publicKey: SUPABASE_PUBLIC_KEY, supabaseUrl: SUPABASE_URL })
      .catch(error => ({ ok: false, reason: error.message }));
  }

  expect(fixtureCreated, 'Il campione temporaneo deve essere stato creato').toBe(true);
  expect(cleanupResult && cleanupResult.ok,
    'Riga e file temporanei del test devono essere rimossi da Supabase Test').toBe(true);
  expect(errors, 'Errori JavaScript non gestiti nel pannello Admin').toEqual([]);
});
