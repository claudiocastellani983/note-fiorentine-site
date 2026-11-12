const { test, expect } = require('@playwright/test');

const galleryRows = [
  { id: 'restaurant-1', category: 'restaurant', title: 'Sala', image_path: 'gallery/restaurant/cover.webp', sort_order: 10, focal_x: 50, focal_y: 50, focal_zoom: 1 },
  { id: 'kitchen-1', category: 'kitchen', title: 'Cucina', image_path: 'gallery/kitchen/cover.webp', sort_order: 10, focal_x: 50, focal_y: 50, focal_zoom: 1 },
  { id: 'music-1', category: 'music', title: 'Atmosfera', image_path: 'gallery/music/cover.webp', sort_order: 10, focal_x: 50, focal_y: 50, focal_zoom: 1 }
];
const restaurantVideos = [{
  id: 'restaurant-vimeo',
  title: 'Sala Live Music',
  description: 'Gli ambienti di Note Fiorentine',
  video_url: 'https://vimeo.com/1245775396/a85f0cd653?fl=ip&fe=ec',
  youtube_url: null,
  video_orientation: 'landscape',
  sort_order: 0,
  is_published: true
}];

async function mockPublicData(page) {
  await page.route('**/rest/v1/**', async route => {
    const url = new URL(route.request().url());
    const table = url.pathname.split('/').pop();
    let data = [];
    if (table === 'gallery_images') data = galleryRows;
    else if (table === 'restaurant_videos') data = restaurantVideos;
    else if (table === 'site_content') data = [{
      content_key: 'public_site',
      content_value: {
        hero_secondary_label: 'Dove siamo',
        _translations: { en: { hero_secondary_label: 'Find us' } }
      }
    }];
    else if (['performance_videos', 'artist_images', 'events', 'menu_categories', 'menu_items'].includes(table)) data = [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/S7sAAAAASUVORK5CYII=', 'base64');
  await page.route('**/storage/v1/object/public/site-media/**', route => route.fulfill({
    status: 200, contentType: 'image/png', body: pixel
  }));
}

for (const target of [
  { name: 'Home', path: '/' }
]) {
  test.describe(target.name + ': gallerie del ristorante', () => {
    test('non mostra video in pagina e li apre solo dal visualizzatore della relativa galleria', async ({ page }) => {
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await mockPublicData(page);
      const response = await page.goto(target.path, { waitUntil: 'domcontentloaded' });
      expect(response && response.status()).toBe(200);

      await expect(page.locator('#galleria')).toBeVisible();
      await expect(page.locator('[data-gallery-category="restaurant"]')).toBeVisible();
      await expect(page.locator('[data-gallery-category="kitchen"]')).toBeVisible();
      await expect(page.locator('[data-gallery-category="music"]')).toBeVisible();
      await expect(page.locator('#restaurantVideos')).toHaveCount(0);
      await expect(page.locator('#nfArtistsViewerStage iframe')).toHaveCount(0);
      await expect.poll(() => page.locator('[data-gallery-category="restaurant"]').evaluate(el => el.style.backgroundImage)).toContain('gallery/restaurant/cover.webp');

      if (target.name === 'Home') {
        const sectionOrder = await page.evaluate(() => {
          const artists = document.querySelector('.nf-artists-media');
          const gallery = document.querySelector('#galleria');
          const events = document.querySelector('#eventi');
          return Boolean(artists && gallery && events &&
            (artists.compareDocumentPosition(gallery) & Node.DOCUMENT_POSITION_FOLLOWING) &&
            (gallery.compareDocumentPosition(events) & Node.DOCUMENT_POSITION_FOLLOWING));
        });
        expect(sectionOrder, 'La galleria Home deve seguire la sezione Artisti e precedere Eventi').toBe(true);
      }

      // Il ristorante propone la scelta Foto/Video; il video non viene caricato prima del clic.
      await page.locator('[data-gallery-category="restaurant"]').click();
      const chooser = page.locator('#nfEnvironmentsChoice');
      await expect(chooser).toHaveClass(/open/);
      await page.locator('[data-env-choice="videos"]').click();

      const viewer = page.locator('#nfArtistsViewer');
      await expect(viewer).toHaveClass(/open/);
      await expect(page.locator('#nfArtistsViewerTitle')).toHaveText('Gli ambienti · Video');
      const frame = page.locator('#nfArtistsViewerStage iframe');
      await expect(frame).toHaveCount(1);
      await expect(frame).toHaveAttribute('src', 'https://player.vimeo.com/video/1245775396?h=a85f0cd653&dnt=1&title=0&byline=0&portrait=0');
      await page.locator('#nfArtistsViewerClose').click();
      await expect(viewer).not.toHaveClass(/open/);
      await expect(frame).toHaveCount(0);

      // La scelta Foto apre la galleria fotografica del ristorante.
      await page.locator('[data-gallery-category="restaurant"]').click();
      await page.locator('[data-env-choice="photos"]').click();
      const photoViewer = page.locator('#nfGalleryViewer');
      await expect(photoViewer).toHaveClass(/open/);
      await expect(page.locator('#nfGalleryStage img')).toHaveAttribute('src', /gallery\/restaurant\/cover\.webp/);
      await page.locator('#nfGalleryClose').click();
      await expect(photoViewer).not.toHaveClass(/open/);

      // Cucina e atmosfera aprono direttamente la propria galleria fotografica.
      for (const category of ['kitchen', 'music']) {
        await page.locator('[data-gallery-category="' + category + '"]').click();
        await expect(photoViewer).toHaveClass(/open/);
        await expect(page.locator('#nfGalleryStage img')).toHaveAttribute('src', new RegExp('gallery\\/' + category + '\\/cover\\.webp'));
        await page.locator('#nfGalleryClose').click();
      }
      expect(errors, 'Il caricamento delle gallerie non deve generare errori JavaScript').toEqual([]);
    });
  });
}

test('Home: usa Dove siamo al posto di Scopri la musica e mantiene la destinazione Maps', async ({ page }) => {
  await mockPublicData(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const reachUs = page.locator('#inizio .actions [data-nf-reach-us]');
  await expect(reachUs).toHaveText('Dove siamo');
  await expect(reachUs).toHaveAttribute('href', /google\.com\/maps\/dir/);
  await expect(reachUs).toHaveAttribute('href', /Via%20dei%20Benci/);
  await expect(page.locator('#inizio .actions').getByText('Scopri la musica')).toHaveCount(0);
});

test('Pagina Menù: titolo coerente con Home e non bloccato sul cremisi', async ({ page }) => {
  await mockPublicData(page);
  await page.goto('/menu.html', { waitUntil: 'domcontentloaded' });
  const title = page.locator('#menu h2');
  await expect(title).toHaveText('Il menù');
  const color = await title.evaluate(el => getComputedStyle(el).color);
  expect(color).not.toBe('rgb(209, 106, 94)');
});

test('Pagina Menù: il titolo accetta colore e dimensione dall’editor anche con CSS importante', async ({ page }) => {
  await mockPublicData(page);
  await page.goto('/menu.html?visual-editor=1', { waitUntil: 'domcontentloaded' });
  const title = page.locator('#menu h2');
  await expect(title).toHaveText('Il menù');
  await page.evaluate(() => {
    window.postMessage({
      type: 'nf-visual-update',
      sequence: 901,
      selector: '#menu h2',
      patch: { color: '#123456', fontSize: '37px' }
    }, '*');
  });
  await expect.poll(() => title.evaluate(el => getComputedStyle(el).color)).toBe('rgb(18, 52, 86)');
  await expect.poll(() => title.evaluate(el => getComputedStyle(el).fontSize)).toBe('37px');
  expect(await title.evaluate(el => el.style.getPropertyPriority('color'))).toBe('important');
});
