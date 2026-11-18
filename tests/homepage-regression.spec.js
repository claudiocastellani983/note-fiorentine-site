const { test, expect } = require('@playwright/test');

test('Home: mantiene la sezione Eventi, il collegamento nel menu e le sei lingue', async ({ page }) => {
  await page.route('**/rest/v1/site_content*', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route('**/rest/v1/events*', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.goto(process.env.SITE_PREVIEW_URL || process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#eventi')).toHaveCount(1);
  await expect(page.locator('#eventi h2')).toHaveText('Eventi');
  await expect(page.locator('#navlinks > a[href="#eventi"]')).toHaveText('Eventi');
  const languages = await page.locator('.language-switch a[data-lang]').evaluateAll(nodes => [...new Set(nodes.map(node => node.dataset.lang))].sort());
  expect(languages).toEqual(['de', 'en', 'es', 'fr', 'it', 'zh']);
  const expectedLabels = { en: 'Events', de: 'Veranstaltungen', fr: 'Événements', es: 'Eventos', zh: '活动' };
  for (const [lang, label] of Object.entries(expectedLabels)) {
    await page.goto(`${process.env.SITE_PREVIEW_URL || process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173'}/?lang=${lang}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#eventi h2')).toHaveText(label);
    await expect(page.locator('#navlinks > a[href="#eventi"]')).toHaveText(label);
  }
});
