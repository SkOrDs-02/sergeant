import * as Sentry from "@sentry/node";
import type { Express } from "express";
import {
  scrubPII as sharedScrubPII,
  scrubPIIString,
  redactSensitiveQueryParams,
  formatRelease,
} from "@sergeant/shared";
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
  // Specific /api/internal/openclaw/write/ must precede the broader
  // /api/internal/ rule so its rate is not overridden.
  {
    match: "/api/internal/openclaw/write/",
    rate: 1.0,
    reason:
      "OpenClaw write-tool mutations (ADR-0036 §3) — every founder-approved side-effect captured for audit reconstruction. Low-volume, high blast radius.",
  },
  {
    match: "/api/internal/",
    rate: 1.0,
    reason:
      "All internal namespace routes (n8n/cron/admin tooling) — low external volume, high blast radius. PR-07 (backend-perf-2026-05): baseline before enabling; reduce to 0.5 if Sentry quota is impacted.",
  },
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
  // AI-шлях (B-телеметрія, `docs/90-work/audits/ai-testing-2026-08-25.md`).
  //
  // `/api/photo/analyze` стояло тут із самого початку і НЕ МАТЧИЛО НІЧОГО:
  // такого роута в застосунку немає, реальні — `/api/nutrition/analyze-photo`
  // і `/api/nutrition/refine-photo` (`routes/nutrition.ts`). Тобто найдорожчі
  // виклики роками падали у generic-fallback (0.05), а правило виглядало
  // як робоче. Матч — `url.includes(rule.match)`, тож помилка була тиха:
  // ані винятку, ані попередження.
  //
  // ПОРЯДОК ТУТ ЗНАЧУЩИЙ: перший збіг виграє, а `/api/chat` як підрядок
  // покриває і `/api/chat/usage`. Тому дешевий лічильник іде ПЕРШИМ —
  // інакше він успадкував би ставку стріму. З тієї ж причини для коуча
  // взято саме `/api/coach/insight`, а не `/api/coach/`: memory-ендпоінти
  // моделі не викликають і платити за них трасами нема сенсу.
  {
    match: "/api/chat/usage",
    rate: 0.01,
    reason:
      "Лічильник квоти — дешевий GET, який фронт смикає на кожному відкритті чату. 1% вистачає на тренд. МАЄ стояти перед /api/chat (підрядковий матч).",
  },
  {
    match: "/api/chat",
    rate: 0.5,
    reason:
      "Найдорожчий AI-роут: SSE-стрім ~30 с і до 8 tool-ітерацій. Правила не було взагалі — падало у generic-fallback, тоді як саме тут B46 показав 9 зривів із 12, невидимих одночасно в метриках, логах і Sentry.",
  },
  {
    match: "/api/coach/insight",
    rate: 0.5,
    reason:
      "Дорога генерація на Sonnet-класі, ліміт 20/год на юзера — обсяг малий, ціна помилки висока. Саме /insight, не /api/coach/: memory-ендпоінти модель не викликають.",
  },
  {
    match: "/api/weekly-digest",
    rate: 0.5,
    reason:
      "Тижневий дайджест — рідкісний, дорогий і повністю фоновий: користувач не поскаржиться, тож окрім трасування сигналу про його збій немає.",
  },
  {
    match: "/api/nutrition/analyze-photo",
    rate: 0.5,
    reason:
      "Vision-виклик (~5–10 с, зображення в тілі). Замінює мертве /api/photo/analyze — саме цей шлях віддає `routes/nutrition.ts`.",
  },
  {
    match: "/api/nutrition/refine-photo",
    rate: 0.5,
    reason:
      "Той самий vision-shape, що й analyze-photo, і та сама ціна — мертвим правилом теж не покривався.",
  },
  {
    match: "/api/v2/sync/",
    rate: 0.01,
    reason:
      "v2 op-log sync — push/pull/stream fire every ~10s per active client (Initiative 0003 Phase 5 / ADR-0047). 1% is enough for latency trend without quota burn.",
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
 * Preset profiles for the *fallback* sample rate (the rate used when no rule
 * matches). Per-route rules above stay fixed across profiles — they encode
 * security/observability policy, not quota budget, and bumping `/api/auth/`
 * down to 0.1 would defeat the point of the table.
 *
 * Profile selection:
 *   - `minimal` (0.01): incident-mitigation — only critical routes traced.
 *   - `prod` (0.05): default deploy baseline.
 *   - `aggressive` (0.2): canary / pre-release deploys — trade quota for
 *     visibility while we shake out a new release.
 *
 * Explicit `SENTRY_TRACES_SAMPLE_RATE` always wins (deploy-time override).
 */
export const SENTRY_SAMPLE_PROFILES = {
  minimal: 0.01,
  prod: 0.05,
  aggressive: 0.2,
} as const;

export type SentrySampleProfile = keyof typeof SENTRY_SAMPLE_PROFILES;

export function resolveSampleProfile(
  raw: string | undefined,
): SentrySampleProfile {
  if (raw === "minimal" || raw === "aggressive" || raw === "prod") return raw;
  return "prod";
}

/**
 * Default fallback rate when no rule matches. Resolution order:
 *
 *   1. `SENTRY_TRACES_SAMPLE_RATE` — explicit numeric override (deploy-time
 *      kill-switch). Honoured even when a profile is set so on-call can
 *      drop traces during a quota emergency without redeploying.
 *   2. `SENTRY_SAMPLE_PROFILE` — one of `minimal` / `prod` / `aggressive`,
 *      resolved via `SENTRY_SAMPLE_PROFILES`.
 *   3. Default — `0.05` (matches the historical `prod` baseline).
 *
 * Exported so tests can pin a deterministic baseline.
 */
export function defaultSampleRate(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const explicit = env["SENTRY_TRACES_SAMPLE_RATE"];
  if (explicit != null && explicit !== "") {
    return parseRate(explicit, 0.05);
  }
  const profile = resolveSampleProfile(env["SENTRY_SAMPLE_PROFILE"]);
  return SENTRY_SAMPLE_PROFILES[profile];
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
 *   2. `GIT_SHA`               — Coolify/ghcr: baked into the image by
 *                                `Dockerfile.api` (build-arg `${github.sha}`)
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
    env["GIT_SHA"],
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
 * Єдина форма редакції URL для будь-якого Sentry-payload: секрет у path-і
 * (mono-webhook, Telegram bot-token) → sensitive query-params → pattern-скраб
 * рядка. Порядок важливий: перші два кроки структурні й дешеві, третій ловить
 * решту (email/JWT/AWS-key), що могла потрапити в URL з чужого API.
 */
function redactUrlForSink(url: string): string {
  return scrubPIIString(redactSensitiveQueryParams(redactSensitiveUrl(url)));
}

/**
 * Span-атрибути OTel, у які інструментація кладе повний outbound-URL.
 */
const SPAN_URL_ATTRIBUTES = ["http.url", "url.full", "http.target"] as const;

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
  // Plus PII roast 2026-05-13 §P0-S2: `?token=` / `?api_key=` /
  // `?code=` query params get the same treatment so OAuth callbacks
  // and magic-link error captures don't leak the credential.
  if (typeof event.request?.url === "string") {
    event.request.url = redactUrlForSink(event.request.url);
  }
  // Глибокий рекурсивний скраб PII з extra/contexts/breadcrumbs. Ловимо
  // випадки, коли user-payload потрапив у `event.extra` через
  // `Sentry.setExtra('payload', req.body)` або
  // `Sentry.captureException(e, { extra })`.
  if (event.extra) scrubPII(event.extra);
  if (event.contexts) scrubPII(event.contexts);
  // PII roast §P0-S3: also scrub the top-level `event.message` and every
  // exception `value` for embedded emails / telegram tokens / JWT / AWS
  // keys. `scrubPII` deliberately skips string contents (false-positive
  // minefield on user-entered prose), but error messages and exception
  // values are explicitly machine-generated diagnostics where pattern
  // hits are almost always real leaks.
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
  if (event.breadcrumbs) {
    for (const bc of event.breadcrumbs) {
      if (bc.data) scrubPII(bc.data);
      // Breadcrumb message-и іноді містять stringified error payload
      // (axios upstream-fail, чи user-input echoes). Сканеро лише ці
      // рядки — `bc.data` вже покрито структурним scrubPII вище.
      if (typeof bc.message === "string") {
        bc.message = scrubPIIString(bc.message);
      }
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
      breadcrumb.data["url"] = redactUrlForSink(breadcrumb.data["url"]);
    }
    scrubPII(breadcrumb.data);
  }
  if (typeof breadcrumb?.message === "string") {
    breadcrumb.message = scrubPIIString(breadcrumb.message);
  }
  return breadcrumb;
}

/**
 * Transaction-події йдуть повз `beforeSend` (той бачить лише error-и), тож без
 * цього хука URL запиту, назва транзакції і span-атрибути летять у Sentry
 * сирими — разом із секретами в path-ах outbound-запитів.
 *
 * Дженерик над `Sentry.Event` (а не `TransactionEvent`), бо `@sentry/node` не
 * реекспортує останній; SDK інстанціює його сам при передачі в `init`.
 */
export function applyBeforeSendTransaction<E extends Sentry.Event>(
  event: E,
): E {
  if (typeof event.request?.url === "string") {
    event.request.url = redactUrlForSink(event.request.url);
  }
  if (event.request?.headers) scrubPII(event.request.headers);
  if (typeof event.transaction === "string") {
    event.transaction = redactUrlForSink(event.transaction);
  }
  if (event.extra) scrubPII(event.extra);
  if (event.contexts) scrubPII(event.contexts);
  for (const span of event.spans ?? []) {
    if (typeof span.description === "string") {
      span.description = redactUrlForSink(span.description);
    }
    if (!span.data) continue;
    scrubPII(span.data);
    for (const attr of SPAN_URL_ATTRIBUTES) {
      const value: unknown = span.data[attr];
      if (typeof value === "string") span.data[attr] = redactUrlForSink(value);
    }
  }
  return event;
}

/**
 * URL substrings that suppress event capture entirely (Sentry `denyUrls`).
 * Sampling drops most health-check traces to 0.1 %, but error events still
 * fire on every failure — uptime monitors hammering `/health` would burn
 * the Sentry error budget on transient 502s. Exported for tests + docs.
 *
 * Use plain strings (not regex) because the Sentry SDK accepts both and
 * strings are easier to audit against `docs/observability/sentry-sampling.md`.
 */
export const SENTRY_DENY_URLS: readonly (string | RegExp)[] = [
  "/api/health",
  "/health",
  // Browser-side request to `/favicon.ico` from monitoring crawlers
  // sometimes generates 404 noise — filter at SDK level rather than
  // teaching every route to handle it.
  /\/favicon\.ico$/,
];

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
  // Unify the runtime release tag to the origin-agnostic `sergeant@<short-sha>`
  // form (`@sergeant/shared` SSOT) so one deploy maps to one Sentry release
  // across server / web / mobile SDKs. `resolveSentryRelease()` stays the bare
  // SHA resolver (its cascade is unit-tested directly); `formatRelease` wraps
  // it for the actual SDK init. See PR-25 (`stack-pulse-2026-05`).
  const release = formatRelease(resolveSentryRelease());
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
    // PII roast 2026-05-13 §P0-S4: drop events from health probes so
    // uptime monitor 502s never burn the Sentry error budget. Traces
    // are still sampled at 0.001 (see `SENTRY_SAMPLING_RULES`) but
    // error events bypass sampling entirely without this list.
    denyUrls: [...SENTRY_DENY_URLS],
    beforeSend: applyBeforeSend,
    beforeSendTransaction: applyBeforeSendTransaction,
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
