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

test('homepage in cinese: la variante linguistica si apre', async ({ page }) => {
  const response = await page.goto('/?lang=zh');
  expect(response).not.toBeNull();
  expect(response.status()).toBe(200);
  await expect(page).toHaveTitle(/Note Fiorentine/i);
  await expect(page.locator('body')).not.toBeEmpty();
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

  const visibleText = await page.locator('body').innerText();
  expect(visibleText).toContain('Note Fiorentine');
  expect(visibleText).toContain('Ristorante Toscano & Live Music');
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
});
