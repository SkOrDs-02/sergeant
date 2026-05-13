import * as Sentry from "@sentry/node";
import type { Express } from "express";
import { scrubPII as sharedScrubPII } from "@sergeant/shared";
import { als } from "./obs/requestContext.js";
import { redactSensitiveUrl } from "./obs/sensitiveUrl.js";

function parseRate(val: string | undefined, fallback: number): number {
  if (val == null || val === "") return fallback;
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Per-route sampling rules — declarative table consumed by `pickTracesSampleRate`.
 * Order is significant: longest-prefix-first wins. The shape mirrors the
 * body-size policy (`apps/server/src/http/bodySizePolicy.ts`) — declarative
 * tables make audit + drift detection trivial.
 *
 * Defaults derived from H6 (stack-pulse-2026-05/PR-12). Adjustments must
 * update `docs/observability/sentry-sampling.md` in the same PR (drift
 * checked via review, not lint — Sentry quota is the production check).
 */
export type SentrySamplingRule = {
  /** Substring tested against the request URL. */
  match: string;
  /** Sampling rate in [0, 1]. */
  rate: number;
  /** Why this rate exists (shown in docs/sentry-sampling.md). */
  reason: string;
};

export const SENTRY_SAMPLING_RULES: readonly SentrySamplingRule[] = [
  // Order is intentional: longest path first so /api/auth/sign-up does not
  // accidentally fall through to /api/health (longest-prefix-first).
  {
    match: "/api/account/recovery",
    rate: 1.0,
    reason: "Security-critical, low volume — capture every trace.",
  },
  {
    match: "/api/admin/",
    rate: 1.0,
    reason: "Admin tooling, low volume + high blast radius.",
  },
  {
    match: "/api/auth/",
    rate: 1.0,
    reason: "Login/signup/SSO — security-critical, low-volume.",
  },
  {
    match: "/api/photo/analyze",
    rate: 0.5,
    reason: "Expensive AI route; half-trace keeps perf signal without 1× cost.",
  },
  {
    match: "/api/sync/poll",
    rate: 0.01,
    reason: "Chatty heartbeat poll — 1% is enough for trend.",
  },
  {
    match: "/api/health",
    rate: 0.001,
    reason: "Liveness probe — 0.1% prevents quota burn.",
  },
] as const;

/**
 * Default fallback rate when no rule matches. Derived from
 * `SENTRY_TRACES_SAMPLE_RATE` env-var (deploy-time override) but capped
 * at 5% by the plan to leave headroom for high-value routes.
 *
 * Exported so tests can pin a deterministic baseline.
 */
export function defaultSampleRate(
  env: NodeJS.ProcessEnv = process.env,
): number {
  return parseRate(env["SENTRY_TRACES_SAMPLE_RATE"], 0.05);
}

/**
 * Pure picker — given a URL, returns the first matching rate, or
 * `fallback` if no rule matches. Pure & sync so unit tests can call
 * it without bootstrapping Sentry SDK.
 *
 * Defensive: any unexpected input (`null`, `undefined`, non-string)
 * collapses to `fallback` — matches `tracesSampler` contract that a
 * thrown error in the picker would skip the sample (Sentry default).
 */
export function pickTracesSampleRate(
  url: unknown,
  fallback: number = defaultSampleRate(),
): number {
  if (typeof url !== "string" || url.length === 0) return fallback;
  for (const rule of SENTRY_SAMPLING_RULES) {
    if (url.includes(rule.match)) return rule.rate;
  }
  return fallback;
}

/**
 * L9 — Resolve the Sentry `release` tag from the deploy environment.
 *
 * Sentry needs every event to be tagged with the exact git SHA that produced
 * the running artifact, otherwise source-maps lookup is best-effort and
 * incident attribution falls back to "wherever the latest release pointer
 * happens to be". The cascade lets one helper serve every host:
 *
 *   1. `SENTRY_RELEASE`        — explicit override (release-please, custom CI)
 *   2. `RAILWAY_GIT_COMMIT_SHA`— Railway auto-injects this per deploy
 *   3. `VERCEL_GIT_COMMIT_SHA` — Vercel auto-injects this per deploy
 *   4. `GITHUB_SHA`            — fallback when running in GitHub Actions
 *                                (mobile-shell builds, container scans, etc.)
 *
 * Returns `undefined` when none of the variables are set so Sentry's own
 * `release: undefined` semantics kick in (events go to the "no release"
 * bucket — visible but not attributable). We deliberately do NOT default to
 * a fake string like `"unknown"` — that would mask the misconfiguration in
 * Sentry UI instead of surfacing it.
 */
export function resolveSentryRelease(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const candidates = [
    env["SENTRY_RELEASE"],
    env["RAILWAY_GIT_COMMIT_SHA"],
    env["VERCEL_GIT_COMMIT_SHA"],
    env["GITHUB_SHA"],
  ];
  for (const v of candidates) {
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return undefined;
}

/**
 * Рекурсивний PII-скрабер. З 2026-05-13 (audit
 * `2026-05-13-security-observability-roast.md`) канонічна імплементація
 * живе у `@sergeant/shared/lib/pii.ts` — це дозволяє web-Sentry SDK ділити
 * той самий контракт без копіпасти серверного коду в браузерний бандл.
 *
 * Експорт лишений як named function — щоб юніт-тести (`sentry.test.ts`)
 * могли імпортувати `scrubPII` напряму, як і раніше.
 */
export const scrubPII = sharedScrubPII;

const dsn = process.env["SENTRY_DSN"];

/**
 * Чистий beforeSend-хук — extracted у named-функцію (а не inline-closure
 * всередині `Sentry.init`), щоб тести могли його викликати напряму без
 * Sentry-моків. Контракт: мутує `event` in-place і повертає його ж (як того
 * хоче Sentry SDK).
 */
export function applyBeforeSend<E extends Sentry.ErrorEvent>(event: E): E {
  if (event.request?.data) delete event.request.data;
  if (event.request?.cookies) delete event.request.cookies;
  if (event.request?.headers) {
    // Headers можуть містити Authorization/Cookie/X-Csrf-Token.
    scrubPII(event.request.headers);
  }
  // C1 — `req.originalUrl` для `/api/mono/webhook/<secret>` несе сам секрет,
  // і Sentry capture-ить його у `event.request.url`. Рятуємо до того, як
  // подія йде на ingest. Хелпер ідемпотентний — викликати двічі безпечно,
  // якщо `requestDataIntegration` колись стане сам редагувати ці шляхи.
  if (typeof event.request?.url === "string") {
    event.request.url = redactSensitiveUrl(event.request.url);
  }
  // Глибокий рекурсивний скраб PII з extra/contexts/breadcrumbs. Ловимо
  // випадки, коли user-payload потрапив у `event.extra` через
  // `Sentry.setExtra('payload', req.body)` або
  // `Sentry.captureException(e, { extra })`.
  if (event.extra) scrubPII(event.extra);
  if (event.contexts) scrubPII(event.contexts);
  if (event.breadcrumbs) {
    for (const bc of event.breadcrumbs) {
      if (bc.data) scrubPII(bc.data);
      // breadcrumb.message — string; нічого скрабити (occurrence rate низький
      // і парсинг рядка на email/phone дав би false-positive-и).
    }
  }
  // user.email/phone не пускаємо — лишаємо тільки id. `sendDefaultPii=false`
  // вже це робить, але duplicate-захист дешевий.
  if (event.user) {
    const safe: { id?: string | number; ip_address?: string } = {};
    if (
      typeof event.user.id === "string" ||
      typeof event.user.id === "number"
    ) {
      safe.id = event.user.id;
    }
    event.user = safe;
  }
  // Підмішуємо контекст із ALS, якщо подія народилася в рамках запиту.
  const ctx = als.getStore();
  if (ctx) {
    event.tags = {
      ...(event.tags || {}),
      ...(ctx.requestId ? { requestId: ctx.requestId } : {}),
      ...(ctx.module ? { module: ctx.module } : {}),
    };
    if (ctx.userId) {
      event.user = { ...(event.user || {}), id: ctx.userId };
    }
  }
  return event;
}

/**
 * Чистий beforeBreadcrumb-хук — extracted з тих самих міркувань, що й
 * `applyBeforeSend`. Повертає `null`, якщо breadcrumb треба викинути; інакше
 * мутує `data` і повертає той самий breadcrumb.
 */
export function applyBeforeBreadcrumb(
  breadcrumb: Sentry.Breadcrumb,
): Sentry.Breadcrumb | null {
  if (breadcrumb?.category === "http" && breadcrumb.data) {
    delete breadcrumb.data["request_body_size"];
    delete breadcrumb.data["response_body_size"];
    // C1 — http breadcrumb-и несуть `data.url` як key для запитів outbound
    // HTTP (axios/fetch). Якщо колись виявимо, що outbound ходить на чужий
    // API з секрет-у-path-і, той самий хелпер redact-не його. Inbound-leak
    // (`/api/mono/webhook/<secret>`) сюди не потрапляє — Sentry HTTP-breadcrumb-и
    // для inbound-у не створюються.
    if (typeof breadcrumb.data["url"] === "string") {
      breadcrumb.data["url"] = redactSensitiveUrl(breadcrumb.data["url"]);
    }
    scrubPII(breadcrumb.data);
  }
  return breadcrumb;
}

// ВАЖЛИВО: ініціалізація робиться у module top-level, а не в окремій функції,
// яку треба викликати. У ESM (`"type": "module"`) усі `import` хостяться і
// оцінюються ДО виконання тіла модуля, тому якщо викликати `Sentry.init()` з
// тіла `server/index.js`, `express`/`http` уже будуть завантажені й
// OpenTelemetry-інструментація стане no-op.
//
// Рішення: ставимо `Sentry.init()` саме тут, а у `server/index.js` цей файл
// імпортується ПЕРШИМ — завдяки depth-first evaluation ESM-імпортів тіло
// `sentry.js` виконається до того, як станеться `import express`.
if (dsn) {
  const release = resolveSentryRelease();
  Sentry.init({
    dsn,
    environment:
      process.env["SENTRY_ENVIRONMENT"] ||
      process.env["NODE_ENV"] ||
      "development",
    ...(release ? { release } : {}),
    // Dynamic per-route sampler (stack-pulse PR-12). Replaces a static 10%
    // sample rate that over-sampled chatty heartbeats (`/api/health`,
    // `/api/sync/poll`) and under-sampled security-critical low-volume
    // routes (`/api/auth/*`, `/api/account/recovery`). The rule table is
    // declarative — see `SENTRY_SAMPLING_RULES` and
    // `docs/observability/sentry-sampling.md` for rationale + budget.
    //
    // `SENTRY_TRACES_SAMPLE_RATE=0` still works — it lowers the *fallback*
    // rate to 0 for unmatched routes (kill-switch for incident-mitigation).
    tracesSampler: (samplingContext) => {
      try {
        // Sentry's `samplingContext` shape is loosely typed; the URL lives
        // either on `request.url` (Node http) or under `attributes` for
        // OTel spans. We accept both — and any other shape collapses to
        // the fallback via `pickTracesSampleRate`'s defensive guards.
        const ctx = samplingContext as {
          request?: { url?: unknown };
          attributes?: { "http.url"?: unknown; "http.target"?: unknown };
        };
        const url =
          ctx.request?.url ??
          ctx.attributes?.["http.url"] ??
          ctx.attributes?.["http.target"];
        return pickTracesSampleRate(url);
      } catch {
        // Never let sampler crash the SDK — if anything throws we fall
        // back to the deploy-configured default rate.
        return defaultSampleRate();
      }
    },
    // Приберемо request body зі звітів — там можуть бути фото/паролі.
    sendDefaultPii: false,
    beforeSend: applyBeforeSend,
    beforeBreadcrumb: applyBeforeBreadcrumb,
  });

  // AI-NOTE: console.log тут навмисний — sentry.ts оцінюється ДО logger.ts
  // (ESM depth-first import order), тому pino-логер ще не ініціалізований.
  // Формат — JSON-рядок, сумісний з Railway/Loki ingestion.
  console.log(
    JSON.stringify({
      level: "info",
      msg: "sentry_initialized",
      environment: process.env["SENTRY_ENVIRONMENT"] || process.env["NODE_ENV"],
    }),
  );
}

/**
 * Підключає Sentry-обробник помилок до Express-додатка.
 * Має викликатись *після* всіх роутерів і *перед* власним error handler-ом.
 */
export function attachSentryErrorHandler(app: Express): void {
  if (!dsn) return;
  Sentry.setupExpressErrorHandler(app);
}

export { Sentry };
