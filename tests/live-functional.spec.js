const { test, expect } = require('@playwright/test');
const { attachVercelBypass } = require('./helpers/vercel-bypass');
// Bypass headers are credentials: keep them out of uploaded Playwright traces.
test.use({ trace: 'off' });
test.beforeEach(async ({ page }) => attachVercelBypass(page));


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

    // Attendere le fetch asincrone prima di cambiare lingua: WebKit può
    // segnalare come access-control le richieste abortite dalla navigazione.
    await page.goto(SITE_PREVIEW_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    const switcher = page.locator('nav.language-switch').first();
    await expect(switcher).toBeVisible();

    for (const [queryLang, documentLang] of LANGUAGES) {
      await page.goto(new URL(`?lang=${queryLang}`, SITE_PREVIEW_URL).toString(), { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle');
      await expect(page.locator('html')).toHaveAttribute('lang', documentLang);
      await expect(switcher.locator(`a[data-lang="${queryLang}"].active`)).toHaveCount(1);
    }

    const menuLink = page.locator('a[href*="/menu.html"]').first();
    await expect(menuLink).toBeVisible();
    expect(new URL(await menuLink.getAttribute('href'), page.url()).pathname).toBe('/menu.html');
    expect(errors, 'Errori JavaScript non gestiti nella Home').toEqual([]);
  });

  test('Home: elimina la fascia sfumata e gestisce i video pubblicati o la galleria vuota', async ({ page }) => {
    expect(SITE_PREVIEW_URL).toBeTruthy();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const response = await page.goto(SITE_PREVIEW_URL, { waitUntil: 'domcontentloaded' });
    expect(response && response.status()).toBe(200);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('#nf-section-soft-transitions-v1')).toHaveCount(0);
    await expect(page.locator('[data-gallery-category="restaurant"]')).toBeVisible();
    await page.locator('[data-gallery-category="restaurant"]').click();
    const chooser = page.locator('#nfEnvironmentsChoice');
    await expect(chooser).toHaveClass(/open/);

    const videosResponsePromise = page.waitForResponse(response =>
      response.url().includes('/rest/v1/restaurant_videos?') &&
      response.request().method() === 'GET'
    );
    await page.locator('[data-env-choice="videos"]').click();
    const videosResponse = await videosResponsePromise;
    expect(videosResponse.status(), 'La richiesta dei video del ristorante deve riuscire').toBe(200);
    const publishedVideos = await videosResponse.json();
    expect(Array.isArray(publishedVideos), 'Supabase deve restituire un elenco di video').toBe(true);

    const viewer = page.locator('#nfArtistsViewer');
    await expect(viewer).toHaveClass(/open/);
    const stage = page.locator('#nfArtistsViewerStage');
    const frame = stage.locator('iframe');

    if (publishedVideos.length === 0) {
      await expect(frame).toHaveCount(0);
      await expect(stage).toContainText('I video degli ambienti saranno disponibili a breve.');
    } else {
      const firstVideo = publishedVideos[0];
      const source = firstVideo.video_url || firstVideo.youtube_url || '';
      if (/vimeo\.com\//i.test(source) || /(youtube\.com|youtu\.be|youtube-nocookie\.com)\//i.test(source)) {
        await expect(frame).toHaveCount(1);
        await expect(frame).toHaveAttribute('src', /player\.vimeo\.com\/video\/|youtube-nocookie\.com\/embed\//);
      } else {
        await expect(frame).toHaveCount(0);
        await expect(stage).toContainText('Il collegamento di questo video non è valido o non è supportato.');
      }
    }

    expect(errors, 'Il percorso dei video del ristorante non deve generare errori JavaScript').toEqual([]);
  });

  test('Menu: categorie dinamiche, apertura categoria e lingua cinese', async ({ page }) => {
    expect(SITE_PREVIEW_URL).toBeTruthy();
    const menuUrl = new URL('/menu.html?lang=zh', SITE_PREVIEW_URL).toString();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));

    const response = await page.goto(menuUrl, { waitUntil: 'domcontentloaded' });
    expect(response && response.status()).toBe(200);
    await page.waitForLoadState('networkidle');
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
    await page.waitForLoadState('networkidle');
    const homeOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    expect(homeOverflow, 'La Home non deve avere overflow orizzontale a 390px').toBe(false);

    await page.goto(ADMIN_PREVIEW_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#loginForm')).toBeVisible();
    const adminOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    expect(adminOverflow, 'L’Admin non deve avere overflow orizzontale a 390px').toBe(false);
  });
});


