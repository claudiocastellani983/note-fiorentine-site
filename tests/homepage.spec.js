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
