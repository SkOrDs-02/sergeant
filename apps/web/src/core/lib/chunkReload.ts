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
 * Лікування — один автоматичний `location.reload()` з ДВОМА захисними
 * рівнями (PR-36 / stack-pulse 2026-05 L9):
 *
 * 1. **Time cooldown** (`COOLDOWN_MS = 10s`): дві помилки поспіль
 *    у вікні 10 секунд — second reload блокується. Захищає від найгіршого
 *    випадку: чанк ламається відразу після reload-у і миттєво триггерить
 *    новий reload, нескінченно. Існує з первинного landing-у `chunkReload`.
 *
 * 2. **Counter-window guard** (`MAX_RELOADS = 3` / `RESET_AFTER_MS = 5min`):
 *    якщо проблема **persistent** (CDN broken на 30+ хвилин, broken-deploy
 *    rolled forward), 10-секундний cooldown по черзі дозволяє кожні
 *    11 секунд один новий reload — і користувач все одно у нескінченному
 *    flicker-циклі, просто з 11-секундною затримкою. Counter лічить повні
 *    reload-цикли у sliding window 5 хвилин; на 4-му підряд — фолбек у
 *    `logger.error` + ChunkPersistentError-телеметрію (Sentry breadcrumb)
 *    замість ще одного reload-у. Користувач отримує помилку у консолі
 *    + ErrorBoundary-fallback з нашого UI замість blank-screen-flicker-у.
 *
 * Після 5 хвилин без подальших chunk-errors counter авто-резетить себе
 * на наступному reload-event-і, тож разові transient-збої не «отруюють»
 * довгий tab-session.
 */

import { logger } from "@shared/lib";

const KEY = "__sergeant_chunk_reload_at";
const COOLDOWN_MS = 10_000;

// PR-36 (L9). Counter-based escape hatch для persistent failures, що
// проходять повз 10s cooldown.
const KEY_COUNT = "__sergeant_chunk_reload_count";
const KEY_FIRST_AT = "__sergeant_chunk_reload_first_at";

/**
 * Hard cap reload-ів у одному window-і. `3` залишає простір нормальним
 * stale-deploy сценаріям (1 reload — стандартний шлях; 2 — поки fastly
 * прогрівається; 3 — крайній випадок) і блокує infinite-loop.
 */
export const MAX_RELOADS = 3;

/**
 * Sliding window для counter-у. Після 5 хв без reload-event-у counter
 * резетиться на наступному reload-event-і (transient мережна
 * нестабільність не повинна «отруювати» довгу сесію).
 */
export const RESET_AFTER_MS = 5 * 60_000;

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
 * Custom error для `MAX_RELOADS`-exceeded випадку. Викидається замість
 * виклику `window.location.reload()`, щоб ErrorBoundary міг показати
 * UI-fallback (blank-screen flicker → видима помилка).
 */
export class ChunkPersistentError extends Error {
  override readonly name = "ChunkPersistentError";
  constructor(
    message: string,
    public readonly reloadCount: number,
  ) {
    super(message);
  }
}

/**
 * Reload page once. Returns `true` якщо релоад виконано, `false` якщо
 * cooldown ще не минув або якщо counter перевалив `MAX_RELOADS`.
 *
 * Параметр `now` — лише для тестів.
 *
 * Захист має два шари (див. doc-string модуля):
 *   1. Time cooldown 10s — щоб два reload-event-и поспіль не зациклили
 *      браузер.
 *   2. Counter window 5 min × `MAX_RELOADS=3` — щоб persistent CDN-failure
 *      не пускав по одному reload-у кожні 11s нескінченно.
 *
 * При досягненні `MAX_RELOADS` логуємо `logger.error` + emit-имо
 * глобальний `sergeant:chunk-persistent-error` event, щоб
 * `ErrorBoundary` міг показати UI замість blank-screen.
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
      // Layer 1: time cooldown.
      const last = Number(storage.getItem(KEY) ?? 0);
      if (last && now - last < COOLDOWN_MS) return false;

      // Layer 2: counter window. Reset if first-event > RESET_AFTER_MS ago.
      let count = Number(storage.getItem(KEY_COUNT) ?? 0);
      const firstAt = Number(storage.getItem(KEY_FIRST_AT) ?? 0);
      if (!firstAt || now - firstAt > RESET_AFTER_MS) {
        count = 0;
        storage.setItem(KEY_FIRST_AT, String(now));
      }

      if (count >= MAX_RELOADS) {
        const error = new ChunkPersistentError(
          `Chunk persistently unavailable after ${count} reload(s) within ${RESET_AFTER_MS / 60_000}min — refusing to reload further. Likely persistent CDN issue or rolled-forward broken deploy.`,
          count,
        );
        // Logged + thrown into the global error channel so Sentry / our
        // ErrorBoundary can show a real fallback UI instead of yet another
        // blank-screen reload-flicker.
        logger.error("[chunkReload] " + error.message, error);
        try {
          window.dispatchEvent(
            new CustomEvent("sergeant:chunk-persistent-error", {
              detail: { reloadCount: count, error },
            }),
          );
        } catch {
          // jsdom CustomEvent isn't always full-feature; best-effort.
        }
        return false;
      }

      storage.setItem(KEY, String(now));
      storage.setItem(KEY_COUNT, String(count + 1));
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
