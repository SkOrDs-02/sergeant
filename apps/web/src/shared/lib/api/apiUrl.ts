/**
 * Базовий URL для API.
 * - `VITE_API_BASE_URL` задано → прямий URL (прод на Railway тощо).
 * - Інакше → відносні шляхи (локально Vite проксує на бекенд, див. vite.config).
 *
 * Версіонування: колери шлють `apiUrl("/api/foo")` як і раніше, але фактичний
 * запит іде у `/api/v1/foo`. Сервер підтримує обидва префікси одночасно
 * (див. `apiVersionRewrite` у `server/app.ts`) — перемикання прозоре.
 * `apiUrl("/api/auth/...")` свідомо НЕ версіонується: Better Auth має
 * фіксований `basePath: "/api/auth"`, і плагіни client-side очікують
 * саме цей шлях.
 *
 * Перевизначити поведінку можна через `VITE_API_VERSION`:
 *   - `""` / `"none"` → старий шлях без префікса версії (fallback на час
 *     постеменого rollout, якщо треба відкотити фронт без редеплою сервера);
 *   - `"v1"` (за замовчуванням) → `/api/v1/*`.
 */
const DEFAULT_API_VERSION = "v1";

function getApiVersion(): string {
  const raw =
    typeof import.meta !== "undefined" && import.meta.env?.VITE_API_VERSION
      ? String(import.meta.env.VITE_API_VERSION).trim()
      : "";
  if (!raw) return DEFAULT_API_VERSION;
  if (raw === "none") return "";
  return raw.replace(/^\/+|\/+$/g, "");
}

/**
 * Значення, яке треба передати у `createApiClient({ apiPrefix })`, щоб
 * поведінка `@sergeant/api-client` була консистентна з тим, що повертає
 * `apiUrl()` для прямих `fetch`-викликів: або `/api/v1` (default), або
 * `/api` у legacy-режимі `VITE_API_VERSION=none`.
 *
 * Завдяки цьому web-код, що досі ходить через `fetch(apiUrl(...))`, і
 * код, що перейшов на api-client, завжди бʼють у один і той самий
 * префікс — перемикнути обидва одразу можна через одну env-змінну.
 */
export function getApiPrefix(): string {
  const version = getApiVersion();
  return version ? `/api/${version}` : "/api";
}

function applyVersion(path: string): string {
  const version = getApiVersion();
  if (!version) return path;
  if (!path.startsWith("/api/")) return path;
  if (path === "/api" || path === "/api/") return `/api/${version}`;
  // Auth plugin-и Better Auth client зашиті під `/api/auth/*` — не чіпаємо.
  // Жорстка перевірка сегмента (а не `startsWith("/api/auth")`), щоб
  // `/api/authorize`, `/api/authentication` та інші майбутні endpoint-и з
  // таким префіксом не провалилися повз версіонування. Консистентно з
  // `apps/web/src/sw.ts` (пошук "api/auth"), де auth-шляхи теж
  // виключаються точним сегментом.
  if (path === "/api/auth" || path.startsWith("/api/auth/")) {
    return path;
  }
  // Уже явно версіонований шлях (напр. сторонній код, що вказав `/api/v1/...`)
  // — залишаємо як є, щоб не отримати `/api/v1/v1/...`.
  if (path.startsWith(`/api/${version}/`) || path === `/api/${version}`) {
    return path;
  }
  return `/api/${version}${path.slice("/api".length)}`;
}

export function apiUrl(path: string): string {
  const raw =
    typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL
      ? String(import.meta.env.VITE_API_BASE_URL).trim()
      : "";
  const base = raw.replace(/\/$/, "");
  const rawPath = path.startsWith("/") ? path : `/${path}`;
  const p = applyVersion(rawPath);
  return base ? `${base}${p}` : p;
}
