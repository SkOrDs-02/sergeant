/**
 * OpenTelemetry bootstrap — Phase 2 з ініціативи 0004 (server observability).
 *
 * Контракт:
 *   - Цей модуль імпортується ПЕРШИМ у `apps/server/src/index.ts`, до
 *     `./sentry.js` і до будь-якого `import express`. ESM-evaluation
 *     depth-first, тому top-level код тут виконається до завантаження
 *     `http`/`express`/`pg` — це необхідна умова для того, щоб OTel
 *     auto-instrumentation встигла monkey-patch-нути модулі.
 *
 *   - Якщо `OTEL_EXPORTER_OTLP_ENDPOINT` не заданий — модуль повертає
 *     no-op і не реєструє жодного провайдера. `@opentelemetry/api` тоді
 *     роздає NoopTracer; виклики `aiSpan` / `dbSpan` (`./spans.ts`) працюють
 *     як прозорі callback-обгортки без overhead-у. Sentry-інтеграції
 *     (httpIntegration і т.п.) продовжують працювати незмінно.
 *
 *   - Коли OTLP endpoint заданий — реєструємо власний NodeSDK з
 *     auto-instrumentation для http/express/pg/fetch і route-aware sampler-ом
 *     (`./sampler.ts`). У цьому режимі рекомендовано вимкнути Sentry
 *     performance traces (`SENTRY_TRACES_SAMPLE_RATE=0`), щоб не отримувати
 *     дві картини latency з різним sampling-ом. Деталі і Honeycomb /
 *     Grafana Cloud Tempo / Tempo-self-hosted setup — у
 *     `docs/observability/runbook.md` § «OpenTelemetry traces».
 *
 *   - Privacy: header denylist (`authorization`, `cookie`, webhook secrets,
 *     internal tokens) і параметри з PII не пишемо у span-атрибути; список
 *     сумісний з `redactKeyNames` з `./logger.ts` — щоб OTel-export-и не
 *     просочили те, що Pino redaction уже маскує.
 *
 *   - Контекст: ALS-store (`./requestContext.ts`) має поле `traceId`. Коли
 *     OTel створює root-span на запит, ми переписуємо `store.traceId`
 *     на OTel-trace-ID — Pino-логи автоматично починають корелюватись з
 *     OTel-traces без подвійного парсингу `traceparent`.
 */

import * as api from "@opentelemetry/api";
import {
  CompositePropagator,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from "@opentelemetry/core";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  BatchSpanProcessor,
  type SpanExporter,
  type SpanProcessor,
  type ReadableSpan,
} from "@opentelemetry/sdk-trace-base";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";

import { env as defaultEnv, type Env } from "../env.js";
import { REDACT_KEY_NAMES } from "@sergeant/shared";

import { createRouteAwareSampler } from "./sampler.js";

/**
 * Narrow env shape that this module reads.  Aligns with backend-perf PR-02
 * (`docs/planning/pr-plan-backend-perf-2026-05.md` § PR-02 « drop raw env DI
 * default in obs/tracing.ts »): the old default-parameter leaked raw env reads
 * into the prod runtime and fought the env-single-source CI gate
 * (`scripts/check-env-single-source.mjs`).  Now we require an explicit,
 * Zod-validated env object — the module-evaluation side-effect at the
 * bottom of this file passes `env` from `../env.js`; tests pass a typed
 * fixture (a `Partial<TracingEnv>` literal).  `Partial` keeps the literal
 * test shapes assignable even though Zod's `.optional()` makes the
 * fields `string | undefined` rather than `string?`.
 */
export type TracingEnv = Partial<
  Pick<
    Env,
    | "OTEL_EXPORTER_OTLP_ENDPOINT"
    | "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"
    | "OTEL_SERVICE_NAME"
    | "OTEL_SERVICE_VERSION"
    | "OTEL_TRACES_SAMPLE_RATE"
    | "OTEL_EXPORTER_OTLP_HEADERS"
    | "OTEL_EXPORTER_OTLP_TRACES_HEADERS"
    | "SENTRY_RELEASE"
    | "RAILWAY_GIT_COMMIT_SHA"
    | "VERCEL_GIT_COMMIT_SHA"
    | "GITHUB_SHA"
  >
