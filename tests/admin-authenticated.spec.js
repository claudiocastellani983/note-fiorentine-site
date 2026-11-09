const { test, expect } = require('@playwright/test');
const { createHash, randomUUID } = require('node:crypto');

const ADMIN_PREVIEW_URL = process.env.ADMIN_PREVIEW_URL;
const ADMIN_EMAIL = process.env.NF_TEST_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.NF_TEST_ADMIN_PASSWORD;
const SUPABASE_URL = 'https://iuxskknbopboynjlsxbk.supabase.co';
const SUPABASE_PUBLIC_KEY = 'sb_publishable_GTGiyYl8pZsY6letaozS2Q_dmh9vrRc';

test('Admin: login autorizzato, ottimizzazione WebP reale e originali integri su Supabase Test', async ({ page }) => {
  test.skip(!ADMIN_PREVIEW_URL || !ADMIN_EMAIL || !ADMIN_PASSWORD,
    'Test autenticato eseguito soltanto nel job CI con credenziali di test.');

  test.setTimeout(180000);

  const previewHost = new URL(ADMIN_PREVIEW_URL).hostname;
  expect(previewHost).toMatch(/^note-fiorentine-admin-.+\.vercel\.app$/);
  expect(SUPABASE_URL).toContain('iuxskknbopboynjlsxbk');

  const pageErrors = [];
  const databaseMutations = [];
  let samplePath = null;
  let outputPath = null;
  let cleanupResult = null;

  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => {
    const url = new URL(request.url());
    const method = request.method().toUpperCase();
    if (url.hostname === 'iuxskknbopboynjlsxbk.supabase.co' &&
        url.pathname.includes('/rest/v1/') &&
        !url.pathname.endsWith('/rpc/is_admin') &&
        !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      databaseMutations.push(method + ' ' + url.pathname);
    }
    const storageMarker = '/storage/v1/object/site-media/';
    if (url.hostname === 'iuxskknbopboynjlsxbk.supabase.co' &&
        ['POST', 'PUT'].includes(method) &&
        url.pathname.includes(storageMarker)) {
      const path = decodeURIComponent(url.pathname.slice(url.pathname.indexOf(storageMarker) + storageMarker.length));
      if (path.startsWith('optimizer-input/')) samplePath = path;
      if (path.startsWith('optimization-review/')) outputPath = path;
    }
  });

  const sampleName = 'nf-playwright-' + randomUUID() + '.png';
  let originalMeta = null;

  try {
    await page.goto(ADMIN_PREVIEW_URL, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#loginForm')).toBeVisible();
    expect(await page.content()).toContain(SUPABASE_URL);

    await page.locator('#email').fill(ADMIN_EMAIL);
    await page.locator('#password').fill(ADMIN_PASSWORD);
    await page.locator('#loginForm button').click();

    await expect(page.locator('#app')).toBeVisible({ timeout: 45000 });
    await expect(page.locator('#logout')).toBeVisible();
    await expect(page.locator('#login')).toBeHidden();

    await expect(page.locator('#tabs button').first()).toBeVisible({ timeout: 45000 });
    const tabNames = await page.locator('#tabs button').allTextContents();
    expect(tabNames.length, 'Le schede amministrative devono essere caricate').toBeGreaterThan(0);
    // Attendere che il caricamento iniziale della scheda Piatti sia terminato:
    // evita che la sua risposta asincrona sovrascriva la scheda Immagini appena aperta.
    await expect(page.locator('#items article.item').first()).toBeVisible({ timeout: 45000 });

    await page.locator('#tabs button[data-tab="Immagini e popup"]').click();
    await expect(page.locator('#storageOptimizer')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('#optimizerSamples')).toBeVisible();
    await expect(page.locator('#optimizerUploadSamples')).toBeVisible();

    originalMeta = await page.evaluate(async name => {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 768;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas non disponibile.');
      const pixels = context.createImageData(canvas.width, canvas.height);
      const random = new Uint8Array(pixels.data.length);
      for (let offset = 0; offset < random.length; offset += 65536) {
        crypto.getRandomValues(random.subarray(offset, Math.min(offset + 65536, random.length)));
      }
      for (let index = 0; index < pixels.data.length; index += 4) {
        pixels.data[index] = random[index];
        pixels.data[index + 1] = random[index + 1];
        pixels.data[index + 2] = random[index + 2];
        pixels.data[index + 3] = 255;
      }
      context.putImageData(pixels, 0, 0);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob || blob.size <= 1024 * 1024) throw new Error('Il campione PNG non supera 1 MB.');
      if (blob.size > 15 * 1024 * 1024) throw new Error('Il campione PNG supera il limite di 15 MB.');
      const bytes = await blob.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const sha256 = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
      const transfer = new DataTransfer();
      transfer.items.add(new File([blob], name, { type: 'image/png', lastModified: Date.now() }));
      const input = document.querySelector('#optimizerSamples');
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return { size: blob.size, sha256 };
    }, sampleName);

    expect(originalMeta.size).toBeGreaterThan(1024 * 1024);
    await page.locator('#optimizerUploadSamples').click();
    await expect(page.locator('#optimizerStatus')).toContainText('Analisi completata.', { timeout: 90000 });
    await expect(page.locator('#optimizerSummary')).toContainText('oltre 1 MB');
    
    const sampleCard = page.locator('#optimizerResults .media-card').filter({ hasText: sampleName });
    await expect(sampleCard).toHaveCount(1, { timeout: 30000 });
    if (!samplePath) {
      const displayedPath = (await sampleCard.locator('b').first().textContent())?.trim();
      if (displayedPath?.startsWith('optimizer-input/')) samplePath = displayedPath;
    }
    expect(samplePath, 'Il campione originale deve essere caricato nella cartella optimizer-input').toMatch(/^optimizer-input\//);

    await page.locator('#optimizerPrepare').click();
    await expect(page.locator('#optimizerStatus')).toContainText('Completato:', { timeout: 120000 });
    await expect(page.locator('#optimizerStatus')).toContainText('Originali e collegamenti non modificati.');
    await expect(sampleCard.locator('img[alt="Immagine originale"]')).toBeVisible();
    await expect(sampleCard.locator('img[alt="Copia WebP ottimizzata"]')).toBeVisible();

    await sampleCard.scrollIntoViewIfNeeded();
    await expect.poll(async () => {
      const images = await sampleCard.locator('img').evaluateAll(nodes => nodes.map(image => ({
        complete: image.complete,
        width: image.naturalWidth,
        height: image.naturalHeight
      })));
      return images.length === 2 && images.every(image => image.complete && image.width > 0 && image.height > 0);
    }, { timeout: 30000 }).toBe(true);

    const visual = await sampleCard.locator('img').evaluateAll(images => images.map(image => ({
      alt: image.alt,
      complete: image.complete,
      width: image.naturalWidth,
      height: image.naturalHeight,
      src: image.src
    })));
    expect(visual).toHaveLength(2);
    expect(visual.every(image => image.complete && image.width > 0 && image.height > 0),
      'Confronto visivo: entrambe le anteprime devono essere caricate').toBe(true);
    expect(visual[0].src).not.toBe(visual[1].src);

    const originalUrl = visual.find(image => image.alt === 'Immagine originale').src;
    const webpLink = sampleCard.locator('a', { hasText: 'Apri copia WebP' });
    await expect(webpLink).toBeVisible();
    const webpUrl = await webpLink.getAttribute('href');
    expect(webpUrl).toBeTruthy();

    if (!outputPath) {
      const outputUrl = new URL(webpUrl);
      const marker = '/storage/v1/object/public/site-media/';
      const index = outputUrl.pathname.indexOf(marker);
      if (index >= 0) outputPath = decodeURIComponent(outputUrl.pathname.slice(index + marker.length));
    }
    expect(outputPath).toBe('optimization-review/' + samplePath + '.webp');

    const originalResponse = await page.request.get(originalUrl);
    expect(originalResponse.status(), 'L’originale deve restare leggibile dopo la conversione').toBe(200);
    expect((originalResponse.headers()['content-type'] || '').toLowerCase()).toContain('image/png');
    const originalBytes = await originalResponse.body();
    expect(originalBytes.length).toBe(originalMeta.size);
    expect(createHash('sha256').update(originalBytes).digest('hex')).toBe(originalMeta.sha256);

    const webpResponse = await page.request.get(webpUrl);
    expect(webpResponse.status(), 'La copia WebP deve essere leggibile dalla cartella di revisione').toBe(200);
    expect((webpResponse.headers()['content-type'] || '').toLowerCase()).toContain('image/webp');
    const webpBytes = await webpResponse.body();
    expect(webpBytes.length).toBeLessThan(originalBytes.length);
    expect(webpBytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(webpBytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
    expect(databaseMutations, 'L’ottimizzatore non deve modificare le tabelle o i riferimenti del sito').toEqual([]);
  } finally {
    if (samplePath && !outputPath) outputPath = 'optimization-review/' + samplePath + '.webp';
    const paths = [...new Set([samplePath, outputPath].filter(Boolean))];
    if (paths.length) {
      cleanupResult = await page.evaluate(async ({ paths, publicKey, supabaseUrl }) => {
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
          body: JSON.stringify({ prefixes: paths })
        });
        return { ok: response.ok, status: response.status, body: response.ok ? '' : await response.text() };
      }, { paths, publicKey: SUPABASE_PUBLIC_KEY, supabaseUrl: SUPABASE_URL });
    }
  }

  expect(samplePath, 'Il campione di test deve essere tracciato').toBeTruthy();
  expect(outputPath, 'La copia WebP di revisione deve essere tracciata').toBeTruthy();
  expect(cleanupResult && cleanupResult.ok,
    'Campione e copia WebP temporanei devono essere rimossi da Supabase Test').toBe(true);
  expect(pageErrors, 'Errori JavaScript non gestiti nel pannello Admin').toEqual([]);
});


