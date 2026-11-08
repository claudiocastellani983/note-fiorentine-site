const { test, expect } = require('@playwright/test');

test('homepage: caricamento e identità del ristorante', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
  expect(response, 'La homepage deve restituire una risposta').not.toBeNull();
  expect(response.status(), 'La homepage non deve restituire un errore HTTP').toBeLessThan(400);
  await expect(page.locator('body')).toContainText('Note Fiorentine');
  expect(pageErrors, 'Non devono verificarsi errori JavaScript non gestiti').toEqual([]);
});

test('navigazione principale: i link puntano a sezioni esistenti', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const links = page.locator('nav[aria-label="Navigazione principale"] .navlinks a[href^="#"]');
  await expect(links.first()).toBeVisible();

  const count = await links.count();
  expect(count, 'Devono esserci link di navigazione interni').toBeGreaterThan(0);

  for (let i = 0; i < count; i += 1) {
    const link = links.nth(i);
    const href = await link.getAttribute('href');
    expect(href, 'Ogni link deve avere un riferimento interno').toMatch(/^#[^#]+$/);
    const target = page.locator(href);
    await expect(target, 'Il link ' + href + ' deve puntare a una sezione esistente').toHaveCount(1);
  }
});

test('sezione ambienti: scelta foto e video', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const restaurantTile = page.locator('[data-gallery-category="restaurant"]');
  await expect(restaurantTile).toBeVisible();
  await restaurantTile.click();

  const chooser = page.locator('#nfEnvironmentsChoice');
  await expect(chooser).toHaveClass(/open/);
  await expect(chooser).toContainText('Gli ambienti');

  await chooser.locator('[data-env-choice="photos"]').click();
  const photoGallery = page.locator('#nfGalleryViewer');
  await expect(photoGallery).toHaveClass(/open/);
  await page.locator('#nfGalleryClose').click();
  await expect(photoGallery).not.toHaveClass(/open/);

  await restaurantTile.click();
  await chooser.locator('[data-env-choice="videos"]').click();
  const videoGallery = page.locator('#nfArtistsViewer');
  await expect(videoGallery).toHaveClass(/open/);
  await expect(page.locator('#nfArtistsViewerTitle')).toContainText('ambienti');
});
