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
        /^optimizer-input\/playwright-[0-9a-f-]+\.png$/i.test(path || '')
      ));
      for (const prefix of ['optimizer-input', 'optimization-review/optimizer-input']) {
        const listing = await fetch(supabaseUrl + '/storage/v1/object/list/site-media', {
          method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefix, limit: 1000, offset: 0, search: 'playwright-' })
        });
        if (!listing.ok) return { ok: false, reason: 'ricerca file temporanei fallita: ' + listing.status };
        for (const entry of await listing.json()) {
          const name = entry.name || '';
          if (/^playwright-[0-9a-f-]+\.png(?:\.\d+\.webp)?$/i.test(name)) paths.add(prefix + '/' + name);
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


test('Admin: CRUD completo dei video musicali su Supabase Test', async ({ page }) => {
  test.skip(!ADMIN_PREVIEW_URL || !ADMIN_EMAIL || !ADMIN_PASSWORD,
    'Test CRUD autenticato eseguito soltanto nel job CI con credenziali di test.');
  test.setTimeout(180000);
  const host = new URL(ADMIN_PREVIEW_URL).hostname;
  expect(host).toMatch(/^note-fiorentine-admin-.+\.vercel\.app$/);
  const errors = [];
  const fixtureTitle = 'PLAYWRIGHT CRUD ' + randomUUID();
  let fixtureId = null;
  let uploadedPath = null;
  page.on('pageerror', error => errors.push(error.message));

  const api = async (method, path, body) => page.evaluate(async ({ method, path, body, publicKey, supabaseUrl }) => {
    const storageKey = Object.keys(localStorage).find(key => key.endsWith('-auth-token'));
    const session = JSON.parse(localStorage.getItem(storageKey) || '{}');
    if (!session.access_token) throw new Error('Sessione Supabase assente durante il test CRUD.');
    const response = await fetch(supabaseUrl + '/rest/v1/' + path, {
      method,
      headers: {
        apikey: publicKey,
        Authorization: 'Bearer ' + session.access_token,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const text = await response.text();
    if (!response.ok) throw new Error('Supabase Test API ' + method + ' ' + response.status + ': ' + text);
    return text ? JSON.parse(text) : [];
  }, { method, path, body, publicKey: SUPABASE_PUBLIC_KEY, supabaseUrl: SUPABASE_URL });

  try {
    const response = await page.goto(ADMIN_PREVIEW_URL, { waitUntil: 'domcontentloaded' });
    expect(response && response.status()).toBe(200);
    await page.locator('#email').fill(ADMIN_EMAIL);
    await page.locator('#password').fill(ADMIN_PASSWORD);
    await page.locator('#loginForm button').click();
    await page.locator('#email').fill('');
    await page.locator('#password').fill('');
    await expect(page.locator('#app')).toBeVisible({ timeout: 45000 });
    await page.locator('#tabs [data-tab="Musica dal vivo"]').click();
    await expect(page.locator('#sectionTitle')).toHaveText('Musica dal vivo');

    // CREATE through the real Admin form.
    await page.locator('#add').click();
    await page.locator('#fields [name="title"]').fill(fixtureTitle);
    await page.locator('#fields [name="description"]').fill('Descrizione iniziale Playwright');
    await page.locator('#fields [name="sort_order"]').fill('999998');
    await page.locator('#fields [name="is_published"]').check();
    // La sezione Musica dal vivo richiede un file video anche per un nuovo record.
    // È un piccolo MP4 temporaneo, caricato solo nel bucket TEST e rimosso al cleanup.
    await page.locator('#fields [name="video_file"]').setInputFiles({
      name: 'playwright-fixture.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from([0,0,0,24,0x66,0x74,0x79,0x70,0x69,0x73,0x6f,0x6d,0,0,2,0,0x69,0x73,0x6f,0x6d,0x69,0x73,0x6f,0x32])
    });
    await page.locator('#editForm button[type="submit"]').click();
    const card = page.locator('#items article').filter({ hasText: fixtureTitle });
    await expect(card).toBeVisible({ timeout: 30000 });
    let rows = await api('GET', 'performance_videos?select=id,title,description,video_path,sort_order,is_published&title=eq.' + encodeURIComponent(fixtureTitle));
    expect(rows).toHaveLength(1);
    fixtureId = rows[0].id;
    uploadedPath = rows[0].video_path;
    expect(uploadedPath).toMatch(/^[0-9a-f-]+-playwright-fixture\.mp4$/i);
    expect(rows[0].description).toBe('Descrizione iniziale Playwright');
    expect(rows[0].is_published).toBe(true);

    // UPDATE through the edit form, including updated_at.
    await card.locator('[data-edit]').click();
    await page.locator('#fields [name="description"]').fill('Descrizione aggiornata Playwright');
    await page.locator('#editForm button[type="submit"]').click();
    await expect(page.locator('#items article').filter({ hasText: fixtureTitle })).toContainText('Descrizione aggiornata Playwright');
    rows = await api('GET', 'performance_videos?select=id,description,updated_at& id=eq.' .replace(' ', '') + fixtureId);
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe('Descrizione aggiornata Playwright');
    expect(rows[0].updated_at).toBeTruthy();

    // HIDE and republish through the actual list controls.
    let updatedCard = page.locator('#items article').filter({ hasText: fixtureTitle });
    await updatedCard.locator('[data-pub]').click();
    await expect(page.locator('#status')).toContainText('Stato di pubblicazione aggiornato', { timeout: 15000 });
    await expect.poll(async () => {
      const current = await api('GET', 'performance_videos?select=id,is_published&id=eq.' + fixtureId);
      return current[0]?.is_published;
    }).toBe(false);
    updatedCard = page.locator('#items article').filter({ hasText: fixtureTitle });
    await updatedCard.locator('[data-pub]').click();
    await expect(page.locator('#status')).toContainText('Stato di pubblicazione aggiornato', { timeout: 15000 });
    await expect.poll(async () => {
      const current = await api('GET', 'performance_videos?select=id,is_published&id=eq.' + fixtureId);
      return current[0]?.is_published;
    }).toBe(true);

    // DELETE only the uniquely named fixture created by this test.
    updatedCard = page.locator('#items article').filter({ hasText: fixtureTitle });
    page.once('dialog', dialog => dialog.accept());
    await updatedCard.locator('[data-del]').click();
    await expect(page.locator('#status')).toContainText('Elemento e file eliminati', { timeout: 15000 });
    await expect(page.locator('#items article').filter({ hasText: fixtureTitle })).toHaveCount(0);
    rows = await api('GET', 'performance_videos?select=id&id=eq.' + fixtureId);
    expect(rows).toHaveLength(0);
    const storageListing = await page.evaluate(async ({ publicKey, supabaseUrl }) => {
      const storageKey = Object.keys(localStorage).find(key => key.endsWith('-auth-token'));
      const session = JSON.parse(localStorage.getItem(storageKey) || '{}');
      const response = await fetch(supabaseUrl + '/storage/v1/object/list/performance-videos', {
        method: 'POST',
        headers: { apikey: publicKey, Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: '', limit: 1000, offset: 0 })
      });
      if (!response.ok) throw new Error('Verifica Storage dopo eliminazione fallita: ' + response.status);
      return (await response.json()).map(item => item.name || '');
    }, { publicKey: SUPABASE_PUBLIC_KEY, supabaseUrl: SUPABASE_URL });
    expect(storageListing).not.toContain(uploadedPath);
    fixtureId = null;
  } finally {
    if (fixtureId) {
      try {
        await api('DELETE', 'performance_videos?id=eq.' + fixtureId);
      } catch (error) {
        errors.push('Cleanup record CRUD non riuscito: ' + error.message);
      }
    }
    // Rimuove esclusivamente i file MP4 temporanei creati da questa suite,
    // inclusi eventuali residui di tentativi precedenti interrotti.
    try {
      await page.evaluate(async ({ publicKey, supabaseUrl }) => {
        const storageKey = Object.keys(localStorage).find(key => key.endsWith('-auth-token'));
        const session = JSON.parse(localStorage.getItem(storageKey) || '{}');
        if (!session.access_token) throw new Error('Sessione assente durante il cleanup Storage.');
        const headers = { apikey: publicKey, Authorization: 'Bearer ' + session.access_token };
        const listing = await fetch(supabaseUrl + '/storage/v1/object/list/performance-videos', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefix: '', limit: 1000, offset: 0 })
        });
        if (!listing.ok) throw new Error('Ricerca video temporanei fallita: ' + listing.status);
        const entries = await listing.json();
        const knownFailedFixtures = [
          '1eb2addc-d2aa-43d8-b335-1b5de9fd0ca5-playwright-fixture.mp4',
          'cfd745ec-6ac5-4816-ac5a-606b3de1259f-playwright-fixture.mp4',
          'fe8d8270-9db6-4cf2-b10d-2c5453d61ea5-playwright-fixture.mp4',
          '468afeef-910d-485e-8a8e-505344cd75a9-playwright-fixture.mp4',
          'e1a78f4c-5b30-4d45-98b0-b060ac407ba9-playwright-fixture.mp4',
          'dcb8cd68-5689-46a4-9178-e71bb62dfeac-playwright-fixture.mp4'
        ];
        const paths = [...new Set([
          ...knownFailedFixtures,
          ...entries.map(entry => entry.name || '').filter(name => /^[0-9a-f-]+-playwright-fixture\.mp4$/i.test(name))
        ])];
        if (paths.length) {
          const removed = await fetch(supabaseUrl + '/storage/v1/object/performance-videos', {
            method: 'DELETE',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ prefixes: paths })
          });
          const body = await removed.text();
          console.log('Cleanup video fixtures HTTP', removed.status, body.slice(0, 1200));
          if (!removed.ok) throw new Error('Rimozione video temporanei fallita (' + removed.status + '): ' + body.slice(0, 300));
        }
        const verify = await fetch(supabaseUrl + '/storage/v1/object/list/performance-videos', {
          method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefix: '', limit: 1000, offset: 0 })
        });
        if (!verify.ok) throw new Error('Verifica finale Storage fallita: ' + verify.status);
        const remaining = (await verify.json()).map(entry => entry.name || '')
          .filter(name => /^[0-9a-f-]+-playwright-fixture\.mp4$/i.test(name));
        if (remaining.length) throw new Error('Video temporanei ancora presenti: ' + remaining.join(', '));
      }, { publicKey: SUPABASE_PUBLIC_KEY, supabaseUrl: SUPABASE_URL });
    } catch (error) {
      errors.push('Cleanup Storage CRUD non riuscito: ' + error.message);
    }
  }
  expect(errors, 'Errori JavaScript o cleanup non gestito nel pannello Admin').toEqual([]);
});


