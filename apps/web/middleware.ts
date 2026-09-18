/**
 * Vercel Edge Middleware — проксіює `/api/*` запити на бекенд (Railway).
 *
 * Третьосторонні cookie (фронт `sergeant.vercel.app` ↔ API
 * `sergeant-production.up.railway.app`) блокуються Safari ITP та Chrome
 * Tracking Protection — це ламає Better Auth state-cookie у Google OAuth
 * флові (callback читає її з upstream-домена і отримує `state_mismatch`).
 * Проксі робить запит first-party до домена фронта — cookie зберігається.
 *
 * `redirect: "manual"` критичний для OAuth: Better Auth callback редіректить
 * на сторінку помилок/успіху, і ми ОБОВ'ЯЗКОВО мусимо віддати 3xx-відповідь
 * назад у браузер (а не слідувати редіректу серверно). Інакше fetch піде по
 * upstream-Location, відносні `Location: /?error=...` зрезолвляться відносно
 * домена Railway, який не сервить `/`, → 404 «Cannot GET /».
 *
 * Конфігурація:
 *   - `BACKEND_URL` (Vercel env, без префіксу VITE_) — base URL бекенду,
 *     напр. `https://sergeant-production.up.railway.app`. Без неї
 *     middleware — no-op, запит йде далі (зручно для dev/preview без API).
 */

export const config = {
  matcher: "/api/:path*",
};

/**
 * Audit F6: дозволені схеми для BACKEND_URL — `https://*` або
 * `http://localhost`/`127.0.0.1` (dev). Будь-яке інше значення робить
 * middleware no-op замість тихого downgrade проксі та витоку cookies на
 * непередбачений хост.
 */
function isAllowedBackend(raw: string): URL | undefined {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return undefined;
  }
  if (parsed.protocol === "https:") return parsed;
  if (
    parsed.protocol === "http:" &&
    (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
  ) {
    return parsed;
  }
  return undefined;
}

export default async function middleware(
  request: Request,
): Promise<Response | undefined> {
  const backend = process.env["BACKEND_URL"];
  if (!backend) return undefined;

  const backendUrl = isAllowedBackend(backend);
  if (!backendUrl) return undefined;

  const url = new URL(request.url);
  const target = new URL(`${url.pathname}${url.search}`, backendUrl.origin);

  const headers = new Headers(request.headers);
  // Audit 10 F7: drop hop-by-hop headers before forwarding upstream.
  // Browsers won't usually attach these on a same-origin proxy hop, but
  // upstream proxies (Vercel edge → Railway) can rewrite `connection` /
  // `keep-alive` in ways that confuse the downstream HTTP/2 server.
  // Stripping them here is RFC 7230 §6.1-conformant and removes the
  // foot-gun the audit called out.
  for (const h of [
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
  ]) {
    headers.delete(h);
  }
  headers.set("x-forwarded-host", url.host);
  headers.set("x-forwarded-proto", url.protocol.replace(":", ""));

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const body = hasBody ? await request.arrayBuffer() : undefined;

  const upstream = await fetch(target.toString(), {
    method: request.method,
    headers,
    body,
    redirect: "manual",
  });

  // `fetch(..., { redirect: "manual" })` у Vercel Edge runtime повертає
  // звичайний Response з оригінальним статусом і `Location`, тож можна
  // напряму репропагувати у відповідь.
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers,
  });
}
