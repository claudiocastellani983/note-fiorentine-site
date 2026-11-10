const { test, expect } = require('@playwright/test');

const SITE_PREVIEW_URL = process.env.SITE_PREVIEW_URL;
const ADMIN_PREVIEW_URL = process.env.ADMIN_PREVIEW_URL;

test.describe('Preview Vercel reali', () => {
  test('Home: la preview risponde e carica il sito senza errori JavaScript', async ({ page }) => {
    expect(SITE_PREVIEW_URL, 'SITE_PREVIEW_URL deve essere configurato').toBeTruthy();

    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    const response = await page.goto(SITE_PREVIEW_URL, { waitUntil: 'domcontentloaded' });
    expect(response, 'La Home deve restituire una risposta HTTP').not.toBeNull();
    expect(response.status(), 'La Home deve rispondere HTTP 200').toBe(200);
    await expect(page).toHaveTitle(/Note Fiorentine/i);
    await expect(page.locator('body')).toContainText('Note Fiorentine');
    expect(pageErrors, 'Errori JavaScript non gestiti nella Home').toEqual([]);
  });

  test('Admin: la preview risponde, mostra il login e include l’editor collegato alla Home preview', async ({ page }) => {
    expect(ADMIN_PREVIEW_URL, 'ADMIN_PREVIEW_URL deve essere configurato').toBeTruthy();
    expect(SITE_PREVIEW_URL, 'SITE_PREVIEW_URL deve essere configurato').toBeTruthy();

    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    const response = await page.goto(ADMIN_PREVIEW_URL, { waitUntil: 'domcontentloaded' });
    expect(response, 'Admin deve restituire una risposta HTTP').not.toBeNull();
    expect(response.status(), 'Admin deve rispondere HTTP 200').toBe(200);
    await expect(page).toHaveTitle(/Note Fiorentine.*Gestione/i);
    await expect(page.locator('#login')).toBeVisible();
    await expect(page.locator('#loginForm')).toBeVisible();

    const inlineScripts = await page.locator('script').evaluateAll(nodes =>
      nodes.map(node => node.textContent || '').join('\n')
    );
    const configuredSitePreview = new URL(ADMIN_PREVIEW_URL).searchParams.get('sitePreview');
    expect(configuredSitePreview, 'L’Admin preview deve ricevere l’URL della Home preview').toBeTruthy();
    expect(new URL(configuredSitePreview).origin, 'L’editor deve puntare alla Home preview, non al dominio pubblico')
      .toBe(new URL(SITE_PREVIEW_URL).origin);
    expect(inlineScripts).toContain("new URLSearchParams(location.search).get('sitePreview')");
    expect(inlineScripts).toContain('sitePreviewUrl');
    expect(pageErrors, 'Errori JavaScript non gestiti nell’Admin').toEqual([]);
  });
});
