const { test, expect } = require('@playwright/test');

const siteUrl = (process.env.SITE_PREVIEW_URL || process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
const languages = {
  it: { faq: 'La serata, in breve', menu: 'Un percorso tra i sapori toscani', category: 'Antipasti' },
  en: { faq: 'Your Evening at a Glance', menu: 'A Journey Through Tuscan Flavours', category: 'Starters' },
  de: { faq: 'Ihr Abend auf einen Blick', menu: 'Eine Reise durch die Aromen der Toskana', category: 'Vorspeisen' },
  fr: { faq: 'Votre soirée en bref', menu: 'Un voyage au cœur des saveurs toscanes', category: 'Entrées' },
  es: { faq: 'Tu velada, en resumen', menu: 'Un recorrido por los sabores toscanos', category: 'Entrantes' },
  zh: { faq: '晚餐信息一览', menu: '探索托斯卡纳风味', category: '前菜' }
};

for (const [lang, expected] of Object.entries(languages)) {
  test(`meaningful localized content and preserved Events section: ${lang}`, async ({ page }) => {
    const suffix = lang === 'it' ? '' : `?lang=${lang}`;
    await page.goto(`${siteUrl}/${suffix}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#serata-info')).toBeVisible();
    await expect(page.locator('#serata-info h2')).toContainText(expected.faq);
    await expect(page.locator('#serata-info .nf-evening-fact')).toHaveCount(4);
    await expect(page.locator('#eventi')).toBeVisible();

    await page.goto(`${siteUrl}/menu.html${suffix}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.nf-menu-guide')).toBeVisible();
    await expect(page.locator('.nf-menu-guide h3')).toContainText(expected.menu);
    await expect(page.locator('.nf-menu-guide-item strong').first()).toContainText(expected.category);
    await expect(page.locator('#menuCategories')).toBeVisible();
  });
}
