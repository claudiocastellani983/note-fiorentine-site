const { test, expect } = require('@playwright/test');

test('Home: nasconde la sezione Eventi e mantiene disponibili le sei lingue', async ({ page }) => {
  await page.goto(process.env.SITE_PREVIEW_URL || process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#eventi')).toHaveCount(0);
  await expect(page.locator('#navlinks > a[href="#eventi"]')).toHaveCount(0);
  const languages = await page.locator('.language-switch a[data-lang]').evaluateAll(nodes => [...new Set(nodes.map(node => node.dataset.lang))].sort());
  expect(languages).toEqual(['de', 'en', 'es', 'fr', 'it', 'zh']);
});
