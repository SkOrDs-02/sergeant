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

export default async function middleware(
  request: Request,
): Promise<Response | undefined> {
  const backend = process.env.BACKEND_URL;
  if (!backend) return undefined;

  const url = new URL(request.url);
  const target = new URL(`${backend}${url.pathname}${url.search}`);

  const headers = new Headers(request.headers);
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
