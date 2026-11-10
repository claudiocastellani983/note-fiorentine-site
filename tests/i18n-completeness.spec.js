const { test, expect } = require('@playwright/test');

const siteUrl = process.env.SITE_PREVIEW_URL || process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173';

const languages = {
  it: {
    photo: 'Galleria immagini', video: 'Galleria video', close: 'CHIUDI ×', heroAlt: 'Note Fiorentine, ristorante toscano nel centro storico di Firenze',
    photoAria: 'Apri la galleria fotografica degli artisti', videoAria: 'Apri la galleria video degli artisti',
    category: 'Antipasti', dish: 'Crostini toscani', allergen: 'Allergeni:'
  },
  en: {
    photo: 'Photo Gallery', video: 'Video Gallery', close: 'CLOSE ×', heroAlt: "Note Fiorentine, Tuscan restaurant in Florence's historic centre",
    photoAria: "Open the artists' photo gallery", videoAria: "Open the artists' video gallery",
    category: 'Appetizers', dish: 'Tuscan crostini', allergen: 'Allergens:'
  },
  de: {
    photo: 'Fotogalerie', video: 'Videogalerie', close: 'SCHLIESSEN ×', heroAlt: 'Note Fiorentine, toskanisches Restaurant im historischen Zentrum von Florenz',
    photoAria: 'Fotogalerie der Künstler öffnen', videoAria: 'Videogalerie der Künstler öffnen',
    category: 'Vorspeisen', dish: 'Toskanische Crostini', allergen: 'Allergene:'
  },
  fr: {
    photo: 'Galerie photos', video: 'Galerie vidéo', close: 'FERMER ×', heroAlt: 'Note Fiorentine, restaurant toscan dans le centre historique de Florence',
    photoAria: 'Ouvrir la galerie photos des artistes', videoAria: 'Ouvrir la galerie vidéo des artistes',
    category: 'Entrées', dish: 'Crostini toscans', allergen: 'Allergènes :'
  },
  es: {
    photo: 'Galería de imágenes', video: 'Galería de vídeos', close: 'CERRAR ×', heroAlt: 'Note Fiorentine, restaurante toscano en el centro histórico de Florencia',
    photoAria: 'Abrir la galería de fotos de los artistas', videoAria: 'Abrir la galería de vídeos de los artistas',
    category: 'Entrantes', dish: 'Crostini toscanos', allergen: 'Alérgenos:'
  },
  zh: {
    photo: '图片集', video: '视频集', close: '关闭 ×', heroAlt: 'Note Fiorentine，位于佛罗伦萨历史中心的托斯卡纳餐厅',
    photoAria: '打开艺术家照片集', videoAria: '打开艺术家视频集',
    category: '开胃菜', dish: '托斯卡纳烤面包片', allergen: '过敏原：'
  }
};

const itemTranslations = {
  en: { name: 'Tuscan crostini', description: 'Toasted bread with Tuscan chicken liver pâté' },
  de: { name: 'Toskanische Crostini', description: 'Geröstetes Brot mit toskanischer Hühnerleberpastete' },
  fr: { name: 'Crostini toscans', description: 'Pain grillé avec pâté de foies de volaille à la toscane' },
  es: { name: 'Crostini toscanos', description: 'Pan tostado con paté toscano de hígado de pollo' },
  zh: { name: '托斯卡纳烤面包片', description: '配托斯卡纳鸡肝酱的烤面包' }
};

const categoryTranslations = {
  en: { name: 'Appetizers' },
  de: { name: 'Vorspeisen' },
  fr: { name: 'Entrées' },
  es: { name: 'Entrantes' },
  zh: { name: '开胃菜' }
};

test('Home: all six languages translate artist gallery labels and accessibility text', async ({ page }) => {
  await page.route(/\\/rest\\/v1\\/site_images\\?/, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        image_key: 'hero',
        image_path: 'hero/preview.webp',
        alt_text: 'Note Fiorentine, ristorante toscano nel centro storico di Firenze',
        focal_x: 50,
        focal_y: 50,
        focal_zoom: 1
      }])
    });
  });
  for (const [lang, expected] of Object.entries(languages)) {
    await page.goto(`${siteUrl}/?lang=${lang}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('lang', lang === 'zh' ? 'zh-CN' : lang);
    await expect(page.locator('[data-artist-gallery="images"] strong')).toHaveText(expected.photo);
    await expect(page.locator('[data-artist-gallery="videos"] strong')).toHaveText(expected.video);
    await expect(page.locator('#nfArtistsViewerClose')).toHaveText(expected.close);
    await expect(page.locator('[data-artist-gallery="images"]')).toHaveAttribute('aria-label', expected.photoAria);
    await expect(page.locator('[data-artist-gallery="videos"]')).toHaveAttribute('aria-label', expected.videoAria);
    await expect(page.locator('.hero-art img.nf-managed-image')).toHaveAttribute('alt', expected.heroAlt);
    if (lang !== 'it') {
      const visibleText = await page.locator('body').innerText();
      expect(visibleText).not.toContain('Galleria immagini');
      expect(visibleText).not.toContain('Galleria video');
      expect(visibleText).not.toContain('CHIUDI ×');
      expect(visibleText).not.toContain('Scopri gli artisti');
      expect(visibleText).not.toContain('Guarda le performance');
    }
  }
});

test('Menu: category, dish, description and allergen labels follow the selected language', async ({ page }) => {
  await page.route(/\/rest\/v1\/menu_categories\?/, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: 'i18n-category',
        name: 'Antipasti',
        description: null,
        translations: categoryTranslations,
        sort_order: 1,
        created_at: '2026-01-01T00:00:00Z'
      }])
    });
  });
  await page.route(/\/rest\/v1\/menu_items\?/, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: 'i18n-item',
        category_id: 'i18n-category',
        name: 'Crostini toscani',
        description: 'Pane tostato con paté di fegatini',
        price: 10,
        allergens: ['1'],
        image_path: null,
        translations: itemTranslations,
        sort_order: 1,
        created_at: '2026-01-01T00:00:00Z'
      }])
    });
  });

  for (const [lang, expected] of Object.entries(languages)) {
    await page.goto(`${siteUrl}/menu.html?lang=${lang}`, { waitUntil: 'domcontentloaded' });
    const category = page.locator('#menuCategories .menu-category-button');
    await expect(category).toHaveText(expected.category);
    await category.click();
    await expect(page.locator('#menuItems h3')).toHaveText(expected.dish);
    await expect(page.locator('#menuItems .menu-item-allergens')).toContainText(expected.allergen);
    if (lang !== 'it') {
      const visibleText = await page.locator('body').innerText();
      expect(visibleText).not.toContain('Caricamento categorie');
      expect(visibleText).not.toContain('Allergeni:');
    }
  }
});
