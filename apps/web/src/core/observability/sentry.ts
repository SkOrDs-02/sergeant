import { getPlatform, isCapacitor, scrubPII } from "@sergeant/shared";

type SentryModule = typeof import("@sentry/react");

/**
 * Structural shape of Sentry events that `applyWebBeforeSend` mutates.
 * Defined as a minimal subset of `Sentry.ErrorEvent` (no `[key: string]`
 * index signatures) so a real `Sentry.ErrorEvent` is directly assignable
 * — the `beforeSend` callback can pass `event` without `as unknown as`
 * casts. The helper is unit-tested without pulling SDK type fixtures.
 */
export interface WebBeforeSendEvent {
  request?: {
    cookies?: unknown;
    data?: unknown;
    headers?: unknown;
    url?: unknown;
  };
  extra?: unknown;
  contexts?: unknown;
  breadcrumbs?: Array<{ data?: unknown }>;
  user?: {
    id?: string | number;
    ip_address?: string;
  };
}

/**
 * Browser counterpart of `applyBeforeSend` (`apps/server/src/sentry.ts`).
 *
 * Прожарка 2026-05-13 §6.5: до цього рефактору web-`beforeSend` тільки
 * викидав `request.cookies`, тоді як серверний хук рекурсивно скрабив
 * `request.headers`, `extra`, `contexts`, `breadcrumbs.data` і нормалізував
 * `event.user` до `{ id }`. Усі ці канали (особливо XHR breadcrumbs з
 * `Authorization` header-ом і ручні `Sentry.setExtra('payload', body)`)
 * однаково існують у браузерному SDK, тож контракт PII-handling-у
 * (`docs/security/pii-handling.md`) тримався тільки на сервері.
 *
 * Сигнатура — `WebBeforeSendEvent` (локальний structural type), щоб
 * не тягнути `@sentry/react` runtime у головний бандл і одночасно
 * лишити type-safety під час колл-сайту. `Sentry.Event` структурно
 * сумісний з цим інтерфейсом.
 */
export function applyWebBeforeSend(
  event: WebBeforeSendEvent,
): WebBeforeSendEvent {
  const request = event.request;
  if (request) {
    if ("cookies" in request) delete request["cookies"];
    // Body / form-data may carry passwords or PII — drop wholesale; the
    // few stack traces that genuinely need request body should add it
    // back via Sentry.setExtra after explicit scrubbing.
    if ("data" in request) delete request["data"];
    if (request.headers) scrubPII(request.headers);
  }
  // Deep recursive scrub of extra / contexts / breadcrumbs.data. The
  // browser SDK also auto-collects `xhr` / `fetch` breadcrumbs whose
  // `data` field includes the request body — that path now matches the
  // server contract instead of leaking through.
  if (event.extra) scrubPII(event.extra);
  if (event.contexts) scrubPII(event.contexts);
  if (Array.isArray(event.breadcrumbs)) {
    for (const bc of event.breadcrumbs) {
      if (bc && bc.data) scrubPII(bc.data);
    }
  }
  // `event.user` can carry `email` / `phone` from `Sentry.setUser({...})`
  // or auth-state debug. Normalise to `{ id }` only — Sentry's
  // `sendDefaultPii=false` already does most of this, but duplicate
  // defence is cheap and survives accidental `setUser` regressions.
  if (event.user) {
    const safe: { id?: string | number } = {};
    if (
      typeof event.user.id === "string" ||
      typeof event.user.id === "number"
    ) {
      safe.id = event.user.id;
    }
    event.user = safe;
  }
  return event;
}

let initialized = false;
let sentryModule: SentryModule | null = null;