>;

interface ResolvedTracingConfig {
  endpoint: string;
  serviceName: string;
  serviceVersion: string | undefined;
  defaultSampleRate: number;
  headers: Record<string, string>;
  enabled: boolean;
}

const HEADER_DENYLIST = new Set(
  [
    "authorization",
    "cookie",
    "set-cookie",
    "x-api-key",
    "x-token",
    "x-csrf-token",
    "x-mono-webhook-secret",
    "x-openclaw-webhook-secret",
    "x-api-secret",
    "x-internal-token",
    "proxy-authorization",
  ].map((h) => h.toLowerCase()),
);

export const OTEL_ATTRIBUTE_DENYLIST: ReadonlySet<string> = new Set([
  ...REDACT_KEY_NAMES.map((key) => key.toLowerCase()),
  ...Array.from(HEADER_DENYLIST),
]);

/** Sentinel written into span attributes that match the denylist. */
export const OTEL_REDACTED_SENTINEL = "[redacted]";

/**
 * SpanProcessor decorator that scrubs any attribute whose lower-cased key
 * appears in `OTEL_ATTRIBUTE_DENYLIST` before the span is exported.
 *
 * Placed between the SDK's instrumentation layer and the downstream
 * exporter/processor so that sensitive values are redacted at export time
 * regardless of which auto-instrumentation or manual code wrote them.
 *
 * Must be exported for tests that wire up a `BasicTracerProvider` directly
 * (bypassing `NodeSDK`) to verify the redaction contract with an
 * `InMemorySpanExporter`.
 */
export class DenylistAttributeSpanProcessor implements SpanProcessor {
  constructor(private readonly downstream: SpanProcessor) {}

  onStart(
    span: Parameters<SpanProcessor["onStart"]>[0],
    parentContext: Parameters<SpanProcessor["onStart"]>[1],
  ): void {
    this.downstream.onStart(span, parentContext);
  }

  onEnd(span: ReadableSpan): void {
    // `span.attributes` is `readonly Attributes` in the type but the
    // underlying object is a plain mutable record owned by this span —
    // we are allowed to mutate it here before forwarding to the exporter.
    const attrs = span.attributes as Record<string, unknown>;
    for (const key of Object.keys(attrs)) {
      if (OTEL_ATTRIBUTE_DENYLIST.has(key.toLowerCase())) {
        attrs[key] = OTEL_REDACTED_SENTINEL;
      }
    }
    this.downstream.onEnd(span);
  }

  forceFlush(): Promise<void> {
    return this.downstream.forceFlush();
  }

  shutdown(): Promise<void> {
    return this.downstream.shutdown();
  }
}

