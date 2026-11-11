const { test, expect } = require('@playwright/test');

const siteUrl = (process.env.SITE_PREVIEW_URL || process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
const languages = {
  it: {
    homeHeading: 'Cucina toscana',
    homeParagraph: 'Nel cuore di Firenze, Note Fiorentine è un ristorante toscano',
    menuLead: 'Consulta le categorie del menu',
    eventsLead: 'Scopri gli appuntamenti e le serate speciali'
  },
  en: {
    homeHeading: 'Tuscan cuisine',
    homeParagraph: 'In the heart of Florence, Note Fiorentine is a Tuscan restaurant',
    menuLead: 'Browse the menu categories',
    eventsLead: 'Discover upcoming events and special evenings'
  },
  de: {
    homeHeading: 'Toskanische Küche',
    homeParagraph: 'Im Herzen von Florenz ist Note Fiorentine ein toskanisches Restaurant',
    menuLead: 'Entdecken Sie die Menükategorien',
    eventsLead: 'Entdecken Sie die geplanten Veranstaltungen'
  },
  fr: {
    homeHeading: 'Cuisine toscane',
    homeParagraph: 'Au cœur de Florence, Note Fiorentine est un restaurant toscan',
    menuLead: 'Parcourez les catégories du menu',
    eventsLead: 'Découvrez les événements à venir'
  },
  es: {
    homeHeading: 'Cocina toscana',
    homeParagraph: 'En el corazón de Florencia, Note Fiorentine es un restaurante toscano',
    menuLead: 'Consulta las categorías del menú',
    eventsLead: 'Descubre los próximos eventos'
  },
  zh: {
    homeHeading: '托斯卡纳美食',
    homeParagraph: 'Note Fiorentine 位于佛罗伦萨中心',
    menuLead: '浏览菜单分类',
    eventsLead: '了解 Note Fiorentine 即将举行的活动'
  }
};

for (const [lang, expected] of Object.entries(languages)) {
  test(`localized restaurant, menu and events copy: ${lang}`, async ({ page }) => {
    const suffix = lang === 'it' ? '' : `?lang=${lang}`;
    await page.goto(`${siteUrl}/${suffix}`, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#ristorante h2')).toContainText(expected.homeHeading);
    await expect(page.locator('#ristorante p')).toContainText(expected.homeParagraph);
    await expect(page.locator('#eventi')).toBeVisible();
    await expect(page.locator('#eventi .section-lead')).toContainText(expected.eventsLead);

    await page.goto(`${siteUrl}/menu.html${suffix}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#menu .section-lead')).toContainText(expected.menuLead);
  });
}
