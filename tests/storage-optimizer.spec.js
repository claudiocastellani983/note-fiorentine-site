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
  expect(optimizerSource).toContain('Originali e collegamenti non modificati.');
  expect(optimizerSource).not.toContain('.remove(');
  expect(optimizerSource).not.toMatch(/db\.from\([^)]*\)\.(?:insert|update|upsert|delete)\s*\(/);
});
