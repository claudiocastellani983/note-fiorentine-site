const { test, expect } = require('@playwright/test');

test('Home: mantiene la sezione Eventi, il collegamento nel menu e le sei lingue', async ({ page }) => {
  // Simula i vecchi testi ancora presenti nel database: non devono sovrascrivere
  // la nuova sezione Galleria definita nell'HTML e nel dizionario i18n.
  const staleGalleryCopy = {
    gallery_kicker: 'Immagini e atmosfera',
    gallery_title: 'La galleria',
    gallery_lead: 'Uno sguardo agli ambienti, ai piatti e ai dettagli di Note Fiorentine.',
    _translations: Object.fromEntries(['en', 'de', 'fr', 'es', 'zh'].map(lang => [lang, {
      gallery_kicker: 'Immagini e atmosfera',
      gallery_title: 'La galleria',
      gallery_lead: 'Uno sguardo agli ambienti, ai piatti e ai dettagli di Note Fiorentine.'
    }]))
  };
  await page.route('**/rest/v1/site_content*', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ content_value: staleGalleryCopy }])
    });
  });
  await page.route('**/rest/v1/events*', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.goto(process.env.SITE_PREVIEW_URL || process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#eventi')).toHaveCount(1);
  await expect(page.locator('#eventi h2')).toHaveText('Eventi');
  await expect(page.locator('#navlinks > a[href="#eventi"]')).toHaveText('Eventi');
  await expect(page.locator('#galleria .section-kicker')).toHaveText('Immagini e video del locale');
  await expect(page.locator('#galleria h2')).toHaveText('Il ristorante, la cucina e l’atmosfera');
  await expect(page.locator('#galleria .section-lead')).toHaveText('Gli ambienti, i piatti e i dettagli di Note Fiorentine. Apri le gallerie fotografiche e guarda i video del locale.');
  const languages = await page.locator('.language-switch a[data-lang]').evaluateAll(nodes => [...new Set(nodes.map(node => node.dataset.lang))].sort());
  expect(languages).toEqual(['de', 'en', 'es', 'fr', 'it', 'zh']);
  const expectedLabels = { en: 'Events', de: 'Veranstaltungen', fr: 'Événements', es: 'Eventos', zh: '活动' };
  const expectedGallery = {
    en: ['Photos and videos of the restaurant', 'The restaurant, our cuisine and atmosphere', 'The rooms, the dishes and the details of Note Fiorentine. Explore the photo galleries and watch videos of the venue.'],
    de: ['Bilder und Videos des Restaurants', 'Das Restaurant, die Küche und die Atmosphäre', 'Die Räume, die Gerichte und die Details von Note Fiorentine. Entdecken Sie die Fotogalerien und Videos des Restaurants.'],
    fr: ['Photos et vidéos du restaurant', 'Le restaurant, la cuisine et l’atmosphère', 'Les espaces, les plats et les détails de Note Fiorentine. Découvrez les galeries photos et les vidéos du restaurant.'],
    es: ['Fotos y vídeos del restaurante', 'El restaurante, la cocina y el ambiente', 'Los espacios, los platos y los detalles de Note Fiorentine. Explora las galerías de fotos y mira los vídeos del local.'],
    zh: ['餐厅照片与视频', '餐厅、托斯卡纳美食与氛围', '欣赏 Note Fiorentine 的空间、菜品与细节照片，并观看餐厅视频。']
  };
  for (const [lang, label] of Object.entries(expectedLabels)) {
    await page.goto(`${process.env.SITE_PREVIEW_URL || process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173'}/?lang=${lang}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#eventi h2')).toHaveText(label);
    await expect(page.locator('#navlinks > a[href="#eventi"]')).toHaveText(label);
    await expect(page.locator('#galleria .section-kicker')).toHaveText(expectedGallery[lang][0]);
    await expect(page.locator('#galleria h2')).toHaveText(expectedGallery[lang][1]);
    await expect(page.locator('#galleria .section-lead')).toHaveText(expectedGallery[lang][2]);
  }
});
