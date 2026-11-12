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
    else if (['performance_videos', 'artist_images', 'events', 'menu_categories', 'menu_items', 'site_content'].includes(table)) data = [];
    // Le altre tabelle pubbliche non sono necessarie in questi test: evita chiamate esterne.
    else data = [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/S7sAAAAASUVORK5CYII=', 'base64');
  await page.route('**/storage/v1/object/public/site-media/**', route => route.fulfill({
    status: 200, contentType: 'image/png', body: pixel
  }));
}

for (const target of [
  { name: 'Home', path: '/' },
  { name: 'Pagina Menù', path: '/menu.html' }
]) {
  test.describe(target.name + ': gallerie del ristorante', () => {
    test('mostra le tre categorie, i video pubblicati e apre la galleria fotografica', async ({ page }) => {
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await mockPublicData(page);
      const response = await page.goto(target.path, { waitUntil: 'domcontentloaded' });
      expect(response && response.status()).toBe(200);

      await expect(page.locator('#galleria')).toBeVisible();
      await expect(page.locator('[data-gallery-category="restaurant"]')).toBeVisible();
      await expect(page.locator('[data-gallery-category="kitchen"]')).toBeVisible();
      await expect(page.locator('[data-gallery-category="music"]')).toBeVisible();
      await expect.poll(() => page.locator('[data-gallery-category="restaurant"]').evaluate(el => el.style.backgroundImage)).toContain('gallery/restaurant/cover.webp');

      const restaurantVideo = page.locator('#restaurantVideos iframe');
      await expect(restaurantVideo).toHaveCount(1);
      await expect(restaurantVideo).toHaveAttribute('src', 'https://player.vimeo.com/video/1245775396?h=a85f0cd653&dnt=1&title=0&byline=0&portrait=0');

      await page.locator('[data-gallery-category="restaurant"]').click();
      const viewer = page.locator('#nfGalleryViewer');
      await expect(viewer).toHaveClass(/open/);
      await expect(page.locator('#nfGalleryStage img')).toHaveAttribute('src', /gallery\/restaurant\/cover\.webp/);
      await page.locator('#nfGalleryClose').click();
      await expect(viewer).toHaveAttribute('aria-hidden', 'true');
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
      payload: { color: '#123456', fontSize: '37px' }
    }, '*');
  });
  await expect.poll(() => title.evaluate(el => getComputedStyle(el).color)).toBe('rgb(18, 52, 86)');
  await expect.poll(() => title.evaluate(el => getComputedStyle(el).fontSize)).toBe('37px');
  expect(await title.evaluate(el => el.style.getPropertyPriority('color'))).toBe('important');
});
