const { test, expect } = require('@playwright/test');

test('homepage pubblica: caricamento e identità del ristorante', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
  expect(response, 'La navigazione deve ricevere una risposta HTTP').not.toBeNull();
  expect(response.status(), 'La homepage deve rispondere senza errori HTTP').toBeLessThan(400);
  await expect(page.locator('body')).toContainText('Note Fiorentine');

  expect(pageErrors, 'Non devono verificarsi errori JavaScript non gestiti').toEqual([]);
});

test('sezione ambienti: scelta foto e video', async ({ page }) => {
  const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
  expect(response).not.toBeNull();
  expect(response.status()).toBeLessThan(400);

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
