const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

let adminSource;
let optimizerSource;

test.beforeAll(async () => {
  adminSource = await fs.readFile(path.join(__dirname, '..', 'admin', 'src', 'index.html'), 'utf8');
  optimizerSource = await fs.readFile(path.join(__dirname, '..', 'admin', 'src', 'storage-optimizer.js'), 'utf8');
});

test('collega l’ottimizzatore alla sezione immagini e popup dell’Admin', async () => {
  expect(adminSource).toContain("import{mountStorageOptimizer}from'./storage-optimizer.js';");
  expect(adminSource).toContain('id="storageOptimizerMount"');
  expect(adminSource).toContain("mountStorageOptimizer({db,root:$('storageOptimizerMount'),readOnly:PREVIEW_READ_ONLY})");
});

test('analizza Storage e controlla i riferimenti senza modificare il database', async () => {
  expect(optimizerSource).toContain(".storage.from('site-media').list(");
  expect(optimizerSource).toContain("['gallery_images', 'image_path']");
  expect(optimizerSource).toContain("['site_images', 'image_path']");
  expect(optimizerSource).toContain("['artist_images', 'image_path']");
  expect(optimizerSource).toContain("['events', 'image_path']");
  expect(optimizerSource).toContain("['homepage_popup', 'media_files']");
  expect(optimizerSource).toContain("['site_content', 'content_value']");
  expect(optimizerSource).toContain("file.size > 1024 * 1024");
  expect(optimizerSource).not.toMatch(/db\.from\([^)]*\)\.(?:insert|update|upsert|delete)\s*\(/);
  expect(optimizerSource).not.toContain('.remove(');
});

test('crea soltanto copie WebP in cartella di revisione e conserva gli originali', async () => {
  expect(optimizerSource).toContain(".storage.from('site-media').download(file.path)");
  expect(optimizerSource).toContain("const outputPath = 'optimization-review/' + file.path + '.webp'");
  expect(optimizerSource).toContain("contentType: 'image/webp', upsert: false");
  expect(optimizerSource).toContain("if (readOnly) return status(");
  expect(optimizerSource).toContain("const path = 'optimizer-input/' + crypto.randomUUID() + '-' + safeName");
  expect(optimizerSource).toContain("if (file.size <= 1024 * 1024) throw new Error('Ogni campione deve superare 1 MB: ' + file.name)");
  expect(optimizerSource).toContain("$('optimizerUploadSamples').disabled = true");
  expect(optimizerSource).toContain('Originali e collegamenti non modificati.');
  expect(optimizerSource).not.toContain('.remove(');
  expect(optimizerSource).not.toMatch(/db\.from\([^)]*\)\.(?:insert|update|upsert|delete)\s*\(/);
});




test('carica un campione >1 MB su Test e prepara una copia WebP verificabile', async ({ page }) => {
  const adminBaseUrl = process.env.ADMIN_BASE_URL;
  test.skip(!adminBaseUrl, 'ADMIN_BASE_URL non configurato');

  await page.goto(new URL('/src/index.html', adminBaseUrl).toString(), { waitUntil: 'domcontentloaded' });

  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 768;
    const context = canvas.getContext('2d');
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
    const original = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!original || original.size <= 1024 * 1024) throw new Error('Il campione generato non supera 1 MB.');

    const uploads = [];
    let samplePath = null;
    const db = {
      storage: {
        from(bucket) {
          if (bucket !== 'site-media') throw new Error('Bucket inatteso: ' + bucket);
          return {
            async list(prefix) {
              if (!prefix) return { data: [{ name: 'optimizer-input', id: null, metadata: null }], error: null };
              if (prefix === 'optimizer-input' && samplePath) return {
                data: [{ name: samplePath.split('/').pop(), id: 'sample-id', metadata: { mimetype: 'image/png', size: original.size } }],
                error: null
              };
              return { data: [], error: null };
            },
            async download(path) {
              if (path !== samplePath) throw new Error('Percorso download inatteso: ' + path);
              return { data: original, error: null };
            },
            async upload(path, blob, options) {
              uploads.push({ path, size: blob.size, contentType: options.contentType, upsert: options.upsert, originalSize: original.size });
              if (path.startsWith('optimizer-input/')) samplePath = path;
              return { data: { path }, error: null };
            },
            getPublicUrl(path) {
              return { data: { publicUrl: 'https://test.invalid/' + path } };
            }
          };
        }
      },
      from() {
        return { select: async () => ({ data: [], error: null }) };
      }
    };

    const module = await import('/src/storage-optimizer.js');
    const root = document.createElement('div');
    root.id = 'optimizer-functional-test';
    document.body.appendChild(root);
    window.__nfOptimizerUploads = uploads;
    module.mountStorageOptimizer({ db, root, readOnly: false });

    const transfer = new DataTransfer();
    transfer.items.add(new File([original], 'sample.png', { type: 'image/png' }));
    root.querySelector('#optimizerSamples').files = transfer.files;
  });

  await page.getByRole('button', { name: 'Carica campioni grezzi su Test' }).click();
  await expect(page.locator('#optimizerSummary')).toContainText('1 oltre 1 MB');
  await page.getByRole('button', { name: '2 · Prepara copie ottimizzate' }).click();
  await expect(page.locator('#optimizerStatus')).toContainText('Completato: 1 copie create', { timeout: 20000 });
  await expect(page.locator('#optimizerResults')).toContainText('WebP ottimizzata');

  const uploads = await page.evaluate(() => window.__nfOptimizerUploads);
  expect(uploads).toHaveLength(2);
  expect(uploads[0].path).toMatch(/^optimizer-input\//);
  expect(uploads[0].contentType).toBe('image/png');
  expect(uploads[0].upsert).toBe(false);
  expect(uploads[1].path).toBe('optimization-review/' + uploads[0].path + '.webp');
  expect(uploads[1].contentType).toBe('image/webp');
  expect(uploads[1].upsert).toBe(false);
  expect(uploads[1].size).toBeLessThan(uploads[1].originalSize);
});
