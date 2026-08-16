/**
 * Єдине джерело істини для `environment` у всій веб-телеметрії.
 *
 * Навіщо окремий модуль, а не два `import.meta.env[...]` на місцях: Sentry і
 * PostHog раніше рахували середовище самостійно й розійшлись. Наслідки видно
 * у зібраних даних (аудит 2026-08-16):
 *
 *   1. **`vercel-production`.** `sentry.ts` мав фолбек на `import.meta.env.MODE`.
 *      На Vercel `MODE` віддає власне значення білду, тож у проєкті
 *      `sergeant-web` завівся сторонній environment, якого не бачить жоден
 *      фільтр по `production`. Тут `MODE` не використовується взагалі.
 *
 *   2. **Preview-деплої під виглядом бети.** Vercel віддає preview-збіркам ті
 *      самі env-vars, що й основному деплою, тож `VITE_APP_ENV=beta` успадковують
 *      і гілкові URL-и. У `sergeant-prod` через це осіли події з шести сторонніх
 *      хостів (`beta-git-*`, `sergeant-git-main-*` тощо) — впереміш із реальними.
 *      Тому hostname має пріоритет над env-var саме для preview-детекції: змінну
 *      можна успадкувати, а канонічний домен — ні.
 *
 * Порядок резолву:
 *   `development` (localhost) → `preview` (хост поза allowlist-ом) → явна
 *   env-var → `production`.
 *
 * SSR-safe: без `window` падає назад на env-var, бо hostname-евристика там
 * недоступна.
 */

/**
 * Канонічні хости, за якими деплой вважається «справжнім», а не preview-ем.
 * Перевизначається через `VITE_CANONICAL_HOSTS` (кома-розділений список), щоб
 * ребренд або новий домен не вимагав релізу коду.
 *
 * Усе, чого тут немає і що не є localhost, — preview. Це свідомо
 * fail-safe-напрямок: краще позначити справжній деплой як `preview` і побачити
 * це в дашборді, ніж мовчки підмішати гілкові події у прод-вибірку.
 */
const DEFAULT_CANONICAL_HOSTS = [
  "sergeant.vercel.app",
  "beta-tau-gilt.vercel.app",
  "sergeant-landing.vercel.app",
] as const;

function canonicalHosts(): string[] {
  const raw = import.meta.env["VITE_CANONICAL_HOSTS"] as string | undefined;
  if (!raw) return [...DEFAULT_CANONICAL_HOSTS];
  return raw
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

function isLocalHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".local")
  );
}

/**
 * Явно задане середовище. `VITE_SENTRY_ENVIRONMENT` лишається вужчим
 * override-ом на випадок, коли Sentry треба розвести окремо від PostHog;
 * `VITE_APP_ENV` — спільний перемикач.
 */
function explicitEnvironment(): string | null {
  const raw =
    (import.meta.env["VITE_SENTRY_ENVIRONMENT"] as string | undefined) ||
    (import.meta.env["VITE_APP_ENV"] as string | undefined);
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Резолвить середовище для телеметрії.
 *
 * @param hostname Перевизначення хоста — лише для тестів. У рантаймі береться
 *   `window.location.hostname`.
 */
export function resolveDeployEnvironment(hostname?: string): string {
  const host = (
    hostname ??
    (typeof window !== "undefined" ? window.location?.hostname : undefined)
  )?.toLowerCase();

  // Без `window` (SSR, воркер, тести без jsdom) hostname-евристика недоступна —
  // лишається лише те, що явно задано на білді.
  if (!host) return explicitEnvironment() ?? "production";

  if (isLocalHost(host)) return "development";

  // Hostname свідомо б'є env-var: preview успадковує змінні основного деплою,
  // тож довіряти їм тут не можна (див. doc-string модуля, пункт 2).
  if (!canonicalHosts().includes(host)) return "preview";

  return explicitEnvironment() ?? "production";
}
