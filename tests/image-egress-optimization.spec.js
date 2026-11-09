const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

test('ottimizzazione egress presente in homepage e pannelli', async ({ browserName }) => {
  test.skip(browserName !== 'chromium', 'Controllo statico sorgenti eseguito una volta sola');
  const root = path.resolve(__dirname, '..');
  const manager = fs.readFileSync(path.join(root, 'src/src/gestione-immagini.html'), 'utf8');
  const homepage = fs.readFileSync(path.join(root, 'src/src/index.html'), 'utf8');
  const admin = fs.readFileSync(path.join(root, 'admin/src/index.html'), 'utf8');

  expect(manager).toContain('async function optimizeImageFile(file)');
  expect(manager).toContain("cacheControl:'31536000'");
  expect(manager).toContain('id="optimizeExistingImages"');
  expect(manager).toContain('Analizza immagini (sola lettura)');
  const inventoryStart = manager.indexOf("document.getElementById('optimizeExistingImages')?.addEventListener('click',async()=>{");
  const inventoryEnd = manager.indexOf("\ndocument.querySelectorAll('[data-gallery-admin]')", inventoryStart);
  expect(inventoryStart).toBeGreaterThanOrEqual(0);
  expect(inventoryEnd).toBeGreaterThan(inventoryStart);
  const inventorySource = manager.slice(inventoryStart, inventoryEnd);
  expect(inventorySource).toContain(".select('id,image_path')");
  expect(inventorySource).not.toContain('.download(');
  expect(inventorySource).not.toContain('.upload(');
  expect(inventorySource).not.toContain('.update(');
  expect(inventorySource).not.toContain('.remove(');
  expect(manager.match(/upload\(path,optimized/g)?.length || 0).toBeGreaterThanOrEqual(3);

  expect(homepage).toContain("img.loading=priority?'eager':'lazy'");
  expect(homepage).toContain("rootMargin:'350px'");
  expect(homepage).toContain("media.preload='none'");
  expect(manager).toContain("media.preload='none'");
  expect(manager).toContain("cacheControl:'31536000'");
  expect(admin).toContain("cacheControl:'31536000'");

  expect(admin).toContain('async function optimizeImageFile(file)');
  expect(admin).toContain("cacheControl:'31536000'");
  expect(admin).toContain("upload(path,optimized");
});
