import { apiUrl } from "@shared/lib/apiUrl";
import {
  isCapacitor,
  type WebVitalsMetricName,
  type WebVitalsMetricRating,
} from "@sergeant/shared";

/**
 * Збір Core Web Vitals (LCP / INP / CLS / FCP / TTFB) і відправка батчем
 * на бекенд (`POST /api/metrics/web-vitals`) для запису в Prometheus
 * (див. `server/obs/metrics.js` → `web_vitals_duration_ms` / `web_vitals_cls`).
 *
 * Ключові рішення:
 * - `web-vitals` package (~1 KB gzip) — канонічна реалізація від Chrome team.
 * - Батч + `navigator.sendBeacon` на `visibilitychange=hidden` і `pagehide` —
 *   єдиний надійний спосіб доставити метрики на unload (fetch тут ненадійний
 *   навіть з `keepalive`, а XHR синхронний блокує закриття).
 * - Динамічний `import("web-vitals")` після initSentry → не в критичному шляху.
 * - Єдиний ReadyState guard `sent` на метрику щоб не дублювати INP/CLS, які
 *   `web-vitals` шле кілька разів (finalValue on report callback).
 *
 * Без `VITE_WEB_VITALS_ENDPOINT=0` — no-op (flag для аварійного вимкнення без
 * re-deploy). Дефолт — увімкнено.
 */

const ENDPOINT_PATH = "/api/metrics/web-vitals";
export const MAX_BATCH = 10;

// Shape локальних буферних записів похідна від SSOT-схеми
// `WebVitalsPayloadSchema` у `@sergeant/shared`. Якщо додати нову метрику
// у шарі schemas, TS одразу підсвітить необхідні зміни тут.
interface WebVitalReport {
  name: WebVitalsMetricName;
  value: number;
  rating: WebVitalsMetricRating;
}

const buffer: WebVitalReport[] = [];
let flushScheduled = false;
let wiredLifecycle = false;
let initialized = false;

function flush() {
  flushScheduled = false;
  if (buffer.length === 0) return;

  const batch = buffer.splice(0, MAX_BATCH);
  // If enqueue() pushed more than one batch worth of metrics in a single
  // tick, the leftover would sit in the buffer until the next report or
  // pagehide — on fast unload that means data loss. Reschedule the next
  // flush on the same microtask boundary so the buffer drains in order.
  if (buffer.length > 0) scheduleFlush();
  const payload = JSON.stringify({ metrics: batch });
  const url = apiUrl(ENDPOINT_PATH);

  try {
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.sendBeacon === "function"
    ) {
      // sendBeacon вимагає Blob з правильним MIME — інакше бекенд
      // `express.json()` не розпарсить тіло.
      const blob = new Blob([payload], { type: "application/json" });
      const ok = navigator.sendBeacon(url, blob);
      if (ok) return;
    }
  } catch {
    /* fallthrough до fetch */
  }

  // Fallback: keepalive fetch. Обмежений 64 KB по специфікації, але наш батч
  // <1 KB — безпечно.
  try {
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
      credentials: "omit",
    }).catch(() => {
      /* swallow — телеметрія не має ламати UX */
    });
  } catch {
    /* noop */
  }
}

function wireLifecycle() {
  if (wiredLifecycle) return;
  wiredLifecycle = true;

  const onHidden = () => {
    if (document.visibilityState === "hidden") flush();
  };
  document.addEventListener("visibilitychange", onHidden, { capture: true });
  // Safari/iOS не завжди шле visibilitychange на close tab; pagehide — єдиний
  // гарантований сигнал. `bfcache` тут не проблема: після restore метрики
  // зберуться по-новому при наступному звіті.
  window.addEventListener("pagehide", flush, { capture: true });
}

function scheduleFlush() {
  // Мікро-дебаунс: якщо за один tick накопичилось кілька звітів, відправляємо
  // їх одним beacon. Не накопичуємо довше tick-а, бо page може зникнути будь-коли.
  if (flushScheduled) return;
  flushScheduled = true;
  Promise.resolve().then(flush);
}

