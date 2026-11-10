const { test, expect } = require('@playwright/test');

test('Home: mostra gli eventi pubblicati e mantiene disponibili le sei lingue', async ({ page }) => {
  const siteUrl = process.env.SITE_PREVIEW_URL || process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173';
  const requests = [];
  await page.route('https://iuxskknbopboynjlsxbk.supabase.co/rest/v1/events**', async route => {
    requests.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: 'event-preview-test',
        title: 'Evento di prova',
        description: 'Descrizione evento di prova',
        starts_at: '2030-06-01T18:00:00Z',
        image_path: null,
        external_url: null,
        button_label: 'Scopri l’evento',
        is_published: true,
        translations: {}
      }])
    });
  });
  await page.goto(siteUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#eventi')).toHaveCount(1);
  await expect(page.locator('header .navlinks a[href="#eventi"]')).toBeVisible();
  await expect(page.locator('#eventList')).toContainText('Evento di prova');
  expect(requests.length).toBeGreaterThan(0);
  const languages = await page.locator('.language-switch a[data-lang]').evaluateAll(nodes => [...new Set(nodes.map(node => node.dataset.lang))].sort());
  expect(languages).toEqual(['de', 'en', 'es', 'fr', 'it', 'zh']);
});
