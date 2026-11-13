# nf-media-cache (staging)

Cloudflare Worker that proxies public image objects from the **Neon migration branch only**.

## Current safety boundary

- Origin: Neon branch `br-gentle-morning-bankk7pf`
- Bucket: `note-fiorentine-public` (`public_read`)
- Public route: `/media/<object-key>`
- Health route: `/health`
- Allowed methods: GET and HEAD only
- Allowed types: JPG, JPEG, PNG, WebP, GIF, AVIF, SVG
- No S3 credentials, database credentials, admin APIs, or write operations.
- No production DNS, Vercel, Supabase, or production storage changes.

## Important

The staging bucket is currently empty. The Worker can return its health response, but media proxy testing requires uploading a harmless test image to this bucket and confirming anonymous origin access first.

## Dashboard editor

The complete Worker source is in `src/index.js`. If using the Cloudflare dashboard editor, replace the starter Hello World source with this file's contents, then save/deploy only when explicitly instructed. The `wrangler.jsonc` file documents/enables Workers Cache for CLI deployments; dashboard-only deployments must be checked for caching behavior with response headers and repeated requests.

## Routes

- `GET /health` — uncached health JSON.
- `GET /media/example.jpg?v=1` — fetches `note-fiorentine-public/example.jpg`.
- Unsupported methods, path traversal, unsupported extensions, query parameters other than `v`, and non-image origin responses are rejected.

## Staging validation still required

1. Upload a test image to the staging bucket.
2. Verify anonymous GET against the Neon object URL.
3. Deploy this Worker to its workers.dev hostname.
4. Request the same image twice and verify the second response is a cache HIT.
5. Verify 404, invalid paths, HEAD, unsupported methods and MIME checks.
6. Only after these pass, design the separate production migration and origin configuration.

Do not point the live Note Fiorentine site at this Worker yet.