function parseRate(val: string | undefined, fallback: number): number {
  if (val == null || val === "") return fallback;
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function parseHeaders(val: string | undefined): Record<string, string> {
  if (!val) return {};
  const out: Record<string, string> = {};
  for (const pair of val.split(",")) {
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const key = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

function resolveServiceVersion(env: TracingEnv): string | undefined {
  const candidates = [
    env.OTEL_SERVICE_VERSION,
    env.SENTRY_RELEASE,
    env.RAILWAY_GIT_COMMIT_SHA,
    env.VERCEL_GIT_COMMIT_SHA,
    env.GITHUB_SHA,
  ];
  for (const v of candidates) {
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return undefined;
}

export function resolveTracingConfig(env: TracingEnv): ResolvedTracingConfig {
  const endpoint =
    env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
    env.OTEL_EXPORTER_OTLP_ENDPOINT ||
    "";
  const enabled = endpoint !== "";
  return {
    endpoint,
    serviceName: env.OTEL_SERVICE_NAME || "sergeant-api",
    serviceVersion: resolveServiceVersion(env),
    defaultSampleRate: parseRate(env.OTEL_TRACES_SAMPLE_RATE, 0.1),
    headers: {
      ...parseHeaders(env.OTEL_EXPORTER_OTLP_HEADERS),
      ...parseHeaders(env.OTEL_EXPORTER_OTLP_TRACES_HEADERS),
    },
    enabled,
  };
}

interface BootstrappedTracing {
  sdk: NodeSDK | null;
  config: ResolvedTracingConfig;
  shutdown(): Promise<void>;
}

let bootstrapped: BootstrappedTracing | null = null;

/**
 * Створює `NodeSDK` без `start()` — викликається у тесті, щоб ассертити
 * resource/sampler/exporter без побічних ефектів registry.
 */
export function createTracingSdk(
  config: ResolvedTracingConfig,
  exporterFactory: (cfg: ResolvedTracingConfig) => SpanExporter = (c) =>
    new OTLPTraceExporter({
      url: c.endpoint,
      headers: c.headers,
    }),
): NodeSDK {
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: config.serviceName,
    ...(config.serviceVersion
      ? { [ATTR_SERVICE_VERSION]: config.serviceVersion }
      : {}),
  });

  const sampler = createRouteAwareSampler({
    defaultRate: config.defaultSampleRate,
  });

  const exporter = exporterFactory(config);

  return new NodeSDK({
    resource,
    sampler,
    spanProcessors: [
      new DenylistAttributeSpanProcessor(new BatchSpanProcessor(exporter)),
    ],
    textMapPropagator: new CompositePropagator({
      propagators: [
        new W3CTraceContextPropagator(),
        new W3CBaggagePropagator(),
      ],
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // dns/net дають занадто багато шуму без додаткової діагностичної
        // цінності — server-side ми вже бачимо http через express+http
        // інструментацію.
        "@opentelemetry/instrumentation-dns": { enabled: false },
        "@opentelemetry/instrumentation-net": { enabled: false },
        // fs spans накопичуються тисячами на старті — сильно б'є по
        // OTLP-quota і не несе value (file IO не bottleneck). Вмикається
        // вручну для targeted-debug.
        "@opentelemetry/instrumentation-fs": { enabled: false },
        "@opentelemetry/instrumentation-http": {
          enabled: true,
          ignoreIncomingRequestHook: (req) => {
            const url = (req.url ?? "").split("?")[0];
            if (!url) return false;
            // Уникаємо trace-flood-у на health-checks (sampler теж їх дропає,
            // але cheaper не створювати span-у взагалі).
            return (
              url === "/livez" ||
              url === "/readyz" ||
              url === "/startupz" ||
              url === "/healthz" ||
              url.startsWith("/health/") ||
              url === "/metrics"
            );
          },
          // Privacy: не пишемо чутливі заголовки у span attributes.
          headersToSpanAttributes: {
            client: { requestHeaders: [], responseHeaders: [] },
            server: { requestHeaders: [], responseHeaders: [] },
          },
          requestHook(span, request) {
            // Очищаємо потенційно sensitive `http.url` (Mono webhook secret
            // у path), узгоджено з `redactSensitiveUrl` для Sentry-events.
            const url =
              "url" in request && typeof request.url === "string"
                ? request.url
                : null;
            if (!url) return;
            if (url.startsWith("/api/mono/webhook/")) {
              span.updateName("POST /api/mono/webhook/[redacted]");
            }
          },
        },
        "@opentelemetry/instrumentation-express": {
          enabled: true,
        },
        "@opentelemetry/instrumentation-pg": {
          enabled: true,
          // Ми не пишемо повний SQL у span: production-запити з користувача-вхідним
          // text-ом (notes, descriptions) можуть нести PII.
          enhancedDatabaseReporting: false,
        },
        // `@opentelemetry/instrumentation-redis-4` (node-redis v4 split)
        // was folded back into `@opentelemetry/instrumentation-redis` in
        // auto-instrumentations-node 0.65+, so only the canonical key
        // remains in InstrumentationConfigMap.
        "@opentelemetry/instrumentation-redis": { enabled: true },
        "@opentelemetry/instrumentation-ioredis": { enabled: true },
        "@opentelemetry/instrumentation-undici": { enabled: true },
      }),
    ],
  });
}

export function startTracing(env: TracingEnv): BootstrappedTracing {
  if (bootstrapped) return bootstrapped;
  const config = resolveTracingConfig(env);

  if (!config.enabled) {
    bootstrapped = {
      sdk: null,
      config,
      async shutdown() {
        /* no-op */
      },
    };
    return bootstrapped;
  }

  const sdk = createTracingSdk(config);

  try {
    sdk.start();
    // `start()` синхронний у sdk-node; реєстрація провайдера завершується
    // одразу після виклику. Якщо в майбутньому SDK перейде на async — це
    // не зламає коректність нашого ALS-bridge: виклики до перших span-ів
    // йтимуть у NoopTracer, що допустимо.
  } catch (err) {
    // Не валимо процес: OTel — second-class observability. Лог робимо
    // через console.log (як sentry.ts), бо logger.ts ще не ініціалізований.
    console.log(
      JSON.stringify({
        level: "error",
        msg: "otel_init_failed",
        err: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  // Лог підтвердження для оператора. Sample-rate, endpoint host (без path)
  // у логах безпечні; авторизаційні заголовки у `headers` ми не друкуємо.
  let endpointHost = config.endpoint;
  try {
    endpointHost = new URL(config.endpoint).host || config.endpoint;
  } catch {
    /* keep raw */
  }
  console.log(
    JSON.stringify({
      level: "info",
      msg: "otel_initialized",
      endpoint_host: endpointHost,
      service_name: config.serviceName,
      service_version: config.serviceVersion ?? null,
      sample_rate: config.defaultSampleRate,
    }),
  );

  bootstrapped = {
    sdk,
    config,
    async shutdown() {
      try {
        await sdk.shutdown();
      } catch (err) {
        console.log(
          JSON.stringify({
            level: "warn",
            msg: "otel_shutdown_failed",
            err: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    },
  };

  // Зачепимось за SIGTERM/SIGINT — Railway надсилає SIGTERM при rolling
  // deploy, і ми хочемо прокинути queued-spans перед exit. `index.ts` має
  // власний graceful shutdown, але він не знає про OTel — тому додатковий
  // hook тут (idempotent: SDK.shutdown() безпечно викликати двічі).
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      void bootstrapped?.shutdown();
    });
  }

  return bootstrapped;
}

export function getTracingConfig(): ResolvedTracingConfig | null {
  return bootstrapped?.config ?? null;
}

/** Test-helper: скинути bootstrapped state. Не для prod. */
export function __resetTracingForTests(): void {
  bootstrapped = null;
}

// Side-effect: викликаємо `startTracing()` на ESM module-evaluation, щоб
// auto-instrumentation встигла обгорнути http/express до того, як index.ts
// завантажить express. Якщо модуль імпортується з тесту — `__resetTracingForTests`
// скидає state, і тести можуть викликати `startTracing()` явно з мок-env.
//
// `defaultEnv` — валідований Zod-env із `../env.js` (ре-export з
// `env/env.ts`). Пряме читання сирого Node env вже не виконується
// в цьому модулі — всі потрібні поля живуть у Zod-схемі (див.
// `env/env.ts` § RAILWAY/VERCEL/GITHUB_SHA та OTEL_*).
startTracing(defaultEnv);

// Re-export для тих, хто хоче shutdown (наприклад, у тестах або
// graceful-shutdown коді).
export const otel = api;
export { HEADER_DENYLIST };
