const { test, expect } = require('@playwright/test');

test('homepage: caricamento, titolo e marchio', async ({ page }) => {
  const response = await page.goto('/');
  expect(response).not.toBeNull();
  expect(response.status()).toBe(200);
  await expect(page).toHaveTitle(/Note Fiorentine/i);
  await expect(page.getByText('Note Fiorentine', { exact: false }).first()).toBeVisible();
});

test('homepage: dal menu principale si raggiunge la pagina Menu', async ({ page }) => {
  await page.goto('/');
  const menuLink = page.getByRole('link', { name: 'Menu', exact: true }).first();
  await expect(menuLink).toBeVisible();
  await menuLink.click();
  await expect(page).toHaveURL(/\/menu\.html(?:[?#].*)?$/);
  await expect(page).toHaveTitle(/Note Fiorentine/i);
});

test('pagina Menu: caricamento diretto', async ({ page }) => {
  const response = await page.goto('/menu.html');
  expect(response).not.toBeNull();
  expect(response.status()).toBe(200);
  await expect(page).toHaveTitle(/Note Fiorentine/i);
  await expect(page.locator('body')).not.toBeEmpty();
});

test('homepage in cinese: selettore, lingua e navigazione vengono tradotti', async ({ page }) => {
  const response = await page.goto('/?lang=zh');
  expect(response).not.toBeNull();
  expect(response.status()).toBe(200);
  await expect(page).toHaveTitle(/Note Fiorentine/i);
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.locator('.language-switch a[data-lang="zh"]').first()).toBeVisible();
  await expect(page.locator('.navlinks')).toContainText('餐厅');
  await expect(page.locator('.navlinks')).toContainText('现场音乐');
  await expect(page.locator('.hero-copy > p')).toContainText('托斯卡纳美食');
  await expect(page.locator('#ristorante h2')).toContainText('共享美食时光');
  await expect(page.locator('#musica h2')).toContainText('每一个夜晚');
  await expect(page.locator('#menu h2')).toHaveText('菜单');
  await expect(page.locator('#galleria h2')).toHaveText('图片集');
});

test('menu in cinese: categorie e piatti usano le traduzioni salvate nel sorgente corrente', async ({ page }) => {
  const localBase = process.env.LOCAL_SITE_BASE_URL;
  test.skip(!localBase, 'LOCAL_SITE_BASE_URL non configurato');
  const response = await page.goto(localBase + '/menu.html?lang=zh');
  expect(response).not.toBeNull();
  expect(response.status()).toBe(200);
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.locator('.hero-copy .eyebrow')).toHaveText('Ristorante Toscano & Live Music');
  await expect(page.locator('.art-sub')).toHaveText('Ristorante Toscano & Live Music');
  const categories = page.locator('#menuCategories .menu-category-button');
  await expect(categories).toHaveCount(7, { timeout: 15000 });
  const categoryCount = await categories.count();
  expect(categoryCount).toBeGreaterThanOrEqual(7);
  for (let i = 0; i < categoryCount; i++) {
    const category = categories.nth(i);
    await expect(category).toContainText(/[一-龥]/);
    await category.click();
    const dishes = page.locator('#menuItems .menu-item-card h3');
    const dishCount = await dishes.count();
    expect(dishCount, 'Ogni categoria pubblicata deve mostrare almeno un piatto').toBeGreaterThan(0);
    for (let j = 0; j < dishCount; j++) {
      await expect(dishes.nth(j)).toContainText(/[一-龥]/);
    }
    const allergenLabels = page.locator('#menuItems .menu-item-allergens');
    for (let j = 0; j < await allergenLabels.count(); j++) {
      await expect(allergenLabels.nth(j)).toContainText('过敏原：');
    }
  }
});

test('homepage mobile: nessuno scorrimento orizzontale globale', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page).toHaveTitle(/Note Fiorentine/i);
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }));
  expect(widths.content, 'La homepage non deve eccedere la larghezza del viewport mobile').toBeLessThanOrEqual(widths.viewport + 1);
});