test('Admin: gestione immagini intuitiva, upload reale su Supabase Test e ripristino', async ({ page }) => {
  test.skip(!ADMIN_PREVIEW_URL || !ADMIN_EMAIL || !ADMIN_PASSWORD,
    'Test autenticato eseguito soltanto nel job CI con credenziali di test.');

  test.setTimeout(180000);
  const managerUrl = new URL('/gestione-immagini.html', ADMIN_PREVIEW_URL).toString();
  const pageErrors = [];
  let uploadedPath = null;
  let originalRow = null;
  let cleanupResult = null;

  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.hostname === 'iuxskknbopboynjlsxbk.supabase.co' &&
        request.method().toUpperCase() === 'POST' &&
        url.pathname.includes('/storage/v1/object/site-media/')) {
      uploadedPath = decodeURIComponent(url.pathname.split('/storage/v1/object/site-media/')[1]);
    }
  });

  await page.goto(managerUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#loginPanel')).toBeVisible();
  expect(await page.content()).toContain(SUPABASE_URL);
  expect(await page.content()).not.toContain('nculgrwlzjitggjcgbpp');

  await page.locator('#email').fill(ADMIN_EMAIL);
  await page.locator('#password').fill(ADMIN_PASSWORD);
  await page.locator('#loginBtn').click();
  await expect(page.locator('#manager')).toBeVisible({ timeout: 45000 });
  await expect(page.locator('#imageCards .image-card')).toHaveCount(9, { timeout: 45000 });

  const requiredLabels = ['Immagine principale', 'Musica dal vivo', 'Il ristorante', 'La cucina', 'L’atmosfera'];
  const managerText = await page.locator('#imageCards').innerText();
  for (const label of requiredLabels) expect(managerText).toContain(label);

  originalRow = await page.evaluate(async ({ supabaseUrl, publicKey }) => {
    const storageKey = Object.keys(localStorage).find(key => key.endsWith('-auth-token'));
    if (!storageKey) throw new Error('Sessione Supabase non trovata.');
    const session = JSON.parse(localStorage.getItem(storageKey) || '{}');
    if (!session.access_token) throw new Error('Access token non disponibile.');
    const response = await fetch(supabaseUrl + '/rest/v1/site_images?select=image_key,image_path,focal_x,focal_y,focal_zoom&image_key=eq.gallery_food', {
      headers: { apikey: publicKey, Authorization: 'Bearer ' + session.access_token, Accept: 'application/json' }
    });
    if (!response.ok) throw new Error('Lettura record di test non riuscita: ' + response.status + ' ' + await response.text());
    const rows = await response.json();
    if (!rows.length) throw new Error('Slot gallery_food non inizializzato in Supabase Test.');
    return rows[0];
  }, { supabaseUrl: SUPABASE_URL, publicKey: SUPABASE_PUBLIC_KEY });

  const card = page.locator('#imageCards .image-card').filter({ hasText: 'La cucina' });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pXcAAAAASUVORK5CYII=', 'base64');
  await card.locator('input[type="file"]').setInputFiles({
    name: 'nf-playwright-gallery-food.png',
    mimeType: 'image/png',
    buffer: png
  });
  await expect(card.getByRole('button', { name: 'Sostituisci immagine' })).toBeEnabled();
  await card.getByRole('button', { name: 'Sostituisci immagine' }).click();
  await expect(card.getByRole('button', { name: 'Sostituzione completata' })).toBeVisible({ timeout: 45000 });
  expect(uploadedPath, 'Il file deve essere caricato nello Storage Test').toMatch(/^gallery_food\//);

  const updatedRow = await page.evaluate(async ({ supabaseUrl, publicKey }) => {
    const storageKey = Object.keys(localStorage).find(key => key.endsWith('-auth-token'));
    const session = JSON.parse(localStorage.getItem(storageKey) || '{}');
    const response = await fetch(supabaseUrl + '/rest/v1/site_images?select=image_key,image_path&image_key=eq.gallery_food', {
      headers: { apikey: publicKey, Authorization: 'Bearer ' + session.access_token, Accept: 'application/json' }
    });
    if (!response.ok) throw new Error('Verifica database non riuscita: ' + response.status);
    return (await response.json())[0];
  }, { supabaseUrl: SUPABASE_URL, publicKey: SUPABASE_PUBLIC_KEY });
  expect(updatedRow.image_path).toBe(uploadedPath);

  const publicImage = SUPABASE_URL + '/storage/v1/object/public/site-media/' +
    uploadedPath.split('/').map(encodeURIComponent).join('/');
  const imageResponse = await page.request.get(publicImage);
  expect(imageResponse.status(), 'L’immagine caricata deve essere leggibile dallo Storage Test').toBe(200);

  try {
    const paths = uploadedPath ? [uploadedPath] : [];
    cleanupResult = await page.evaluate(async ({ paths, original, publicKey, supabaseUrl }) => {
      const storageKey = Object.keys(localStorage).find(key => key.endsWith('-auth-token'));
      if (!storageKey) return { ok: false, reason: 'sessione Supabase non trovata per il cleanup' };
      const session = JSON.parse(localStorage.getItem(storageKey) || '{}');
      if (!session.access_token) return { ok: false, reason: 'access token non disponibile per il cleanup' };
      const headers = {
        apikey: publicKey,
        Authorization: 'Bearer ' + session.access_token,
        'Content-Type': 'application/json'
      };
      const dbResponse = await fetch(supabaseUrl + '/rest/v1/site_images?image_key=eq.gallery_food', {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({
          image_path: original.image_path,
          focal_x: original.focal_x,
          focal_y: original.focal_y,
          focal_zoom: original.focal_zoom
        })
      });
      let storageResponse = { ok: true, status: 204 };
      if (paths.length) {
        const response = await fetch(supabaseUrl + '/storage/v1/object/site-media', {
          method: 'DELETE',
          headers,
          body: JSON.stringify({ prefixes: paths })
        });
        storageResponse = { ok: response.ok, status: response.status, body: response.ok ? '' : await response.text() };
      }
      return {
        ok: dbResponse.ok && storageResponse.ok,
        database: dbResponse.status,
        storage: storageResponse
      };
    }, { paths, original: originalRow, publicKey: SUPABASE_PUBLIC_KEY, supabaseUrl: SUPABASE_URL });
  } catch (error) {
    cleanupResult = { ok: false, reason: error.message };
  }

  expect(cleanupResult && cleanupResult.ok,
    'Il record e il file temporaneo devono essere ripristinati/rimossi da Supabase Test').toBe(true);
  expect(pageErrors, 'Errori JavaScript non gestiti nella gestione immagini').toEqual([]);
});
