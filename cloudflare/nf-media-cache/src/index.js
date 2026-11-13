/**
 * Note Fiorentine media cache — staging only.
 *
 * Public read-only proxy for the Neon staging bucket.
 * No Neon credentials are used or exposed by this Worker.
 */
const ORIGIN_BASE =
  "https://br-gentle-morning-bankk7pf.storage.c-8.eu-central-1.aws.neon.tech/note-fiorentine-public/";

const ALLOWED_TYPES = new Set([
  ".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".svg"
]);

function jsonResponse(body, status, extra = {}) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extra
    }
  });
}

function safeObjectKey(rawPath) {
  if (!rawPath || rawPath.length > 1024 || rawPath.startsWith("/") || rawPath.includes("\\")) {
    return null;
  }

  const rawSegments = rawPath.split("/");
  if (rawSegments.some((segment) => !segment || segment === "." || segment === "..")) {
    return null;
  }

  let decoded;
  try {
    decoded = rawSegments.map((segment) => decodeURIComponent(segment));
  } catch {
    return null;
  }

  if (decoded.some((segment) =>
    !segment || segment === "." || segment === ".." ||
    segment.includes("/") || segment.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(segment)
  )) {
    return null;
  }

  const last = decoded[decoded.length - 1];
  const dot = last.lastIndexOf(".");
  const extension = dot >= 0 ? last.slice(dot).toLowerCase() : "";
  if (!ALLOWED_TYPES.has(extension)) return null;

  return decoded.map(encodeURIComponent).join("/");
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return jsonResponse(JSON.stringify({
        service: "nf-media-cache",
        status: "ok",
        environment: "staging",
        origin: "neon-object-storage"
      }), 200);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return jsonResponse(JSON.stringify({ error: "Method not allowed" }), 405, {
        "Allow": "GET, HEAD"
      });
    }

    if (!url.pathname.startsWith("/media/")) {
      return jsonResponse(JSON.stringify({ error: "Not found" }), 404);
    }

    const key = safeObjectKey(url.pathname.slice("/media/".length));
    if (!key) {
      return jsonResponse(JSON.stringify({ error: "Invalid or unsupported media path" }), 400);
    }

    // Only the optional version token is accepted. It remains part of the
    // Worker URL/cache key but is never sent to the storage origin.
    for (const name of url.searchParams.keys()) {
      if (name !== "v") {
        return jsonResponse(JSON.stringify({ error: "Unsupported query parameter" }), 400);
      }
    }

    const originUrl = ORIGIN_BASE + key;
    const originHeaders = new Headers();
    const range = request.headers.get("Range");
    if (range) originHeaders.set("Range", range);

    let upstream;
    try {
      upstream = await fetch(originUrl, {
        method: request.method,
        headers: originHeaders,
        redirect: "manual"
      });
    } catch {
      return jsonResponse(JSON.stringify({ error: "Storage origin unavailable" }), 502);
    }

    if (upstream.status !== 200 && upstream.status !== 206) {
      return jsonResponse(
        JSON.stringify({ error: upstream.status === 404 ? "Media not found" : "Storage request failed" }),
        upstream.status === 404 ? 404 : 502
      );
    }

    const contentType = upstream.headers.get("Content-Type") || "";
    if (!contentType.toLowerCase().startsWith("image/")) {
      return jsonResponse(JSON.stringify({ error: "Origin returned a non-image resource" }), 415);
    }

    const headers = new Headers(upstream.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Cross-Origin-Resource-Policy", "cross-origin");
    headers.set("Cache-Control", upstream.status === 200
      ? "public, max-age=60, s-maxage=600, stale-while-revalidate=60"
      : "no-store");

    headers.delete("Set-Cookie");
    headers.delete("Location");

    return new Response(upstream.body, {
      status: upstream.status,
      headers
    });
  }
};
