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
 *   - `SERGEANT_CLIENT_IP_SECRET` (Vercel env, ≥32 символи; той самий рядок у
 *     Coolify для API) — секрет підпису IP клієнта (rel-03). Без нього
 *     службові заголовки IP лише стираються і нічого не підписується.
 *
 * IP клієнта (rel-03). Бекенд за Traefik бачить лише egress-адресу Vercel,
 * тож усі per-IP ліміти спільні. Тут беремо IP з ПЕРШОГО значення
 * `x-forwarded-for` (Vercel перезаписує його справжнім IP клієнта) і
 * передаємо як `x-sergeant-client-ip` + `x-sergeant-client-ip-sig` =
 * base64url(HMAC-SHA256(secret, ip)). Секрет у заголовок не потрапляє.
 * Вхідні копії обох заголовків від клієнта видаляються ДО підпису. Сервер
 * довіряє IP лише за валідного підпису (`apps/server/src/http/clientIp.ts`).
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

const CLIENT_IP_HEADER = "x-sergeant-client-ip";
const CLIENT_IP_SIG_HEADER = "x-sergeant-client-ip-sig";

function toBase64Url(bytes: ArrayBuffer): string {
  let bin = "";
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Перше значення `x-forwarded-for` + HMAC-підпис. `undefined`, якщо секрету
 * немає (фіча вимкнена) або XFF порожній. Мінімальна довжина секрету (32)
 * перевіряється й тут: коротший секрет вважаємо незаданим, щоб не
 * підписувати слабким ключем.
 */
async function signClientIp(
  secret: string | undefined,
  forwardedFor: string | null,
): Promise<{ ip: string; sig: string } | undefined> {
  if (!secret || secret.length < 32) return undefined;
  const ip = forwardedFor?.split(",")[0]?.trim();
  if (!ip) return undefined;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(ip),
  );
  return { ip, sig: toBase64Url(mac) };
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
  // rel-03: клієнт не може принести власний «підписаний» IP.
  headers.delete(CLIENT_IP_HEADER);
  headers.delete(CLIENT_IP_SIG_HEADER);
  const signed = await signClientIp(
    process.env["SERGEANT_CLIENT_IP_SECRET"],
    request.headers.get("x-forwarded-for"),
  );
  if (signed) {
    headers.set(CLIENT_IP_HEADER, signed.ip);
    headers.set(CLIENT_IP_SIG_HEADER, signed.sig);
  }
  headers.set("x-forwarded-host", url.host);
  headers.set("x-forwarded-proto", url.protocol.replace(":", ""));

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const body = hasBody ? await request.arrayBuffer() : undefined;

  const upstream = await fetch(target.toString(), {
    method: request.method,
    headers,
    ...(body ? { body } : {}),
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
