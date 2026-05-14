import {
  getPlatform,
  isCapacitor,
  scrubPII,
  scrubPIIString,
  redactSensitiveQueryParams,
} from "@sergeant/shared";

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
  message?: unknown;
  exception?: {
    values?: Array<{ value?: unknown }>;
  };
  breadcrumbs?: Array<{ data?: unknown; message?: unknown }>;
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
    // PII roast 2026-05-13 §P0-S2: scrub `?token=` / `?api_key=` /
    // `?code=` query params in `request.url`. Browser SDK auto-captures
    // the current URL on every event — magic-link callbacks and OAuth
    // returns are the most common leak surfaces.
    if (typeof request.url === "string") {
      request.url = redactSensitiveQueryParams(request.url);
    }
  }
  // Deep recursive scrub of extra / contexts / breadcrumbs.data. The
  // browser SDK also auto-collects `xhr` / `fetch` breadcrumbs whose
  // `data` field includes the request body — that path now matches the
  // server contract instead of leaking through.
  if (event.extra) scrubPII(event.extra);
  if (event.contexts) scrubPII(event.contexts);
  // PII roast §P0-S3: scan strings in `event.message` and every
  // `exception.values[].value` for embedded emails / tokens / JWT / AWS
  // keys. The structural scrubber above never inspects string contents
  // (false-positive minefield on free-text), but error messages and
  // exception values are machine-generated diagnostics where pattern
  // hits almost always indicate a real leak.
  if (typeof event.message === "string") {
    event.message = scrubPIIString(event.message);
  }
  const exceptionValues = event.exception?.values;
  if (Array.isArray(exceptionValues)) {
    for (const ex of exceptionValues) {
      if (ex && typeof ex.value === "string") {
        ex.value = scrubPIIString(ex.value);
      }
    }
  }
  if (Array.isArray(event.breadcrumbs)) {
    for (const bc of event.breadcrumbs) {
      if (bc && bc.data) scrubPII(bc.data);
      // Breadcrumb messages from `xhr` / `fetch` auto-instrumentation
      // often look like `"HTTP 401 Bearer abc..."` — pattern-scrub
      // those rather than dropping breadcrumbs wholesale.
      if (bc && typeof bc.message === "string") {
        bc.message = scrubPIIString(bc.message);
      }
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
 * Per-op + per-route sampling rates for the browser Sentry SDK
 * (stack-pulse PR-12 / H6).
 *
 * Browser `samplingContext` exposes:
 *   - `attributes["sentry.op"]` — transaction op (`pageload`,
 *     `navigation`, `http.client`, …).
 *   - `attributes["http.url"]` — outbound XHR/fetch URL.
 *   - `name` / `transactionContext.name` — SPA route path for
 *     `pageload` + `navigation` spans (e.g. `"/finyk"`).
 *
 * Sampling strategy (“MAX wins”, i.e. the higher rate of op vs route):
 *   - `pageload` 100% — first-paint perf, fires once per session.
 *   - `http.client` 1% — outbound spans are the noisiest.
 *   - For `navigation` we then apply a **route-aware** rate so onboarding
 *     navigations get 100% while hub navigations stay at 5%.
 *
 * Route table (longest-prefix-first):
 *   - `/onboarding` 100% — first-run UX is critical, low volume.
 *   - `/fizruk` / `/finyk` 50% — module flows we tune actively.
 *   - `/` (root — Hub overview) 5% — most-visited route, low value to
 *     re-sample each navigation.
 *   - other routes — fallback (env-tunable).
 */
export type WebSentrySamplingContext = {
  attributes?: Record<string, unknown>;
  op?: unknown;
  name?: unknown;
  transactionContext?: { name?: unknown };
};

type WebRouteRule = { readonly match: string; readonly rate: number };

/**
 * SPA route prefixes — longest-prefix-first. Each entry matches the
 * `name` (transaction path) of a `navigation` or `pageload` span.
 * Keep in sync with `apps/web/src/core/app/router.tsx` paths and
 * `docs/observability/sentry-sampling.md`.
 */
export const WEB_SENTRY_ROUTE_RULES: readonly WebRouteRule[] = [
  { match: "/onboarding", rate: 1.0 },
  { match: "/fizruk", rate: 0.5 },
  { match: "/finyk", rate: 0.5 },
  // Hub overview is the SPA root (“/”). Exact match handled below — we
  // do NOT include it in the prefix table because every other path also
  // starts with “/” and a prefix match would shadow them all.
] as const;

function pickRouteRate(name: string): number | null {
  if (name === "/" || name === "") return 0.05;
  for (const rule of WEB_SENTRY_ROUTE_RULES) {
    if (name === rule.match || name.startsWith(`${rule.match}/`))
      return rule.rate;
  }
  return null;
}

function pickRouteName(c: WebSentrySamplingContext): string | null {
  const explicit = c.name;
  if (typeof explicit === "string" && explicit.length > 0) return explicit;
  const ctxName = c.transactionContext?.name;
  if (typeof ctxName === "string" && ctxName.length > 0) return ctxName;
  return null;
}

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
  if (op === "http.client") return 0.01;

  if (op === "navigation") {
    const name = pickRouteName(c);
    if (name) {
      const routeRate = pickRouteRate(name);
      if (routeRate != null) return routeRate;
    }
    return 0.1;
  }

  return fallback;
}

/**
 * Sentry sampling preset for the web SDK — mirrors the server-side
 * profile selector but uses the `VITE_SENTRY_SAMPLE_PROFILE` env var
 * (must be `VITE_`-prefixed so Vite inlines it into the client bundle).
 * Values map 1‑1 to `apps/server/src/sentry.ts`:
 *   - `minimal` (0.01), `prod` (0.05), `aggressive` (0.2).
 *
 * Numeric `VITE_SENTRY_TRACES_SAMPLE_RATE` overrides the profile when set.
 */
export const WEB_SENTRY_SAMPLE_PROFILES = {
  minimal: 0.01,
  prod: 0.05,
  aggressive: 0.2,
} as const;

export type WebSentrySampleProfile = keyof typeof WEB_SENTRY_SAMPLE_PROFILES;

export function resolveWebSampleProfile(raw: unknown): WebSentrySampleProfile {
  if (raw === "minimal" || raw === "aggressive" || raw === "prod") return raw;
  return "prod";
}

/**
 * Resolve fallback sample rate.
 *
 * Accepts an optional `env` arg so tests can pass a plain object. The
 * default reads `import.meta.env` via a Record-typed lookup keyed by the
 * env var names — Vite inlines string literals at build time, so the
 * generic `Record<string, unknown>` shape is safe here even though
 * `import.meta.env` carries a richer type.
 */
export function defaultWebSampleRate(env?: Record<string, unknown>): number {
  const source: Record<string, unknown> = env ?? {
    VITE_SENTRY_TRACES_SAMPLE_RATE: import.meta.env
      .VITE_SENTRY_TRACES_SAMPLE_RATE,
    VITE_SENTRY_SAMPLE_PROFILE: import.meta.env.VITE_SENTRY_SAMPLE_PROFILE,
  };
  const explicit = source["VITE_SENTRY_TRACES_SAMPLE_RATE"];
  if (
    explicit != null &&
    explicit !== "" &&
    (typeof explicit === "string" || typeof explicit === "number")
  ) {
    return parseRate(explicit, 0.05);
  }
  const profile = resolveWebSampleProfile(source["VITE_SENTRY_SAMPLE_PROFILE"]);
  return WEB_SENTRY_SAMPLE_PROFILES[profile];
}

/**
 * URL substrings that suppress event capture entirely on the browser
 * SDK. Browser extensions inject scripts into every page and frequently
 * throw inside them — those stack traces always point to extension
 * code we can't fix and would otherwise eat the Sentry error budget.
 * Health-probe URLs are filtered for parity with the server SDK.
 */
export const WEB_SENTRY_DENY_URLS: readonly (string | RegExp)[] = [
  "/api/health",
  "/health",
  /^chrome-extension:\/\//,
  /^moz-extension:\/\//,
  /^safari-extension:\/\//,
];

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
    // Dynamic per-op + per-route sampler (stack-pulse PR-12 / H6).
    // Fallback rate resolves through `defaultWebSampleRate` — either
    // an explicit `VITE_SENTRY_TRACES_SAMPLE_RATE` (deploy override /
    // kill-switch when set to `0`), or the
    // `VITE_SENTRY_SAMPLE_PROFILE` preset (`minimal` / `prod` /
    // `aggressive`). Per-op rates (pageload=100%, http.client=1%) and
    // navigation route rates (onboarding=100%, fizruk/finyk=50%,
    // hub=5%) are applied independent of fallback.
    tracesSampler: (samplingContext) =>
      pickWebTracesSampleRate(samplingContext, defaultWebSampleRate()),
    replaysSessionSampleRate: parseRate(
      import.meta.env.VITE_SENTRY_REPLAY_SAMPLE_RATE,
      0,
    ),
    replaysOnErrorSampleRate: 1.0,
    // PII roast 2026-05-13 §P0-S4: drop noise events from health probes
    // (Capacitor WebView occasionally fires a `/health` request during
    // boot) and `chrome-extension://` injections that crash on
    // browser-extension code we don't control.
    denyUrls: WEB_SENTRY_DENY_URLS as (string | RegExp)[],
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