function parseRate(val: unknown, fallback: number): number {
  if (val == null || val === "") return fallback;
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Per-op sampling rates for the browser Sentry SDK
 * (stack-pulse PR-12 / H6).
 *
 * The browser-side `samplingContext` exposes `attributes["sentry.op"]`
 * (page navigation telemetry) and `attributes["http.url"]` (XHR/fetch
 * spans). Picker lives here so it can be unit-tested without booting
 * the SDK and mirrors the server-side declarative rule table.
 *
 * Rationale:
 *   - `pageload` 100% — first-paint perf is the most actionable signal
 *     and only fires once per session.
 *   - `navigation` 10% — SPA route changes are frequent; 10% is enough
 *     for trend without burning quota.
 *   - `http.client` 1% — outbound API calls are the noisiest spans.
 *   - everything else → fallback (env-tunable).
 */
export type WebSentrySamplingContext = {
  attributes?: Record<string, unknown>;
  op?: unknown;
};

export function pickWebTracesSampleRate(
  ctx: WebSentrySamplingContext | unknown,
  fallback: number,
): number {
  if (!ctx || typeof ctx !== "object") return fallback;
  const c = ctx as WebSentrySamplingContext;
  const op =
    (c.attributes && (c.attributes["sentry.op"] as unknown)) ?? c.op ?? "";
  if (typeof op !== "string") return fallback;
  if (op === "pageload") return 1.0;
  if (op === "navigation") return 0.1;
  if (op === "http.client") return 0.01;
  return fallback;
}

/**
 * Лениво завантажує `@sentry/react` і ініціалізує Sentry у браузері.
 *
 * Навмисно через динамічний `import()`, щоб SDK (~30–40 KB gzip) не
 * потрапляв у головний бандл — аналітика/error tracking не повинні
 * блокувати hydration (див. `.agents/skills/sergeant-web-ui/SKILL.md`).
 *
 * Без `VITE_SENTRY_DSN` — no-op і жодного чанку не підтягується.
 */
export async function initSentry() {
  if (initialized) return;
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  const mod = await import("@sentry/react");
  sentryModule = mod;

  mod.init({
    dsn,
    environment:
      import.meta.env.VITE_SENTRY_ENVIRONMENT ||
      import.meta.env.MODE ||
      "production",
    release: import.meta.env.VITE_SENTRY_RELEASE,
    integrations: [
      mod.browserTracingIntegration(),
      mod.replayIntegration({
        maskAllText: false,
        blockAllMedia: true,
      }),
    ],
    // Dynamic per-op sampler (stack-pulse PR-12 / H6). The fallback is
    // env-tunable via `VITE_SENTRY_TRACES_SAMPLE_RATE` (kill-switch =
    // setting it to `0` zeroes out unmatched ops while pageload/nav
    // still get their explicit rates from `pickWebTracesSampleRate`).
    tracesSampler: (samplingContext) =>
      pickWebTracesSampleRate(
        samplingContext,
        parseRate(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE, 0.05),
      ),
    replaysSessionSampleRate: parseRate(
      import.meta.env.VITE_SENTRY_REPLAY_SAMPLE_RATE,
      0,
    ),
    replaysOnErrorSampleRate: 1.0,
    // PII / secret scrubbing — see `applyWebBeforeSend` above.
    // `WebBeforeSendEvent` is a minimal structural subset of Sentry's
    // `ErrorEvent`, so the SDK's `event` passes through without any cast.
    beforeSend(event) {
      applyWebBeforeSend(event);
      return event;
    },
  });

  // Теги для тріажу: відрізнити події з нативного Capacitor WebView від
  // браузерних (native-specific баги: inset, кукі, keyboard resize тощо).
  mod.setTag("platform", getPlatform());
  mod.setTag("is_capacitor", String(isCapacitor()));

  initialized = true;
}

/**
 * Lazy-forward wrapper: поки SDK не завантажений — no-op, потім
 * делегує у реальний `Sentry.captureException`. Використовується
 * локальним `ErrorBoundary`, щоб не змушувати його залежати від SDK.
 */
export function captureException(
  error: unknown,
  hint?: Parameters<SentryModule["captureException"]>[1],
): void {
  if (!sentryModule) return;
  try {
    sentryModule.captureException(error, hint);
  } catch {
    /* noop */
  }
}

/**
 * Lazy-forward `Sentry.addBreadcrumb`. No-op when the SDK is not yet
 * loaded so callers can leave breadcrumbs unconditionally without
 * forcing the Sentry chunk to ship eagerly. Used by `core/db/sqlite.ts`
 * to record VFS-fallback / COOP-COEP triage data.
 */
export function addSentryBreadcrumb(
  breadcrumb: Parameters<SentryModule["addBreadcrumb"]>[0],
): void {
  if (!sentryModule) return;
  try {
    sentryModule.addBreadcrumb(breadcrumb);
  } catch {
    /* noop */
  }
}

/**
 * Lazy-forward `Sentry.setTag`. No-op until the SDK is loaded so the
 * sync-engine boot path can record `outbox.boot.outcome` (and similar
 * Stage 8 triage tags) unconditionally — the call costs nothing on
 * cold-start and the actual tag is attached the moment the SDK
 * finishes lazy-loading via `requestIdleCallback`.
 *
 * Using global tags (rather than `withScope`) is intentional: every
 * subsequent event in the session inherits the tag so a saved search
 * like `outbox.boot.outcome:failed` finds the boot failure *and* any
 * downstream errors caused by it (e.g. the periodic drain surfacing
 * `no such table: sync_op_outbox`). That is the SERGEANT-WEB-A
 * shape we want to remain queryable if the regression ever recurs.
 */
export function setSentryTag(key: string, value: string): void {
  if (!sentryModule) return;
  try {
    sentryModule.setTag(key, value);
  } catch {
    /* noop */
  }
}