export function __resetForTests() {
  buffer.length = 0;
  flushScheduled = false;
  wiredLifecycle = false;
  initialized = false;
}

interface MetricInput {
  name: string;
  value: number;
  rating?: string;
}

const SUPPORTED_METRIC_NAMES = new Set<WebVitalsMetricName>([
  "LCP",
  "INP",
  "FCP",
  "TTFB",
  "CLS",
]);

const SUPPORTED_RATINGS = new Set<WebVitalsMetricRating>([
  "good",
  "needs-improvement",
  "poor",
]);

function isSupportedName(value: string): value is WebVitalsMetricName {
  return SUPPORTED_METRIC_NAMES.has(value as WebVitalsMetricName);
}

function isSupportedRating(value: string): value is WebVitalsMetricRating {
  return SUPPORTED_RATINGS.has(value as WebVitalsMetricRating);
}

export function enqueue(metric: MetricInput | null | undefined) {
  if (
    !metric ||
    typeof metric.value !== "number" ||
    !Number.isFinite(metric.value) ||
    metric.value < 0 ||
    !isSupportedName(metric.name) ||
    !metric.rating ||
    !isSupportedRating(metric.rating)
  ) {
    // SSOT `WebVitalsPayloadSchema` робить `rating` обов'язковим. Якщо
    // буферити запис без рейтингу, server safeParse відкине ВЕСЬ батч —
    // і кілька валідних метрик мовчки втрачаються разом з невалідним.
    // Тому метрики без розпізнаного рейтингу drop'аємо тут, до буфера.
    return;
  }
  buffer.push({
    name: metric.name,
    value:
      // CLS — безрозмірний, не округлюємо. Решта — ms, ціле число.
      metric.name === "CLS"
        ? Number(metric.value.toFixed(4))
        : Math.round(metric.value),
    rating: metric.rating,
  });
  if (buffer.length >= MAX_BATCH) {
    flush();
  } else {
    scheduleFlush();
  }
}

/**
 * Точка входу. Викликати ПІСЛЯ hydration (з requestIdleCallback), щоб
 * web-vitals chunk не потрапив у критичний шлях.
 */
export async function initWebVitals() {
  // Core Web Vitals у нативному Capacitor WebView — це шум: cold-start WebView,
  // відсутність SSR і інший JS engine перекручують LCP/FCP/CLS/INP, отруюючи
  // RUM-дашборди 'web-like' метриками з мобільного шелла. Тому тут — ранній
  // return, щоб взагалі не тягнути `web-vitals` chunk у native-бандл.
  if (isCapacitor()) return;
  // Guard проти подвійної ініціалізації (Vite HMR, повторний виклик з іншої
  // entry-точки тощо). Без нього `onLCP(enqueue)` реєструється двічі і кожне
  // `web_vitals_*` спостереження дублюється — отруює baseline, який цей
  // модуль і мав збирати.
  if (initialized) return;
  if (typeof window === "undefined") return;
  if (import.meta.env.VITE_WEB_VITALS_ENDPOINT === "0") return;
  // SSR / jsdom — немає сенсу.
  if (typeof document === "undefined") return;

  let mod;
  try {
    mod = await import("web-vitals");
  } catch {
    return;
  }
  // Ставимо прапорець ПІСЛЯ успішного імпорту — щоб невдала спроба
  // (offline, CDN 404) не заблокувала наступний legitimate виклик.
  initialized = true;

  wireLifecycle();

  // `reportAllChanges: true` для INP/CLS — бо фінальне значення приходить лише
  // на pagehide/hidden, а ми вже слухаємо ці події самі. За дефолтом web-vitals
  // шле один callback на метрику, що нам і потрібно.
  try {
    mod.onLCP(enqueue);
    mod.onINP(enqueue);
    mod.onCLS(enqueue);
    mod.onFCP(enqueue);
    mod.onTTFB(enqueue);
  } catch {
    /* якщо API зміниться — не ламаємо завантаження сторінки */
  }
}
