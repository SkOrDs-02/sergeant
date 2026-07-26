/**
 * Vercel Edge Middleware — проксіює `/api/*` на бекенд (Coolify).
 *
 * Лендінг деплоїться окремим Vercel-проєктом, а API живе на іншому хості.
 * Без проксі клієнтський `fetch("/api/v1/waitlist")` бив би у власний домен
 * лендінга (404), а абсолютний URL уперся б у CORS: `getAllowedOrigins()` в
 * `apps/server/src/http/cors.ts` — fail-closed allowlist. Проксі робить запит
 * same-origin, тому CORS не задіяний узагалі й allowlist не треба розширювати.
 *
 * Дзеркалить `apps/web/middleware.ts`; відмінність лише в тому, що лендінг не
 * має сесій і OAuth — але `redirect: "manual"` і зачистка hop-by-hop лишаються,
 * бо це властивості коректного проксі, а не специфіка auth.
 *
 * Конфігурація:
 *   - `BACKEND_URL` (Vercel env, без префіксу VITE_) — base URL бекенду.
 *     Без неї middleware — no-op: запит іде далі й ловить чесний 404 замість
 *     тихого HTML-фолбеку (див. негативний lookahead у `vercel.json`).
 */

export const config = {
  matcher: "/api/:path*",
};

/**
 * Дозволені схеми для `BACKEND_URL`: `https://*` або `http://` на localhost.
 * Будь-яке інше значення робить middleware no-op замість тихого downgrade
 * проксі на незашифрований канал чи витоку запитів на непередбачений хост.
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

// RFC 7230 §6.1 — hop-by-hop заголовки не можна форвардити через проксі.
const HOP_BY_HOP = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];

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
  for (const h of HOP_BY_HOP) headers.delete(h);
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

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers,
  });
}
