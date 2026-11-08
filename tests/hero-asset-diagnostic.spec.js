const { test, expect } = require('@playwright/test');

test('diagnostica temporanea immagine hero corrente', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Diagnostica eseguita solo su Chromium');
  await page.setViewportSize({ width: 256, height: 192 });
  const response = await page.goto('https://nculgrwlzjitggjcgbpp.supabase.co/storage/v1/object/public/site-media/hero/1794135203890-b1kcm3.jpg', { waitUntil: 'load' });
  expect(response).not.toBeNull();
  expect(response.status()).toBe(200);
  const img = page.locator('img');
  await expect(img).toBeVisible();
  const metrics = await img.evaluate(el => ({ width: el.naturalWidth, height: el.naturalHeight, complete: el.complete }));
  const preview = await page.screenshot({ type: 'jpeg', quality: 25 });
  console.log('NF_HERO_ASSET_METRICS=' + JSON.stringify(metrics));
  console.log('NF_HERO_ASSET_PREVIEW=' + preview.toString('base64'));
});