test('sorgente corrente del branch: home, Menu, lingua cinese e testi approvati', async ({ page }) => {
  const localBase = process.env.LOCAL_SITE_BASE_URL;
  test.skip(!localBase, 'LOCAL_SITE_BASE_URL non configurato');

  const response = await page.goto(localBase + '/');
  expect(response).not.toBeNull();
  expect(response.status()).toBe(200);
  await expect(page).toHaveTitle(/Note Fiorentine/i);

  await expect(page.locator('.language-switch a[data-lang="zh"]').first()).toBeVisible();
  const visibleText = await page.locator('body').innerText();
  expect(visibleText).toContain('Note Fiorentine');
  expect(visibleText).toContain('Ristorante Toscano & Live Music');
  await expect(page.locator('#galleria .section-kicker')).toHaveText('Immagini e video del ristorante');
  expect(visibleText).not.toContain('Nessun supplemento');
  expect(visibleText).not.toContain('La tua serata a Firenze');

  const navText = (await page.locator('nav').allInnerTexts()).join(' ');
  expect(navText).not.toMatch(/Contatti|Eventi/i);

  const sectionIds = await page.locator('section[id]').evaluateAll(nodes => nodes.map(node => node.id));
  expect(sectionIds).not.toContain('eventi');
  expect(sectionIds).not.toContain('events');

  const menuResponse = await page.goto(localBase + '/menu.html');
  expect(menuResponse).not.toBeNull();
  expect(menuResponse.status()).toBe(200);
  await expect(page).toHaveTitle(/Note Fiorentine/i);

  const chineseResponse = await page.goto(localBase + '/?lang=zh');
  expect(chineseResponse).not.toBeNull();
  expect(chineseResponse.status()).toBe(200);
  await expect(page).toHaveTitle(/Note Fiorentine/i);
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.locator('.navlinks')).toContainText('餐厅');
  await expect(page.locator('.hero-copy .eyebrow')).toHaveText('Ristorante Toscano & Live Music');
  await expect(page.locator('.art-sub')).toHaveText('Ristorante Toscano & Live Music');
  await expect(page.locator('.brand-mini small').first()).toHaveText('Ristorante Toscano & Live Music');
  await expect(page.locator('#galleria .section-kicker')).toHaveText('餐厅图片与视频');
});

test('homepage: immagini principali servite correttamente da Supabase Storage', async ({ page }) => {
  const storageResponses = new Map();
  page.on('response', response => {
    const url = response.url();
    if (url.includes('/storage/v1/object/public/site-media/')) {
      storageResponses.set(url, response.status());
    }
  });

  await page.goto('/');
  await page.locator('.music-art').scrollIntoViewIfNeeded();
  await page.locator('.gallery-tile').first().scrollIntoViewIfNeeded();

  for (const key of ['hero', 'live_music', 'gallery_restaurant', 'gallery_food', 'gallery_atmosphere']) {
    await expect.poll(() => {
      const match = [...storageResponses.entries()].find(([url]) => url.includes('/' + key + '/'));
      return match ? match[1] : 0;
    }, { timeout: 15000 }).toBe(200);
  }
});

test('homepage: tutte le sei lingue sono selezionabili e mantengono il marchio', async ({ page }) => {
  const localBase = process.env.LOCAL_SITE_BASE_URL;
  test.skip(!localBase, 'LOCAL_SITE_BASE_URL non configurato');
  const cases = [
    { lang: 'it', html: 'it', nav: 'Il ristorante' },
    { lang: 'en', html: 'en', nav: 'The Restaurant' },
    { lang: 'de', html: 'de', nav: 'Das Restaurant' },
    { lang: 'fr', html: 'fr', nav: 'Le restaurant' },
    { lang: 'es', html: 'es', nav: 'El restaurante' },
    { lang: 'zh', html: 'zh-CN', nav: '餐厅' }
  ];
  for (const item of cases) {
    await page.goto(localBase + '/?lang=' + item.lang);
    await expect(page.locator('html')).toHaveAttribute('lang', item.html);
    await expect(page.locator('.navlinks')).toContainText(item.nav);
    await expect(page.locator('.hero-copy .eyebrow')).toHaveText('Ristorante Toscano & Live Music');
    await expect(page.locator('.brand-mini small').first()).toHaveText('Ristorante Toscano & Live Music');
    if (item.lang !== 'it') {
      await expect(page.locator('.hero-copy > p')).not.toContainText('La cucina toscana');
      await expect(page.locator('#ristorante h2')).not.toContainText('Il piacere di stare a tavola');
    }
  }
});

test('menu: categorie e primo piatto si traducono in tutte le lingue', async ({ page }) => {
  const localBase = process.env.LOCAL_SITE_BASE_URL;
  test.skip(!localBase, 'LOCAL_SITE_BASE_URL non configurato');
  const cases = [
    { lang: 'it', html: 'it', category: 'Antipasti', dish: 'Fettunta' },
    { lang: 'en', html: 'en', category: 'Appetizers', dish: 'Fettunta' },
    { lang: 'de', html: 'de', category: 'Vorspeisen', dish: 'Toskanisches Knoblauchbrot' },
    { lang: 'fr', html: 'fr', category: 'Entrées', dish: 'Fettunta toscane' },
    { lang: 'es', html: 'es', category: 'Entrantes', dish: 'Fettunta toscana' },
    { lang: 'zh', html: 'zh-CN', category: '开胃菜', dish: '托斯卡纳蒜香橄榄油烤面包（Fettunta）' }
  ];
  for (const item of cases) {
    await page.goto(localBase + '/menu.html?lang=' + item.lang);
    await expect(page.locator('html')).toHaveAttribute('lang', item.html);
    await expect(page.locator('.hero-copy .eyebrow')).toHaveText('Ristorante Toscano & Live Music');
    const firstCategory = page.locator('#menuCategories .menu-category-button').first();
    await expect(firstCategory).toHaveText(item.category, { timeout: 15000 });
    await firstCategory.click();
    await expect(page.locator('#menuItems .menu-item-card h3').first()).toHaveText(item.dish);
  }
});
