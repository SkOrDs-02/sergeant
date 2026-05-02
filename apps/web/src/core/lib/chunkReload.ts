/**
 * Recovery from `Failed to fetch dynamically imported module` errors.
 *
 * Контекст: Vercel задеплоїв новий бандл, користувач лишився на відкритій
 * вкладці зі старим `index.html`. Коли SPA пробує підвантажити lazy-чанк
 * (`React.lazy(() => import(...))` або `<link rel="modulepreload">`), URL зі
 * старим хешем уже не існує — Vercel віддає SPA-fallback `index.html`
 * замість JS, браузер парсить HTML як модуль і кидає
 * `Failed to fetch dynamically imported module` (або
 * `Importing a module script failed`, або
 * `not a valid JavaScript MIME type`).
 *
 * Лікування — один автоматичний `location.reload()`, з cooldown-у через
 * `sessionStorage`, щоб не залипати у нескінченному релоад-циклі (якщо
 * проблема насправді не зі stale-кешем, а з реально зламаним чанком).
 */

const KEY = "__sergeant_chunk_reload_at";
const COOLDOWN_MS = 10_000;

const CHUNK_ERROR_PATTERNS: ReadonlyArray<RegExp> = [
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /Loading chunk \S+ failed/i,
  /Loading CSS chunk \S+ failed/i,
  /not a valid JavaScript MIME type/i,
  /error loading dynamically imported module/i,
];

function getMessage(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const maybeError = value as { message?: unknown; toString?: () => string };
    if (typeof maybeError.message === "string") return maybeError.message;
    if (typeof maybeError.toString === "function") {
      try {
        return maybeError.toString();
      } catch {
        return "";
      }
    }
  }
  return "";
}

export function isChunkLoadError(err: unknown): boolean {
  if (!err) return false;
  const name =
    typeof err === "object" && err !== null
      ? ((err as { name?: unknown }).name ?? "")
      : "";
  if (name === "ChunkLoadError") return true;
  const message = getMessage(err);
  return CHUNK_ERROR_PATTERNS.some((re) => re.test(message));
}

/**
 * Reload page once. Returns `true` якщо релоад виконано, `false` якщо
 * cooldown ще не минув (релоад уже був нещодавно — щоб не зациклитись).
 *
 * Параметр `now` — лише для тестів.
 */
export function reloadOnceForChunkError(now: number = Date.now()): boolean {
  if (typeof window === "undefined") return false;
  let storage: Storage | null = null;
  try {
    storage = window.sessionStorage;
  } catch {
    storage = null;
  }
  if (storage) {
    try {
      const last = Number(storage.getItem(KEY) ?? 0);
      if (last && now - last < COOLDOWN_MS) return false;
      storage.setItem(KEY, String(now));
    } catch {
      // sessionStorage заблоковано (privacy mode тощо) — продовжуємо
      // без guard, бо альтернатива гірша (порожній екран).
    }
  }
  window.location.reload();
  return true;
}

/**
 * Install global listeners for chunk-load failures. Idempotent: повторні
 * виклики — no-op (захист від подвійного маунту під StrictMode у dev).
 */
let installed = false;
export function installChunkLoadRecover(): void {
  if (installed) return;
  if (typeof window === "undefined") return;
  installed = true;

  // Vite виставляє `vite:preloadError` на window коли `<link
  // rel="modulepreload">` хелпер не може догрузити чанк.
  window.addEventListener("vite:preloadError", (event: Event) => {
    if (reloadOnceForChunkError()) {
      event.preventDefault();
    }
  });

  // `React.lazy(() => import(...))` без preload-у: невдалий import
  // поверне rejected promise. Suspense ловить — але якщо немає
  // ErrorBoundary вище за нього, rejection доходить сюди.
  window.addEventListener("unhandledrejection", (event) => {
    if (isChunkLoadError(event.reason) && reloadOnceForChunkError()) {
      event.preventDefault();
    }
  });

  // Класичні `error` події (script tag failures), на всякий випадок.
  window.addEventListener("error", (event) => {
    if (isChunkLoadError(event.error) && reloadOnceForChunkError()) {
      event.preventDefault();
    }
  });
}

/** Test-only reset, expose як named export для unit-тестів. */
export function __resetChunkReloadInstalledForTests(): void {
  installed = false;
}