test.describe('Media reali in Supabase Test', () => {
  test('Home Preview: immagine e video hero sono leggibili dallo Storage Test', async ({ page }) => {
    test.setTimeout(60000);
    const siteUrl = SITE_PREVIEW_URL || process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173';
    await page.goto(siteUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    const config = await page.evaluate(() => window.NF_SUPABASE_CONFIG || null);
    expect(config, 'Configurazione Supabase mancante nella Preview').not.toBeNull();
    expect(config.projectRef).toBe('ypkitfyqctjvojgbekmm');
    expect(config.environment).toBe('Test');
    expect(config.url).toBe('https://ypkitfyqctjvojgbekmm.supabase.co');

    const imageUrl = config.url + '/storage/v1/object/public/site-media/hero/1794592667681-yvb2g7.jpg';
    const videoUrl = config.url + '/storage/v1/object/public/performance-videos/note-fiorentine-hero-montaggio.mp4';

    const videoResponse = await page.request.get(videoUrl);
    const videoBytes = await videoResponse.body();
    const videoText = videoBytes.toString('latin1');
    const videoInfo = {
      status: videoResponse.status(),
      contentType: videoResponse.headers()['content-type'] || '',
      contentLength: videoBytes.length,
      ftyp: videoText.slice(4, 8),
      codecMarkers: ['avc1', 'hvc1', 'hev1', 'vp09', 'av01', 'mp4v', 'mp4a'].filter(marker => videoText.includes(marker))
    };

    const media = await page.evaluate(async ({ imageUrl, videoUrl }) => {
      const image = new Image();
      const imageResult = await new Promise(resolve => {
        const timer = setTimeout(() => resolve({ loaded: false, reason: 'timeout' }), 20000);
        image.onload = () => { clearTimeout(timer); resolve({ loaded: true, width: image.naturalWidth, height: image.naturalHeight }); };
        image.onerror = () => { clearTimeout(timer); resolve({ loaded: false, reason: 'image-error' }); };
        image.src = imageUrl;
      });

      const video = document.createElement('video');
      video.preload = 'metadata';
      const videoResult = await new Promise(resolve => {
        const timer = setTimeout(() => resolve({ loaded: false, reason: 'timeout' }), 25000);
        video.addEventListener('loadedmetadata', () => {
          clearTimeout(timer);
          resolve({ loaded: true, duration: video.duration, width: video.videoWidth, height: video.videoHeight });
        }, { once: true });
        video.addEventListener('error', () => {
          clearTimeout(timer);
          resolve({ loaded: false, reason: 'video-error', code: video.error?.code || null });
        }, { once: true });
        video.src = videoUrl;
        video.load();
      });
      return { imageResult, videoResult };
    }, { imageUrl, videoUrl });

    expect(videoInfo.status, JSON.stringify(videoInfo)).toBe(200);
    expect(videoInfo.contentType, JSON.stringify(videoInfo)).toContain('video/mp4');
    expect(videoInfo.ftyp, JSON.stringify(videoInfo)).toBe('ftyp');
    expect(media.imageResult.loaded, JSON.stringify(media.imageResult)).toBe(true);
    expect(media.imageResult.width).toBeGreaterThan(0);
    expect(media.videoResult.loaded, JSON.stringify({ videoInfo, videoResult: media.videoResult })).toBe(true);
    expect(media.videoResult.duration).toBeGreaterThan(0);
  });
});
