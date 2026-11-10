const { test, expect } = require('@playwright/test');

test('admin: login e diagnostica si caricano senza toccare Supabase', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Controllo admin eseguito una volta sola');

  const adminBaseUrl = process.env.ADMIN_BASE_URL;
  test.skip(!adminBaseUrl, 'ADMIN_BASE_URL non configurato');

  const supabaseRequests = [];
  const pageErrors = [];

  // Isolamento assoluto: nessuna richiesta raggiunge il progetto Supabase reale.
  await page.route(/^https:\/\/(nculgrwlzjitggjcgbpp|iuxskknbopboynjlsxbk)\.supabase\.co\//, async route => {
    supabaseRequests.push({
      method: route.request().method(),
      url: route.request().url()
    });
    await route.abort('blockedbyclient');
  });

  page.on('pageerror', error => pageErrors.push(error.message));

  const response = await page.goto(new URL('/src/index.html', adminBaseUrl).toString());
  expect(response).not.toBeNull();
  expect(response.status()).toBeLessThan(400);

  await expect(page.getByRole('heading', { name: 'Accesso riservato' })).toBeVisible();
  await expect(page.locator('#email')).toHaveAttribute('type', 'email');
  await expect(page.locator('#password')).toHaveAttribute('type', 'password');

  // Il pannello diagnostico deve essere utilizzabile anche senza autenticazione.
  await page.getByRole('button', { name: 'DEBUG' }).click();
  await expect(page.locator('#nf-debug-panel')).toBeVisible();
  await expect(page.locator('#nf-debug-output')).toContainText('Modulo amministrativo');

  // Non vengono effettuati login, upload, salvataggi o chiamate al database.
  expect(supabaseRequests).toEqual([]);
  expect(pageErrors).toEqual([]);

  // L'editor visuale deve conservare una bozza locale e non scrivere su site_content.
  const adminHtml = await page.content();
  const visualEditorStart = adminHtml.indexOf('// Editor visuale');
  expect(visualEditorStart).toBeGreaterThanOrEqual(0);
  const visualEditorSource = adminHtml.slice(visualEditorStart);
  expect(visualEditorSource).toContain('Salva bozza');
  expect(visualEditorSource).toContain('localStorage.setItem(visualDraftKey');
  expect(visualEditorSource).not.toContain("db.from('site_content').upsert");
  expect(adminHtml).toContain('Release in preparazione');
  expect(adminHtml).toContain('Esporta pacchetto');
  expect(adminHtml).not.toContain('Pubblica modifiche del sito');
  expect(adminHtml).toContain("https://iuxskknbopboynjlsxbk.supabase.co");
  expect(adminHtml).toContain("https://nculgrwlzjitggjcgbpp.supabase.co");
  expect(adminHtml).toContain("const ADMIN_PRODUCTION=ADMIN_HOST==='note-fiorentine-admin.vercel.app'");
  expect(adminHtml).toContain("const ADMIN_PREVIEW=ADMIN_HOST.startsWith('note-fiorentine-admin-')");
  expect(adminHtml).toContain("const PREVIEW_READ_ONLY=!(ADMIN_PRODUCTION||ADMIN_PREVIEW);");
  expect(adminHtml).toContain("createClient(window.NF_SUPABASE_CONFIG.url,window.NF_SUPABASE_CONFIG.key)");
  expect(adminHtml).toContain("if(PREVIEW_READ_ONLY&&['insert','update','upsert','delete'].includes(String(key)))");


  const draftManagerSource = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'admin/src/draft-manager.js'), 'utf8');
  expect(draftManagerSource).toContain("status:'pending-review'");
  expect(draftManagerSource).toContain('approvalRequired:true,productionWrites:false');

  const saveMediaStart = adminHtml.indexOf('async function saveMedia()');
  const saveMediaEnd = adminHtml.indexOf('function field(', saveMediaStart);
  const saveMediaSource = adminHtml.slice(saveMediaStart, saveMediaEnd);
  expect(saveMediaSource).toContain('dbWritesStarted');
  expect(saveMediaSource).toContain('I file precedenti restano conservati');
  expect(saveMediaSource).not.toContain('remove(old)');
  expect(saveMediaSource).not.toContain('old.push');

  const popupSaveStart = adminHtml.indexOf('async function savePopupAdmin()');
  const popupSaveEnd = adminHtml.indexOf('function mediaUrl(', popupSaveStart);
  const popupSaveSource = adminHtml.slice(popupSaveStart, popupSaveEnd);
  expect(popupSaveSource).not.toContain('remove(removed)');
  expect(popupSaveSource).toContain('dbWriteSucceeded');
});
