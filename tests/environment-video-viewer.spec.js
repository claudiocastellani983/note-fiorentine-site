const { test, expect } = require('@playwright/test');

test.describe('Home: video ambienti e chiusura visualizzatore', () => {
  test('carica direttamente Vimeo e chiude il visualizzatore senza attese', async ({ page }) => {
    await page.route('**/rest/v1/events**', route => route.fulfill({
      status: 200, contentType: 'application/json', body: '[]'
    }));
    await page.route('**/rest/v1/restaurant_videos**', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: 'test-vimeo-environment',
        title: 'Ingresso e Sala Live Music',
        youtube_url: null,
        video_url: 'https://vimeo.com/1245730545/2049f3f297?share=copy',
        video_orientation: 'portrait',
        is_published: true,
        sort_order: 0
      }])
    }));

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-gallery-category="restaurant"]').click();
    const chooser = page.locator('#nfEnvironmentsChoice');
    await expect(chooser).toHaveClass(/open/);
    await page.locator('#nfEnvironmentsChoiceClose').click();
    await expect(chooser).toHaveAttribute('aria-hidden', 'true');
    await expect(chooser).not.toHaveClass(/open/);

    await page.locator('[data-gallery-category="restaurant"]').click();
    await page.locator('[data-env-choice="videos"]').click();
    const viewer = page.locator('#nfArtistsViewer');
    await expect(viewer).toHaveClass(/open/);
    const frame = page.locator('#nfArtistsViewerStage iframe');
    await expect(frame).toHaveCount(1);
    await expect(frame).toHaveAttribute('src', 'https://player.vimeo.com/video/1245730545?h=2049f3f297&dnt=1&title=0&byline=0&portrait=0');

    await page.locator('#nfArtistsViewerClose').click();
    await expect(viewer).toHaveAttribute('aria-hidden', 'true', { timeout: 500 });
    await expect(viewer).not.toHaveClass(/open/);
  });
});