test('Admin: CRUD link Vimeo per Video ambienti su Supabase Test', async ({ page }) => {
  test.skip(!ADMIN_PREVIEW_URL || !ADMIN_EMAIL || !ADMIN_PASSWORD,
    'Test autenticato eseguito soltanto nel job CI con credenziali di test.');
  test.setTimeout(180000);
  const host = new URL(ADMIN_PREVIEW_URL).hostname;
  expect(host).toMatch(/^note-fiorentine-admin-.+\\.vercel\\.app$/);
  const errors = [];
  const fixtureTitle = 'PLAYWRIGHT AMBIENTE VIMEO ' + randomUUID();
  const vimeoUrl = 'https://vimeo.com/1245730545/2049f3f297?share=copy';
  let fixtureId = null;
  page.on('pageerror', error => errors.push(error.message));

  const api = async (method, path, body) => page.evaluate(async ({ method, path, body, publicKey, supabaseUrl }) => {
    const storageKey = Object.keys(localStorage).find(key => key.endsWith('-auth-token'));
    const session = JSON.parse(localStorage.getItem(storageKey) || '{}');
    if (!session.access_token) throw new Error('Sessione Supabase assente durante il test Video ambienti.');
    const response = await fetch(supabaseUrl + '/rest/v1/' + path, {
      method,
      headers: {
        apikey: publicKey,
        Authorization: 'Bearer ' + session.access_token,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const text = await response.text();
    if (!response.ok) throw new Error('Supabase Test API ' + method + ' ' + response.status + ': ' + text);
    return text ? JSON.parse(text) : [];
  }, { method, path, body, publicKey: SUPABASE_PUBLIC_KEY, supabaseUrl: SUPABASE_URL });

  try {
    const response = await page.goto(ADMIN_PREVIEW_URL, { waitUntil: 'domcontentloaded' });
    expect(response && response.status()).toBe(200);
    await page.locator('#email').fill(ADMIN_EMAIL);
    await page.locator('#password').fill(ADMIN_PASSWORD);
    await page.locator('#loginForm button').click();
    await page.locator('#email').fill('');
    await page.locator('#password').fill('');
    await expect(page.locator('#app')).toBeVisible({ timeout: 45000 });

    await page.locator('#tabs [data-tab="Video ambienti"]').click();
    await expect(page.locator('#sectionTitle')).toHaveText('Video ambienti');
    await page.locator('#add').click();
    await page.locator('#fields [name="title"]').fill(fixtureTitle);
    await page.locator('#fields [name="description"]').fill('Test Vimeo nella sezione dedicata');
    await page.locator('#fields [name="video_url"]').fill(vimeoUrl);
    await page.locator('#fields [name="video_orientation"]').selectOption('landscape');
    await page.locator('#fields [name="sort_order"]').fill('999999');
    // Il record resta non pubblicato: il test non espone contenuti temporanei sul sito.
    await page.locator('#fields [name="is_published"]').uncheck();
    await page.locator('#editForm button[type="submit"]').click();

    const card = page.locator('#items article').filter({ hasText: fixtureTitle });
    await expect(card).toBeVisible({ timeout: 30000 });
    let rows = await api('GET', 'restaurant_videos?select=id,title,description,youtube_url,video_url,video_orientation,sort_order,is_published&title=eq.' + encodeURIComponent(fixtureTitle));
    expect(rows).toHaveLength(1);
    fixtureId = rows[0].id;
    expect(rows[0].video_url).toBe(vimeoUrl);
    expect(rows[0].youtube_url).toBeNull();
    expect(rows[0].video_orientation).toBe('landscape');
    expect(rows[0].is_published).toBe(false);

    // Aggiornamento tramite il form reale e nuova verifica del valore letto dal DB.
    await card.locator('[data-edit]').click();
    await page.locator('#fields [name="description"]').fill('Descrizione Vimeo aggiornata');
    await page.locator('#editForm button[type="submit"]').click();
    await expect(page.locator('#items article').filter({ hasText: fixtureTitle })).toContainText('Descrizione Vimeo aggiornata');
    rows = await api('GET', 'restaurant_videos?select=id,description,youtube_url,video_url,video_orientation&id=eq.' + fixtureId);
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe('Descrizione Vimeo aggiornata');
    expect(rows[0].video_url).toBe(vimeoUrl);
    expect(rows[0].youtube_url).toBeNull();
    expect(rows[0].video_orientation).toBe('landscape');
  } finally {
    if (fixtureId) {
      try {
        await api('DELETE', 'restaurant_videos?id=eq.' + fixtureId);
        const remaining = await api('GET', 'restaurant_videos?select=id&id=eq.' + fixtureId);
        if (remaining.length) errors.push('Il record Vimeo temporaneo non è stato eliminato.');
      } catch (error) {
        errors.push('Cleanup Video ambienti non riuscito: ' + error.message);
      }
    }
  }
  expect(errors, 'Errori JavaScript o cleanup non gestito nel pannello Admin').toEqual([]);
});
