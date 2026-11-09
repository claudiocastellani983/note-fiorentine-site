const { test, expect } = require('@playwright/test');

const SITE_PREVIEW_URL = process.env.SITE_PREVIEW_URL;
const ADMIN_PREVIEW_URL = process.env.ADMIN_PREVIEW_URL;
const LANGUAGES = [
  ['it', 'it'],
  ['en', 'en'],
  ['de', 'de'],
  ['fr', 'fr'],
  ['es', 'es'],
  ['zh', 'zh-CN']
];

test.describe('Funzioni pubbliche delle preview reali', () => {
  test('Home: navigazione, sei lingue e collegamento al menu', async ({ page }) => {
    expect(SITE_PREVIEW_URL).toBeTruthy();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));

    await page.goto(SITE_PREVIEW_URL, { waitUntil: 'domcontentloaded' });
    const switcher = page.locator('nav.language-switch').first();
    await expect(switcher).toBeVisible();

    for (const [queryLang, documentLang] of LANGUAGES) {
      await page.goto(new URL(`?lang=${queryLang}`, SITE_PREVIEW_URL).toString(), { waitUntil: 'domcontentloaded' });
      await expect(page.locator('html')).toHaveAttribute('lang', documentLang);
      await expect(switcher.locator(`a[data-lang="${queryLang}"].active`)).toHaveCount(1);
    }

    const menuLink = page.locator('a[href*="/menu.html"]').first();
    await expect(menuLink).toBeVisible();
    expect(new URL(await menuLink.getAttribute('href'), page.url()).pathname).toBe('/menu.html');
    expect(errors, 'Errori JavaScript non gestiti nella Home').toEqual([]);
  });

  test('Menu: categorie dinamiche, apertura categoria e lingua cinese', async ({ page }) => {
    expect(SITE_PREVIEW_URL).toBeTruthy();
    const menuUrl = new URL('/menu.html?lang=zh', SITE_PREVIEW_URL).toString();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));

    const response = await page.goto(menuUrl, { waitUntil: 'domcontentloaded' });
    expect(response && response.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(page.locator('.language-switch a[data-lang="zh"].active')).toHaveCount(1);

    const categories = page.locator('#menuCategories .menu-category-button');
    await expect(categories.first(), 'Le categorie del menu devono essere caricate da Supabase').toBeVisible({ timeout: 20000 });
    await categories.first().click();
    await expect(page.locator('#menuItems')).toBeVisible();
    await expect(categories.first()).toHaveAttribute('aria-pressed', 'true');
    expect(errors, 'Errori JavaScript non gestiti nella pagina Menu').toEqual([]);
  });

  test('Home e Admin: layout mobile senza overflow orizzontale', async ({ page }) => {
    expect(SITE_PREVIEW_URL).toBeTruthy();
    expect(ADMIN_PREVIEW_URL).toBeTruthy();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(SITE_PREVIEW_URL, { waitUntil: 'domcontentloaded' });
    const homeOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    expect(homeOverflow, 'La Home non deve avere overflow orizzontale a 390px').toBe(false);

    await page.goto(ADMIN_PREVIEW_URL, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#loginForm')).toBeVisible();
    const adminOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    expect(adminOverflow, 'Il login Admin non deve avere overflow orizzontale a 390px').toBe(false);
  });
});
