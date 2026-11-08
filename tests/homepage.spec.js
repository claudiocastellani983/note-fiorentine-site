const { test, expect } = require('@playwright/test');

test('la homepage si apre e contiene Note Fiorentine', async ({ page }) => {
  await page.route('https://nculgrwlzjitggjcgbpp.supabase.co/**', route => route.abort('blockedbyclient'));
  await page.goto('/');

  await expect(page).toHaveTitle(/Note Fiorentine/i);
  await expect(page.getByText('Note Fiorentine', { exact: false }).first()).toBeVisible();
});

test('dal menu principale si raggiunge la pagina del menu', async ({ page }) => {
  await page.route('https://nculgrwlzjitggjcgbpp.supabase.co/**', route => route.abort('blockedbyclient'));
  await page.goto('/');

  const menuLink = page.getByRole('link', { name: 'Menu', exact: true }).first();
  await expect(menuLink).toBeVisible();
  await menuLink.click();

  await expect(page).toHaveURL(/\/menu\.html(?:[?#].*)?$/);
  await expect(page).toHaveTitle(/Note Fiorentine/i);
});
