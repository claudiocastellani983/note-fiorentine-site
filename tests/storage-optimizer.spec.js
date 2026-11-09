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
