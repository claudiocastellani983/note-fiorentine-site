const { test, expect } = require('@playwright/test');

test('Home: la sezione Eventi è rimossa e restano disponibili le sei lingue', async ({ page }) => {
  const siteUrl = process.env.SITE_PREVIEW_URL || process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173';
  const eventRequests = [];
  await page.route('https://iuxskknbopboynjlsxbk.supabase.co/rest/v1/events**', route => {
    eventRequests.push(route.request().url());
    return route.abort('blockedbyclient');
  });
  await page.goto(siteUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#eventi')).toHaveCount(0);
  await expect(page.locator('a[href="#eventi"]')).toHaveCount(0);
  const languages = await page.locator('.language-switch a[data-lang]').evaluateAll(nodes => [...new Set(nodes.map(node => node.dataset.lang))].sort());
  expect(languages).toEqual(['de', 'en', 'es', 'fr', 'it', 'zh']);
  await expect(page.getByText('Eventi', { exact: true })).toHaveCount(0);
  expect(eventRequests).toEqual([]);
});
