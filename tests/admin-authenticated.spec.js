const { test, expect } = require('@playwright/test');
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
  expect(SUPABASE_URL).toContain('iuxskknbopboynjlsxbk');

  const errors = [];
  const fixtureId = randomUUID();
  const fixturePath = 'optimizer-input/playwright-' + fixtureId + '.png';
  let fixtureCreated = false;
  let outputPath = null;
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

    await expect(page.locator('#app')).toBeVisible({ timeout: 45000 });
    await expect(page.locator('#logout')).toBeVisible();
    await expect(page.locator('#login')).toBeHidden();

    // Il campione è un PNG >1 MB con rumore deterministico: deve consentire
    // una riduzione WebP misurabile e non usa file o dati di produzione.
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

      const bytes = await blob.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const sha256 = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');

      const upload = await fetch(supabaseUrl + '/storage/v1/object/site-media/' + path, {
        method: 'POST',
        headers: {
          apikey: publicKey,
          Authorization: 'Bearer ' + session.access_token,
          'Content-Type': 'image/png',
          'x-upsert': 'false'
        },
        body: blob
      });
      if (!upload.ok) throw new Error('Upload campione su Supabase Test fallito: ' + upload.status + ' ' + await upload.text());

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
        headers: {
          apikey: publicKey,
          Authorization: 'Bearer ' + session.access_token,
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify(record)
      });
      if (!insert.ok) throw new Error('Creazione riferimento temporaneo site_images fallita: ' + insert.status + ' ' + await insert.text());
      return { path, size: blob.size, sha256, row: await insert.json() };
    }, { path: fixturePath, publicKey: SUPABASE_PUBLIC_KEY, supabaseUrl: SUPABASE_URL, id: fixtureId });

    fixtureCreated = true;
    originalMeta = { size: fixture.size, sha256: fixture.sha256 };
    expect(fixture.row).toHaveLength(1);
    expect(fixture.row[0].image_path).toBe(fixturePath);

    await page.locator('#openImagesTab').click();
    await expect(page.locator('#storageOptimizer')).toBeVisible({ timeout: 45000 });
    const runButton = page.locator('#optimizerRun');
    await expect(runButton).toBeVisible();
    await expect(runButton).toBeEnabled();

    await runButton.click();
    await expect(page.locator('#optimizerStatus')).toContainText('Operazione conclusa', { timeout: 150000 });
    await expect(page.locator('#optimizerSummary')).toContainText('1 sostituite');

    const databaseState = await page.evaluate(async ({ id, publicKey, supabaseUrl }) => {
      const storageKey = Object.keys(localStorage).find(key => key.endsWith('-auth-token'));
      const session = JSON.parse(localStorage.getItem(storageKey) || '{}');
      const response = await fetch(supabaseUrl + '/rest/v1/site_images?select=id,image_path&id=eq.' + id, {
        headers: { apikey: publicKey, Authorization: 'Bearer ' + session.access_token }
      });
      if (!response.ok) throw new Error('Verifica riferimento DB fallita: ' + response.status + ' ' + await response.text());
      return await response.json();
    }, { id: fixtureId, publicKey: SUPABASE_PUBLIC_KEY, supabaseUrl: SUPABASE_URL });

    expect(databaseState).toHaveLength(1);
    outputPath = databaseState[0].image_path;
    expect(outputPath).toMatch(/^optimization-review\/optimizer-input\/playwright-.+\.png\.\d+\.webp$/);
    expect(outputPath).not.toBe(fixturePath);

    const originalUrl = SUPABASE_URL + '/storage/v1/object/public/site-media/' + fixturePath;
    const optimizedUrl = SUPABASE_URL + '/storage/v1/object/public/site-media/' + outputPath;
    const originalResponse = await page.request.get(originalUrl);
    expect(originalResponse.status(), 'L’originale deve restare disponibile dopo la sostituzione').toBe(200);
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
    // Rimuove esclusivamente la riga e i due oggetti creati da questo test.
    // Non tocca mai file preesistenti o tabelle/dati diversi dal fixture UUID.
    cleanupResult = await page.evaluate(async ({ id, fixturePath, publicKey, supabaseUrl }) => {
      const storageKey = Object.keys(localStorage).find(key => key.endsWith('-auth-token'));
      if (!storageKey) return { ok: false, reason: 'sessione Supabase assente durante il cleanup' };
      let session;
      try { session = JSON.parse(localStorage.getItem(storageKey) || '{}'); }
      catch { return { ok: false, reason: 'sessione Supabase non leggibile durante il cleanup' }; }
      if (!session.access_token) return { ok: false, reason: 'access token assente durante il cleanup' };

      const headers = { apikey: publicKey, Authorization: 'Bearer ' + session.access_token };
      let currentPath = null;
      const lookup = await fetch(supabaseUrl + '/rest/v1/site_images?select=image_path&id=eq.' + id, { headers });
      if (lookup.ok) {
        const rows = await lookup.json();
        currentPath = rows[0]?.image_path || null;
      }

      const rowDelete = await fetch(supabaseUrl + '/rest/v1/site_images?id=eq.' + id, {
        method: 'DELETE',
        headers: { ...headers, Prefer: 'return=minimal' }
      });
      if (!rowDelete.ok) return { ok: false, reason: 'rimozione riga fixture fallita: ' + rowDelete.status + ' ' + await rowDelete.text() };

      const prefixes = new Set([fixturePath, currentPath].filter(Boolean));
      // Se l’upload WebP è riuscito ma l’aggiornamento DB è fallito,
      // individua anche l’eventuale copia orfana generata da questa esecuzione.
      const reviewList = await fetch(supabaseUrl + '/storage/v1/object/list/site-media', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prefix: 'optimization-review/optimizer-input',
          limit: 100,
          offset: 0,
          search: 'playwright-' + id
        })
      });
      if (reviewList.ok) {
        const entries = await reviewList.json();
        for (const entry of entries) {
          if (new RegExp('^playwright-' + id + '\\.png\\.\\d+\\.webp        if (!storageDelete.ok) return { ok: false, reason: 'rimozione oggetti temporanei fallita: ' + storageDelete.status + ' ' + await storageDelete.text() };
      }
      return { ok: true, removedPaths: cleanupPaths };
    }, { id: fixtureId, fixturePath, publicKey: SUPABASE_PUBLIC_KEY, supabaseUrl: SUPABASE_URL }).catch(error => ({ ok: false, reason: error.message }));
  }

  expect(fixtureCreated, 'Il campione temporaneo deve essere stato creato').toBe(true);
  expect(cleanupResult && cleanupResult.ok,
    'Riga e file temporanei del test devono essere rimossi da Supabase Test').toBe(true);
  expect(errors, 'Errori JavaScript non gestiti nel pannello Admin').toEqual([]);
});
).test(entry.name || '')) {
            prefixes.add('optimization-review/optimizer-input/' + entry.name);
          }
        }
      }
      const cleanupPaths = [...prefixes];
      if (cleanupPaths.length) {
        const storageDelete = await fetch(supabaseUrl + '/storage/v1/object/site-media', {
          method: 'DELETE',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefixes: cleanupPaths })
        });
        if (!storageDelete.ok) return { ok: false, reason: 'rimozione oggetti temporanei fallita: ' + storageDelete.status + ' ' + await storageDelete.text() };
      }
      return { ok: true, removedPaths: prefixes };
    }, { id: fixtureId, fixturePath, publicKey: SUPABASE_PUBLIC_KEY, supabaseUrl: SUPABASE_URL }).catch(error => ({ ok: false, reason: error.message }));
  }

  expect(fixtureCreated, 'Il campione temporaneo deve essere stato creato').toBe(true);
  expect(cleanupResult && cleanupResult.ok,
    'Riga e file temporanei del test devono essere rimossi da Supabase Test').toBe(true);
  expect(errors, 'Errori JavaScript non gestiti nel pannello Admin').toEqual([]);
});
