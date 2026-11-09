const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

test('Admin: caricamento immagini per piatti, artisti e ristorante', async () => {
  const admin = fs.readFileSync(path.join(process.cwd(), 'admin/src/index.html'), 'utf8');
  const menu = fs.readFileSync(path.join(process.cwd(), 'src/src/menu.html'), 'utf8');

  expect(admin).toContain("'Piatti':{table:'menu_items'");
  expect(admin).toContain("['image_path','Fotografia del piatto','image']");
  expect(admin).toContain("'Artisti':{table:'artist_images'");
  expect(admin).toContain("['image_path','Fotografia artista','image',1]");
  expect(admin).toContain("'Ristorante':{table:'gallery_images'");
  expect(admin).toContain("['image_path','Fotografia','image',1]");
  expect(admin).toContain("db.storage.from('site-media').upload(path,optimized");
  expect(admin).toContain("const PREVIEW_READ_ONLY=");
  expect(menu).toContain('image_path,translations,sort_order');
  expect(menu).toContain('menu-item-image');
  expect(menu).toContain('/storage/v1/object/public/site-media/');
});
