const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

let adminSource;
let optimizerSource;

test.beforeAll(async () => {
  adminSource = await fs.readFile(path.join(__dirname, '..', 'admin', 'src', 'index.html'), 'utf8');
  optimizerSource = await fs.readFile(path.join(__dirname, '..', 'admin', 'src', 'storage-optimizer.js'), 'utf8');
});

test('collega l’ottimizzatore all’Admin Test e al progetto Supabase Test', async () => {
  expect(adminSource).toContain("import{mountStorageOptimizer}from'./storage-optimizer.js';");
  expect(adminSource).toContain('id="storageOptimizerMount"');
  expect(adminSource).toContain("mountStorageOptimizer({db,root:$('storageOptimizerMount'),readOnly:PREVIEW_READ_ONLY})");
  expect(adminSource).toContain('https://iuxskknbopboynjlsxbk.supabase.co');
  expect(adminSource).toContain("location.hostname.startsWith('note-fiorentine-admin-')");
});

test('espone un solo comando che esegue analisi, conversione, verifica e sostituzione', async () => {
  expect(optimizerSource).toContain('id="optimizerRun"');
  expect(optimizerSource).toContain('Ottimizza e sostituisci immagini');
  expect(optimizerSource).toContain("$('optimizerRun').addEventListener('click', run)");
  expect(optimizerSource).toContain('async function run()');
  expect(optimizerSource).toContain('async function optimize(blob)');
  expect(optimizerSource).toContain('async function collectReferences()');
  expect(optimizerSource).toContain('async function updateReferences(');
  expect(optimizerSource).toContain('async function verifyReferences(');
  expect(optimizerSource).toContain("status('1/5 · Analisi archivio");
  expect(optimizerSource).toContain("status('5/5 · Controllo finale completato.')");
  expect(optimizerSource).not.toContain('optimizerPrepare');
  expect(optimizerSource).not.toContain('optimizerUploadSamples');
  expect(optimizerSource).not.toContain('Carica campioni grezzi');
});

test('aggiorna soltanto immagini oltre 1 MB con riferimenti DB e verifica la copia WebP', async () => {
  expect(optimizerSource).toContain("file.size > 1024 * 1024");
  expect(optimizerSource).toContain("file.refs.length > 0");
  expect(optimizerSource).toContain("contentType: 'image/webp', upsert: false");
  expect(optimizerSource).toContain("createImageBitmap(checked.data)");
  expect(optimizerSource).toContain("db.storage.from('site-media').getPublicUrl(newPath)");
  expect(optimizerSource).toContain("await verifyReferences(file, changes)");
  expect(optimizerSource).toContain("formatBytes(savedBytes)");
  expect(optimizerSource).toContain("Originali conservati come backup.");
});

test('copre tutte le tabelle note e ripristina i riferimenti se un aggiornamento fallisce', async () => {
  for (const table of ['site_images', 'gallery_images', 'artist_images', 'events', 'homepage_popup', 'site_content']) {
    expect(optimizerSource).toContain("table: '" + table + "'");
  }
  expect(optimizerSource).toContain('async function rollback(changes)');
  expect(optimizerSource).toContain('const rollbackErrors = await rollback(changes)');
  expect(optimizerSource).toContain('await rollback(changes)');
  expect(optimizerSource).not.toContain('.remove(');
  expect(optimizerSource).toContain('if (readOnly)');
});


test('esegue con un clic la sostituzione verificata e conserva l’originale', async ({ page }) => {
  const adminBaseUrl = process.env.ADMIN_BASE_URL;
  test.skip(!adminBaseUrl, 'ADMIN_BASE_URL non configurato');

  await page.goto(new URL('/storage-optimizer.js', adminBaseUrl).toString(), { waitUntil: 'domcontentloaded' });

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
    if (!original || original.size <= 1024 * 1024) throw new Error('Il campione non supera 1 MB.');

    const rows = { site_images: [{ id: 'fixture-row', image_path: 'hero/fixture.png' }] };
    const uploaded = new Map();
    const removed = [];
    const query = (table, payload, selectedColumns) => {
      const filters = [];
      const q = {
        eq(column, value) { filters.push([column, value]); return q; },
        select(columns) { if (columns) selectedColumns = columns; return q; },
        then(resolve, reject) {
          try {
            const tableRows = rows[table] || [];
            const matched = tableRows.filter(row => filters.every(([key, value]) => row[key] === value));
            if (payload) for (const row of matched) Object.assign(row, payload);
            const columns = selectedColumns ? selectedColumns.split(',') : Object.keys(matched[0] || {});
            const data = matched.map(row => Object.fromEntries(columns.map(key => [key, row[key]])));
            return Promise.resolve({ data, error: null }).then(resolve, reject);
          } catch (error) { return Promise.reject(error).then(resolve, reject); }
        }
      };
      return q;
    };
    const db = {
      storage: {
        from(bucket) {
          if (bucket !== 'site-media') throw new Error('Bucket inatteso');
          return {
            async list(prefix) {
              if (!prefix) return { data: [{ name: 'hero', id: null, metadata: null }], error: null };
              if (prefix === 'hero') return {
                data: [{ name: 'fixture.png', id: 'original-object', metadata: { mimetype: 'image/png', size: original.size } }],
                error: null
              };
              return { data: [], error: null };
            },
            async download(path) {
              if (path === 'hero/fixture.png') return { data: original, error: null };
              if (uploaded.has(path)) return { data: uploaded.get(path), error: null };
              return { data: null, error: { message: 'File non trovato: ' + path } };
            },
            async upload(path, blob, options) {
              uploaded.set(path, blob);
              return { data: { path, contentType: options.contentType }, error: null };
            },
            getPublicUrl(path) {
              return { data: { publicUrl: 'https://test.invalid/storage/v1/object/public/site-media/' + path } };
            },
            async remove(paths) { removed.push(...paths); return { data: [], error: null }; }
          };
        }
      },
      from(table) {
        return {
          select(columns) { return query(table, null, columns); },
          update(payload) { return query(table, payload, null); }
        };
      }
    };

    const module = await import('/storage-optimizer.js');
    const root = document.createElement('div');
    root.id = 'optimizer-one-click-test';
    document.body.appendChild(root);
    window.__nfOptimizerTest = { rows, uploaded, removed, originalSize: original.size };
    module.mountStorageOptimizer({ db, root, readOnly: false });
  });

  await expect(page.getByRole('button', { name: 'Ottimizza e sostituisci immagini' })).toBeVisible();
  await page.getByRole('button', { name: 'Ottimizza e sostituisci immagini' }).click();
  await expect(page.locator('#optimizerStatus')).toContainText('Operazione conclusa', { timeout: 30000 });
  await expect(page.locator('#optimizerSummary')).toContainText('1 sostituite');

  const result = await page.evaluate(() => {
    const state = window.__nfOptimizerTest;
    return {
      path: state.rows.site_images[0].image_path,
      uploads: [...state.uploaded.entries()].map(([path, blob]) => ({ path, size: blob.size, type: blob.type })),
      removed: state.removed,
      originalSize: state.originalSize
    };
  });
  expect(result.path).toMatch(/^optimization-review\/hero\/fixture\.png\./);
  expect(result.uploads).toHaveLength(1);
  expect(result.uploads[0].type).toBe('image/webp');
  expect(result.uploads[0].size).toBeLessThan(result.originalSize * 0.97);
  expect(result.removed).toHaveLength(0);
});
