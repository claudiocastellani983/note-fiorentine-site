const { test, expect } = require('@playwright/test');

const siteUrl = (process.env.SITE_PREVIEW_URL || process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
const languages = ['it', 'en', 'de', 'fr', 'es', 'zh'];
const searchPhrases = {
  it: 'ristorante con musica dal vivo a Firenze',
  en: 'restaurant with live music in Florence',
  de: 'Restaurant mit Live-Musik in Florenz',
  fr: 'restaurant avec musique live à Florence',
  es: 'restaurante con música en vivo en Florencia',
  zh: '佛罗伦萨'
};

for (const pagePath of ['/', '/menu.html']) {
  test(`SEO: canonical, hreflang, title, description and Restaurant schema on ${pagePath}`, async ({ page }) => {
    for (const lang of languages) {
      const url = lang === 'it' ? `${siteUrl}${pagePath}` : `${siteUrl}${pagePath}?lang=${lang}`;
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('html')).toHaveAttribute('lang', lang === 'zh' ? 'zh-CN' : lang);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://www.notefiorentine.it${pagePath}${lang === 'it' ? '' : `?lang=${lang}`}`);
      await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute('href', `https://www.notefiorentine.it${pagePath}`);
      for (const code of languages) {
        await expect(page.locator(`link[rel="alternate"][hreflang="${code === 'zh' ? 'zh-CN' : code}"]`)).toHaveAttribute(
          'href',
          `https://www.notefiorentine.it${pagePath}${code === 'it' ? '' : `?lang=${code}`}`
        );
      }
      const title = await page.title();
      expect(title.toLowerCase()).toContain(searchPhrases[lang].toLowerCase());
      expect(title).toContain('Note Fiorentine');
      const description = await page.locator('meta[name="description"]').getAttribute('content');
      expect(description.toLowerCase()).toContain(searchPhrases[lang].toLowerCase());
      const schema = await page.locator('#nf-restaurant-schema').textContent();
      const parsed = JSON.parse(schema);
      expect(parsed['@type']).toBe('Restaurant');
      expect(parsed.name).toBe('Note Fiorentine');
      expect(parsed.hasMenu).toContain('/menu.html');
    }
  });
}

test('SEO: robots.txt and sitemap expose Home and Menu in six languages', async ({ request }) => {
  const robots = await request.get(`${siteUrl}/robots.txt`);
  expect(robots.ok()).toBeTruthy();
  expect(await robots.text()).toContain('https://www.notefiorentine.it/sitemap.xml');

  const sitemapResponse = await request.get(`${siteUrl}/sitemap.xml`);
  expect(sitemapResponse.ok()).toBeTruthy();
  const sitemap = await sitemapResponse.text();
  expect(sitemap).toContain('<urlset');
  for (const lang of languages) {
    const suffix = lang === 'it' ? '' : `?lang=${lang}`;
    expect(sitemap).toContain(`https://www.notefiorentine.it/${suffix}`);
    expect(sitemap).toContain(`https://www.notefiorentine.it/menu.html${suffix}`);
  }
  expect((sitemap.match(/<url>/g) || []).length).toBe(12);
});
