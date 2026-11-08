const { test, expect } = require('@playwright/test');

test.describe('Admin release drafts', () => {
  test('captures an admin edit locally and exports a review package', async ({ page }) => {
    await page.route('https://esm.sh/@supabase/supabase-js@2', route => route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: 'export function createClient(){return {auth:{getSession:async()=>({data:{session:null}})}}}'
    }));
    const remoteWrites = [];
    await page.route('https://nculgrwlzjitggjcgbpp.supabase.co/**', route => {
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(route.request().method())) remoteWrites.push(route.request().method());
      return route.abort();
    });

    const base = process.env.ADMIN_BASE_URL || 'http://127.0.0.1:4174';
    await page.goto(base + '/src/index.html');
    await page.waitForFunction(() => typeof window.__NF_DRAFTS?.count === 'function');
    await page.evaluate(() => document.getElementById('app').classList.remove('hidden'));
    await expect(page.locator('#nfDraftPanel')).toBeVisible();

    await page.evaluate(() => {
      const form = document.createElement('form');
      form.id = 'editForm';
      form.innerHTML = '<input name="name" value="Test piatto"><input name="price" value="10">';
      document.body.appendChild(form);
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    await expect(page.locator('#nfDraftPanel .status')).toContainText('1 modifiche');
    const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('nf-release-drafts-v1') || '[]'));
    expect(draft).toHaveLength(1);
    expect(draft[0].payload.fields.name).toBe('Test piatto');
    expect(remoteWrites).toEqual([]);

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#nfDraftExport').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^note-fiorentine-release-draft-.*\.json$/);
  });
});
