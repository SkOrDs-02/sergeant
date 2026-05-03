/**
 * Базовий URL для API мобільного клієнта.
 *
 * Логіка дзеркалить `apps/web/src/shared/lib/api/apiUrl.ts`:
 * - читаємо `EXPO_PUBLIC_API_BASE_URL` (publicly inlined at build time);
 * - префіксуємо `/api/*` версією (за замовчуванням `v1`), окрім `/api/auth/*`,
 *   який Better Auth тримає на фіксованому `basePath`.
 *
 * Мобільному клієнту ми ЗАВЖДИ шлемо у `/api/v1/*` — контракт описано в
 * `docs/architecture/api-v1.md` і `docs/mobile/overview.md`. Тому `apiUrl("/api/foo")` →
 * `${base}/api/v1/foo`, а `apiUrl("/api/auth/sign-in/email")` лишається
 * `${base}/api/auth/sign-in/email`.
 */
const DEFAULT_API_VERSION = "v1";

function getApiVersion(): string {
  const raw = process.env.EXPO_PUBLIC_API_VERSION?.trim();
  if (!raw) return DEFAULT_API_VERSION;
  if (raw === "none") return "";
  return raw.replace(/^\/+|\/+$/g, "");
}

function applyVersion(path: string): string {
  const version = getApiVersion();
  if (!version) return path;
  if (!path.startsWith("/api/")) return path;
  if (path === "/api" || path === "/api/") return `/api/${version}`;
  if (path === "/api/auth" || path.startsWith("/api/auth/")) {
    return path;
  }
  if (path.startsWith(`/api/${version}/`) || path === `/api/${version}`) {
    return path;
  }
  return `/api/${version}${path.slice("/api".length)}`;
}

export function getApiBaseURL(): string {
  const raw = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (!raw) return "";
  return raw.replace(/\/$/, "");
}

export function apiUrl(path: string): string {
  const base = getApiBaseURL();
  const rawPath = path.startsWith("/") ? path : `/${path}`;
  const versioned = applyVersion(rawPath);
  if (!base) return versioned;
  if (versioned.startsWith("http://") || versioned.startsWith("https://")) {
    return versioned;
  }
  return `${base}${versioned}`;
}
