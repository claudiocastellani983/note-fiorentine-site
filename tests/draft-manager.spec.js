const { test, expect } = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

let server;
let origin;
let managerSource;
let adminSource;

const fixture = [
  '<!doctype html>',
  '<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Test bozze</title></head>',
  '<body><main id="app">',
  '<section class="panel"><span id="status"></span></section><h2 id="sectionTitle">Piatti</h2>',
  '<div id="editor"><form id="editForm" data-row-id="menu-42"><input name="name" value="Pappardelle"><input name="price" value="16"><input name="is_published" type="checkbox" checked><input name="photo" type="file" accept="image/png"><button type="submit">Salva</button></form></div>',
  '<form id="siteEditorForm"><input data-site-field="hero_title" value="Titolo di prova"><input data-site-en-field="hero_title" value="Test title"><button type="submit">Salva testi</button></form>',
  '<section id="popupAdminMedia"><article class="media-card" data-media-url="https://example.test/menu.pdf" data-media-path="menu.pdf"><p>Menu.pdf</p></article></section>',
  '<input id="popupAdminActive" type="checkbox" checked><input id="popupAdminEmail" type="email" value="contatti@example.test">',
  '<input id="popupAdminFiles" type="file" accept="application/pdf"><button id="savePopupAdmin" type="button">Salva popup admin</button>',
  '<section id="items"><div class="site-group"><article class="media-card"><a href="https://example.test/promo.pdf">promo.pdf</a></article></div>',
  '<div class="media-card"><b>Hero</b><img src="https://example.test/hero.jpg" alt=""><input data-imfile="hero-1" type="file"><input data-fx="hero-1" value="50"><input data-fy="hero-1" value="45"><input data-fz="hero-1" value="1.1"><input data-alt="hero-1" value="Sala del ristorante"></div></section>',
  '<input id="pActive" type="checkbox" checked><input id="pTitleIt" value="Titolo IT"><input id="pTitleEn" value="Title EN">',
  '<textarea id="pBodyIt">Testo italiano</textarea><textarea id="pBodyEn">English copy</textarea>',
  '<input id="pButtonIt" value="MENU"><input id="pButtonEn" value="MENU"><input id="pEmail" value="contatti@example.test">',
  '<input id="pFiles" type="file" multiple><button id="saveMedia" type="button">Salva immagini e popup</button>',
  '<input id="libraryFiles" type="file" multiple><button id="uploadLibrary" type="button">Carica libreria</button>',
  '<article class="item" data-row-id="record-abc"><strong>Elemento test</strong><button type="button" data-del="2">Elimina</button><button type="button" data-pub="2">Pubblica</button></article>',
  '</main></body></html>'
].join('\n');

test.beforeAll(async () => {
  managerSource = await fs.readFile(path.join(__dirname, '..', 'admin', 'src', 'draft-manager.js'), 'utf8');
  adminSource = await fs.readFile(path.join(__dirname, '..', 'admin', 'src', 'index.html'), 'utf8');
  server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('<!doctype html><title>Playwright fixture origin</title><p>Ready</p>');
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  origin = 'http://127.0.0.1:' + server.address().port;
});

test.afterAll(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
});

async function openFixture(page) {
  await page.goto(origin);
  await page.setContent(fixture);
  await page.addScriptTag({ content: managerSource });
  await page.waitForFunction(() => Boolean(window.__NF_DRAFTS));
}

async function getDrafts(page) {
  return page.evaluate(() => window.__NF_DRAFTS.snapshot());
}

test('salva record e testi IT/EN come bozze locali separate', async ({ page }) => {
  await openFixture(page);
  await page.locator('#editForm input[name="name"]').fill('Ravioli fatti a mano');
  await page.locator('#editForm').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await expect.poll(async () => (await getDrafts(page)).length).toBe(1);
  const [record] = await getDrafts(page);
  expect(record.type).toBe('record');
  expect(record.payload.recordId).toBe('menu-42');
  expect(record.payload.fields.name).toBe('Ravioli fatti a mano');
  expect(record.payload.fields.is_published).toBe(true);

  await page.locator('#siteEditorForm').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await expect.poll(async () => (await getDrafts(page)).length).toBe(2);
  const drafts = await getDrafts(page);
  expect(drafts[1].type).toBe('site-content');
  expect(drafts[1].payload.fields.hero_title).toBe('Titolo di prova');
  expect(drafts[1].payload.fields._translations.en.hero_title).toBe('Test title');
});

test('esporta un pacchetto JSON autonomo con gli allegati incorporati', async ({ page }) => {
  await openFixture(page);
  await page.locator('#editForm input[type="file"]').setInputFiles({
    name: 'piatto.png', mimeType: 'image/png', buffer: Buffer.from('immagine-di-test')
  });
  await page.locator('#editForm').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await expect.poll(async () => (await getDrafts(page)).length).toBe(1);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#nfDraftExport').click();
  const download = await downloadPromise;
  const pack = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
  expect(pack.format).toBe('note-fiorentine-release-draft');
  expect(pack.approvalRequired).toBe(true);
  expect(pack.productionWrites).toBe(false);
  expect(pack.manifest.assetCount).toBe(1);
  expect(pack.drafts[0].assets[0].data).toContain('data:image/png;base64,');
});

