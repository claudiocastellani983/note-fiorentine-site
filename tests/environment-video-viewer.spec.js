const { test, expect } = require('@playwright/test');

test.describe('Home: galleria video artisti', () => {
  test('riproduce un link Vimeo pubblicato da Supabase e chiude il visualizzatore', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.route('**/rest/v1/events**', route => route.fulfill({
      status: 200, contentType: 'application/json', body: '[]'
    }));
    await page.route('**/rest/v1/performance_videos**', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: 'test-vimeo-performance',
        title: 'Live Music',
        video_path: null,
        video_url: 'https://vimeo.com/1245730545/2049f3f297?share=copy',
        video_orientation: 'portrait',
        is_published: true,
        sort_order: 0
      }])
    }));

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-artist-gallery="videos"]').click();
    const viewer = page.locator('#nfArtistsViewer');
    await expect(viewer).toHaveClass(/open/);
    const frame = page.locator('#nfArtistsViewerStage iframe');
    await expect(frame).toHaveCount(1);
    await expect(frame).toHaveAttribute('src', 'https://player.vimeo.com/video/1245730545?h=2049f3f297&dnt=1&title=0&byline=0&portrait=0');
    await expect(page.locator('#nfArtistsViewerStage')).toHaveClass(/nf-artists-portrait/);

    await page.locator('#nfArtistsViewerClose').click();
    await expect(viewer).toHaveAttribute('aria-hidden', 'true');
    await expect(viewer).not.toHaveClass(/open/);
    await expect(frame).toHaveCount(0);
    expect(pageErrors, 'Il runtime della galleria non deve generare errori JavaScript').toEqual([]);
  });

  test('mantiene compatibilità con i record legacy prima della migrazione video_url', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    let extendedQuery = 0;
    let legacyQuery = 0;
    await page.route('**/rest/v1/events**', route => route.fulfill({
      status: 200, contentType: 'application/json', body: '[]'
    }));
    await page.route('**/rest/v1/performance_videos**', async route => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('select')?.includes('video_url')) {
        extendedQuery++;
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ code: '42703', message: 'column performance_videos.video_url does not exist' })
        });
      }
      legacyQuery++;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: 'legacy-youtube-performance',
          title: 'Live Music legacy',
          video_path: 'https://youtu.be/Gl_1qHhQKqM',
          is_published: true,
          sort_order: 0
        }])
      });
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-artist-gallery="videos"]').click();
    const viewer = page.locator('#nfArtistsViewer');
    await expect(viewer).toHaveClass(/open/);
    await expect(page.locator('#nfArtistsViewerStage iframe')).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/Gl_1qHhQKqM?rel=0'
    );
    expect(extendedQuery).toBe(1);
    expect(legacyQuery).toBe(1);
    await page.locator('#nfArtistsViewerClose').click();
    await expect(viewer).toHaveAttribute('aria-hidden', 'true');
    expect(pageErrors, 'Il fallback legacy non deve generare errori JavaScript').toEqual([]);
  });
});
