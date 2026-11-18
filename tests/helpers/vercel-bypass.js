// Apply each project's bypass token only to its own Vercel preview origin.
// Never attach these credentials to Supabase, Vimeo, or other third-party requests.
async function attachVercelBypass(page) {
  const siteUrl = process.env.SITE_PREVIEW_URL;
  const adminUrl = process.env.ADMIN_PREVIEW_URL;
  const siteHost = siteUrl ? new URL(siteUrl).hostname : null;
  const adminHost = adminUrl ? new URL(adminUrl).hostname : null;
  const siteSecret = siteUrl && new URL(siteUrl).searchParams.has('_vercel_share') ? null : process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const adminSecret = adminUrl && new URL(adminUrl).searchParams.has('_vercel_share') ? null : process.env.ADMIN_VERCEL_AUTOMATION_BYPASS_SECRET;

  await page.route('**/*', async route => {
    const requestUrl = new URL(route.request().url());
    let secret = null;
    if (siteHost && requestUrl.hostname === siteHost) secret = siteSecret;
    if (adminHost && requestUrl.hostname === adminHost) secret = adminSecret;

    if (!secret) return route.continue();
    const headers = {
      ...route.request().headers(),
      'x-vercel-protection-bypass': secret,
      'x-vercel-set-bypass-cookie': 'true'
    };
    return route.continue({ headers });
  });
}

module.exports = { attachVercelBypass };