test('raccoglie il popup e blocca l’upload diretto della libreria', async ({ page }) => {
  await openFixture(page);
  await page.locator('#popupAdminFiles').setInputFiles({
    name: 'menu.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-finto')
  });
  await page.locator('#savePopupAdmin').click();
  await expect.poll(async () => (await getDrafts(page)).length).toBe(1);
  const [draft] = await getDrafts(page);
  expect(draft.type).toBe('popup-settings');
  expect(draft.payload.active).toBe(true);
  expect(draft.payload.email).toBe('contatti@example.test');
  expect(draft.payload.files[0].name).toBe('menu.pdf');

  await page.evaluate(() => {
    window.originalUploadHandlerRan = false;
    document.getElementById('uploadLibrary').onclick = () => { window.originalUploadHandlerRan = true; };
  });
  await page.locator('#libraryFiles').setInputFiles({
    name: 'sala.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('foto-di-test')
  });
  await page.locator('#uploadLibrary').click();
  await expect.poll(async () => (await getDrafts(page)).length).toBe(2);
  expect(await page.evaluate(() => window.originalUploadHandlerRan)).toBe(false);
  const drafts = await getDrafts(page);
  expect(drafts[1].type).toBe('media-library');
  expect(drafts[1].payload.files[0].name).toBe('sala.jpg');
});

test('raccoglie testi popup e impostazioni di ritaglio delle immagini', async ({ page }) => {
  await openFixture(page);
  await page.locator('#saveMedia').click();
  await expect.poll(async () => (await getDrafts(page)).length).toBe(1);
  const [draft] = await getDrafts(page);
  expect(draft.type).toBe('popup-and-media');
  expect(draft.payload.title_it).toBe('Titolo IT');
  expect(draft.payload.imageFiles[0].focal_y).toBe('45');
  expect(draft.payload.imageFiles[0].alt_text).toBe('Sala del ristorante');
});

test('include editor visuale nel pacchetto e svuota le bozze locali', async ({ page }) => {
  await openFixture(page);
  await page.evaluate(() => localStorage.setItem('nf-visual-draft-v1', JSON.stringify({
    updatedAt: '2026-11-08T10:00:00.000Z',
    visualStyles: { '.hero-title': { text: 'Nuova copertina', fontSize: '36px', textAlign: 'center' } }
  })));
  await page.evaluate(() => window.dispatchEvent(new Event('nf-visual-draft-updated')));
  await expect.poll(async () => (await getDrafts(page)).length).toBe(1);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#nfDraftExport').click();
  const download = await downloadPromise;
  const pack = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
  expect(pack.drafts.some(d => d.type === 'visual-editor' && d.payload.visualStyles['.hero-title'].text === 'Nuova copertina')).toBe(true);

  page.once('dialog', dialog => dialog.accept());
  await page.locator('#nfDraftClear').click();
  await expect.poll(async () => (await getDrafts(page)).length).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem('nf-visual-draft-v1'))).toBe(null);
});

test('accoda eliminazione e cambio pubblicazione senza eseguirli', async ({ page }) => {
  await openFixture(page);
  await page.locator('[data-del="2"]').click();
  await expect.poll(async () => (await getDrafts(page)).length).toBe(1);
  await page.locator('[data-pub="2"]').click();
  await expect.poll(async () => (await getDrafts(page)).length).toBe(2);
  const drafts = await getDrafts(page);
  expect(drafts[0].type).toBe('delete-record');
  expect(drafts[0].payload.recordId).toBe('record-abc');
  expect(drafts[1].type).toBe('toggle-publish');
});

test('mantiene il blocco di tutte le scritture al database e allo Storage in anteprima', async () => {
  expect(adminSource).toContain("const PREVIEW_WRITE_HOSTS=new Set(['note-fiorentine-admin.vercel.app','www.notefiorentine.it','notefiorentine.it'])");
  expect(adminSource).toContain('const PREVIEW_READ_ONLY=!PREVIEW_WRITE_HOSTS.has(location.hostname)');
  expect(adminSource).toContain("if(PREVIEW_READ_ONLY&&['insert','update','upsert','delete'].includes(String(key)))return blockedWrite");
  expect(adminSource).toContain("if(PREVIEW_READ_ONLY&&['upload','remove','update','move','copy'].includes(String(key)))return blockedWrite");
  expect(adminSource).toContain('<script src="./draft-manager.js"></script>');
});


test('ottimizza le immagini prima dei caricamenti e mantiene la cache annuale', async () => {
  expect(adminSource).toContain('async function optimizeImageFile(file)');
  expect(adminSource).toContain("1800/width");
  expect(adminSource).toContain("canvas.toBlob(resolve,'image/webp',0.82)");
  expect(adminSource).toContain('const optimized=await optimizeImageFile(file)');
  expect(adminSource).toContain("const uploadFile=f.type.startsWith('image/')?await optimizeImageFile(f):f");
  expect(adminSource).toContain('const optimized=await optimizeImageFile(f)');
  expect(adminSource).toContain("cacheControl:'31536000'");
  expect(adminSource).toContain('if(!file||!/^image\\/(jpeg|png|webp)$/i.test(file.type))return file;');
});
