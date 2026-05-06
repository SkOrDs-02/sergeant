import { z } from "zod";
import { logger } from "../obs/logger.js";
import { parseKeyRing } from "../lib/keyRing.js";

/**
 * Центральна валідація та документація всіх env-змінних серверу.
 *
 * Запускається при першому імпорті (startup). У production-середовищі кидає
 * помилку, якщо відсутні критичні змінні (`DATABASE_URL`). У dev — логує
 * попередження. Кожна змінна задокументована коментарем і має тип + дефолт.
 *
 * Використання:
 *   import { env } from "../env/env.js";
 *   const pool = new Pool({ connectionString: env.DATABASE_URL });
 *
 * Env-змінні, що вже валідуються окремо (`betterAuthEnv.ts`), теж присутні
 * для повноти документації, але їхня startup-логіка не дублюється.
 */

const coerceInt = z.coerce.number().int();

const envSchema = z.object({
  // ── Core ────────────────────────────────────────────────────────────
  NODE_ENV: z
    .enum(["production", "development", "test"])
    .default("development"),
  /** HTTP-порт. Railway / Replit інжектять автоматично. */
  PORT: coerceInt.default(3000),
  /** `railway` або `replit` — визначає CSP, trust-proxy, static-serving. */
  SERVER_MODE: z.enum(["railway", "replit"]).optional(),
  /**
   * **M2** Trust-proxy override для Express `app.set('trust proxy', …)`.
   *
   * Формати (див. `apps/server/src/lib/trustProxy.ts`):
   *   - `1` (default Railway) — довіряти 1 hop назад у X-Forwarded-For.
   *   - `2` — Cloudflare + Railway scenario.
   *   - `10.0.0.0/8,192.168.0.0/16` — explicit CIDR allowlist.
   *   - `loopback,uniquelocal` — express keyword shortcuts.
   *   - `false` — вимкнути XFF-парсинг повністю.
   *   - `true` — **ЗАБОРОНЕНО**, відхиляється `parseTrustProxy`.
   *
   * Якщо порожнє — fallback до Railway-1 / Replit-undefined (зберігає
   * historical behaviour).
   */
  TRUST_PROXY: z.string().optional(),

  // ── Database ────────────────────────────────────────────────────────
  /** Postgres connection string. Обов'язкова для всього, окрім health-check. */
  DATABASE_URL: z.string().url().optional(),
  /**
   * Pooled Postgres URL (pgBouncer / Supavisor / Neon proxy). PR #046.
   *
   * Якщо заданий — runtime pool (`apps/server/src/db.ts`) ходить через
   * pooler, а `DATABASE_URL` лишається direct-connection і
   * використовується тільки для міграцій (`MIGRATE_DATABASE_URL`
   * fallback) та сесійних воркерів, які ламаються в pgBouncer
   * transaction-mode (advisory locks, `LISTEN/NOTIFY`, named prepared
   * statements). Без `DATABASE_URL_POOL` поведінка не змінюється —
   * pool ходить напряму через `DATABASE_URL`. Деталі деплою — у
   * `docs/runbooks/database-connection-pooling.md`.
   */
  DATABASE_URL_POOL: z.string().url().optional(),
  /**
   * Read-replica Postgres URL (PR #047 — analytics offload).
   *
   * Якщо заданий — opt-in caller-и через `apps/server/src/dbReplica.ts`
   * (зараз `growth_*` / `seo_*` analytics SELECT-и) ходять у replica
   * pool. Writes, транзакції і будь-що з read-after-write semantic-ою
   * лишаються на primary pool. Без `DATABASE_URL_REPLICA` replica
   * helper-и прозоро fallback-ять на primary, тому існуючі деплоїменти
   * без replica працюють так, як і раніше. Acceptable replication lag
   * target: < 5s p99. Деталі — `docs/runbooks/postgres-read-replica.md`.
   */
  DATABASE_URL_REPLICA: z.string().url().optional(),
  /** Максимум з'єднань у pg Pool. */
  PG_POOL_MAX: coerceInt.positive().default(10),
  /** Поріг повільного запиту (мс) для логування та метрики. */
  DB_SLOW_MS: coerceInt.positive().default(200),

  // ── Redis ───────────────────────────────────────────────────────────
  /** Redis URL для глобального rate-limit. Fallback — in-memory per-process. */
  REDIS_URL: z.string().optional(),

  // ── Rate limit ──────────────────────────────────────────────────────
  /**
   * Fail-mode для rate-limit middleware на security-sensitive ендпоінтах
   * (`/api/auth/*`). При відмові і Redis, **і** Postgres (тобто fallback
   * виявився в per-process in-memory limiter), middleware повертає 503
   * замість того, щоб пускати запит через локальний bucket.
   *
   * Чому: in-memory bucket — це per-replica state. На Railway з 3 replicas
   * атакер ефективно отримує `3×limit` запитів/вікно. Для credential-stuffing
   * це прискорює атаку у 3×. Fail-closed для `/api/auth/*` зупиняє цю
   * деградацію — користувач бачить 503 + Retry-After, а атакер не може
   * накручувати спроби, поки backend не відновиться.
   *
   * Default `true`. Можна вимкнути у разі неочікуваних 503-issues у
   * production (наприклад, Redis-blip-и трактуватимуться як fail-closed).
   * Інші маршрути (`/api/health`, public read APIs) лишаються fail-open
   * незалежно від цього flag-а — для них cost-of-blocking вищий за ризик.
   */
  RATE_LIMIT_FAIL_CLOSED_AUTH: z
    .enum(["true", "false", "1", "0", ""])
    .default("true")
    .transform((v) => v === "" || v === "true" || v === "1"),

  // ── Auth (Better Auth) ──────────────────────────────────────────────
  BETTER_AUTH_URL: z.string().url().optional(),
  BETTER_AUTH_SECRET: z.string().optional(),
  /** `"0"` — вимкнути SameSite=None cookies (для single-origin deploys). */
  BETTER_AUTH_CROSS_SITE_COOKIES: z.string().optional(),
  /**
   * 32-byte hex (64 hex chars) ключ для AES-256-GCM шифрування OAuth-токенів
   * (`accessToken` / `refreshToken` / `idToken` у таблиці `account`) — фікс
   * C1 із security-review. Без ключа адаптер записує plaintext (legacy
   * поведінка). У production обов'язковий — `assertStartupEnv` кидає
   * помилку, якщо не заданий разом із `DATABASE_URL`.
   *
   * **H4** (2026-05-04): тепер це fallback для legacy single-key deployments.
   * Multi-key rotation реалізовано через `BETTER_AUTH_TOKEN_ENC_KEYS` +
   * `BETTER_AUTH_TOKEN_ENC_KEY_CURRENT_VERSION` (див. нижче).
   */
  BETTER_AUTH_TOKEN_ENC_KEY: z.string().optional(),
  /**
   * **H4** Multi-key key-ring для AES-256-GCM шифрування OAuth-токенів.
   * Формат: `v1:<64-hex>,v2:<64-hex>,...` — CSV пар `vN:<32-byte-hex>`.
   *
   * Якщо задане, перевизначає legacy `BETTER_AUTH_TOKEN_ENC_KEY`. Версія,
   * яка використовується для **запису** нових ciphertext-ів, обирається
   * через `BETTER_AUTH_TOKEN_ENC_KEY_CURRENT_VERSION`. Версія, яка
   * розшифровує конкретний рядок, читається з префіксу `enc:v2:k<N>:...`
   * або (для legacy `enc:v1:`) трактується як v1.
   *
   * Rotation flow (див. `docs/runbooks/encryption-key-rotation.md`):
   *   1. додати `v2:hex` до `_KEYS` (deploy)
   *   2. бампнути `_CURRENT_VERSION=v2` (deploy) — нові записи йдуть під v2
   *   3. через retention-window (≥30d) прибрати `v1:` із `_KEYS`
   *      (всі активні рядки вже re-encrypted на refresh)
   */
  BETTER_AUTH_TOKEN_ENC_KEYS: z.string().optional(),
  /**
   * **H4** Поточна версія ключа для запису ciphertext-ів. Формат — `vN`,
   * де N — позитивне ціле, присутнє у `BETTER_AUTH_TOKEN_ENC_KEYS`. Якщо
   * порожнє, використовується найвища версія у key-ring-у. Якщо
   * посилається на версію, якої нема у `_KEYS`, `parseKeyRing` кидає
   * помилку при першому використанні.
   */
  BETTER_AUTH_TOKEN_ENC_KEY_CURRENT_VERSION: z.string().optional(),
  MIN_PASSWORD_LENGTH: coerceInt.positive().default(10),
  /**
   * Hard-capped at 256 as DoS-defence against pathologically long passwords —
   * **not** a bcrypt 72-byte mitigation. Better Auth (`@better-auth/utils`) hashes
   * passwords with **scrypt** (`N=16384, r=16, p=1, dkLen=64`), which has no
   * 72-byte input limit; arbitrary-length input contributes uniquely to the
   * derived key. The cap exists purely to bound CPU/memory of a single hash
   * call so a malicious client cannot trigger a multi-second scrypt with, e.g.,
   * a 10 MB "password". 256 chars covers any realistic passphrase / dice-ware
   * passphrase use-case while keeping per-request work bounded. See ADR-0042.
   */
  MAX_PASSWORD_LENGTH: coerceInt.positive().max(256).default(256),
  /**
   * H6 — soft kill-switch for Better Auth's `requireEmailVerification`.
   *
   * Default `false` (deliberate): existing accounts created before H6
   * shipped have `email_verified=false` and would all be locked out of
   * sign-in instantly if we flipped this to `true` repo-wide. Ops flips
   * this `true` after a soft-gate / re-verification sweep is run on
   * legacy users. The verification email is **always** sent on sign-up
   * regardless of this flag (`auth.ts → emailVerification.sendOnSignUp`),
   * so newly created accounts will always have a working verification
   * path.
   *
   * Independent of this flag, sensitive endpoints (currently
   * `POST /api/mono/connect`) gate on `req.user.emailVerified` via the
   * `requireVerifiedEmail()` middleware. Closes the most exploitable
   * vector of the H6 card (account-squatting → bank-statement leak)
   * without waiting for the global flip.
   */
  REQUIRE_EMAIL_VERIFICATION: z
    .enum(["true", "false", "1", "0", ""])
    .default("false")
    .transform((v) => v === "true" || v === "1"),

  // ── CORS / Origins ──────────────────────────────────────────────────
  /** Comma-separated allowed origins (e.g. `https://app.example.com`). */
  ALLOWED_ORIGINS: z.string().optional(),
  /** Regex pattern для динамічних origins (Vercel preview deploys тощо). */
  ALLOWED_ORIGIN_REGEX: z.string().optional(),

  // ── Replit ──────────────────────────────────────────────────────────
  REPLIT_DEV_DOMAIN: z.string().optional(),
  REPLIT_DOMAINS: z.string().optional(),

  // ── Railway ─────────────────────────────────────────────────────────
  RAILWAY_ENVIRONMENT: z.string().optional(),
  RAILWAY_SERVICE_NAME: z.string().optional(),
  RAILWAY_GIT_COMMIT_SHA: z.string().optional(),

  // ── AI (Anthropic) ─────────────────────────────────────────────────
  /** API-ключ для Anthropic Claude. Без нього /api/chat повертає 500. */
  ANTHROPIC_API_KEY: z.string().optional(),
  /**
   * API-ключ Groq для голосової транскрипції (`/api/transcribe`).
   * Без нього endpoint повертає 503; фронт автоматично відкочується
   * на Web Speech API (бачить це з `GET /api/transcribe/health`).
   */
  GROQ_API_KEY: z.string().optional(),
  /**
   * Whisper-модель Groq для транскрипції. За замовчуванням
   * `whisper-large-v3-turbo` — найдешевший варіант з адекватною
   * якістю українською. Альтернатива: `whisper-large-v3`.
   *
   * **M4** — code-side allowlist. Розширення enum-у потребує PR-ревʼю,
   * замість прихованої env-зміни. Дублюється у
   * `apps/server/src/modules/transcribe/transcribe.ts` (boot-time
   * fail-fast). Див.
   * `docs/security/hardening/M4-groq-model-allowlist.md`.
   */
  GROQ_TRANSCRIBE_MODEL: z
    .enum(["whisper-large-v3-turbo", "whisper-large-v3"])
    .default("whisper-large-v3-turbo"),
  /**
   * Killer-switch для AI-квоти: при `true` `assertAiQuota()` стає no-op і всі
   * AI-роути проходять без декременту лічильника `ai_usage_daily`. Призначений
   * **виключно** для CI/test середовищ, де e2e ганяють реальний Anthropic API
   * без burning-у user-quota (див. `.github/workflows/extended-e2e.yml`).
   *
   * У production цей flag є fail-open kill-switch для billing-а: якщо випадково
   * виставити `1` у Railway env (copy-paste зі staging, або помилка у helm-у),
   * жоден per-user / per-IP ліміт більше не працює — користувачі можуть
   * burn-нути unlimited Anthropic budget. Тому `assertStartupEnv()` хард-блокує
   * production-startup, якщо одночасно `NODE_ENV=production` (або Railway env)
   * і цей flag truthy.
   *
   * Default: `false`. Приймається як `true|false|1|0`.
   */
  AI_QUOTA_DISABLED: z
    .enum(["true", "false", "1", "0", ""])
    .default("false")
    .transform((v) => v === "true" || v === "1"),
  /** Денний ліміт AI-запитів для автентифікованого юзера. */
  AI_DAILY_USER_LIMIT: coerceInt.nonnegative().optional(),
  /** Денний ліміт AI-запитів для анонімного юзера. */
  AI_DAILY_ANON_LIMIT: coerceInt.nonnegative().optional(),
  /** Вартість tool-call у одиницях квоти (default 3). */
  AI_QUOTA_TOOL_COST: coerceInt.nonnegative().optional(),
  /** JSON `{"tool_name": maxPerDay}` для per-tool лімітів. */
  AI_QUOTA_TOOL_LIMITS: z.string().optional(),
  /** Дефолтний ліміт tool-call на день, якщо tool не в AI_QUOTA_TOOL_LIMITS. */
  AI_QUOTA_TOOL_DEFAULT_LIMIT: coerceInt.nonnegative().optional(),
  /** Інтервал SSE heartbeat (мс). Тримає з'єднання живим через проксі. */
  SSE_HEARTBEAT_MS: coerceInt.positive().default(15_000),

  // ── Push Notifications ─────────────────────────────────────────────
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_EMAIL: z.string().optional(),
  /** Base64-encoded APNs .p8 key file content. */
  APNS_P8_KEY: z.string().optional(),
  APNS_KEY_ID: z.string().optional(),
  APNS_TEAM_ID: z.string().optional(),
  APNS_BUNDLE_ID: z.string().optional(),
  /** `"true"` — APNs production gateway, інакше sandbox. */
  APNS_PRODUCTION: z.string().optional(),
  /** JSON string of FCM service account credentials. */
  FCM_SERVICE_ACCOUNT_JSON: z.string().optional(),

  // ── Email ──────────────────────────────────────────────────────────
  /** Resend API key. Без нього email (password reset, verification) скіпається. */
  RESEND_API_KEY: z.string().optional(),
  /** Адреса відправника (default: Sergeant <onboarding@resend.dev>). */
  RESEND_FROM: z.string().optional(),

  // ── Observability ──────────────────────────────────────────────────
  /** Sentry DSN. Без нього Sentry вимкнений (Noop SDK). */
  SENTRY_DSN: z.string().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
  SENTRY_RELEASE: z.string().optional(),
  /** `0.0`–`1.0` sampling rate для Sentry performance traces. */
  SENTRY_TRACES_SAMPLE_RATE: z.string().optional(),
  /** Pino log level override (trace, debug, info, warn, error, fatal). */
  LOG_LEVEL: z.string().optional(),
  /** `"1"` — human-readable pino-pretty output. */
  LOG_PRETTY: z.string().optional(),
  /** Bearer token для захисту `GET /metrics`. */
  METRICS_TOKEN: z.string().optional(),

  // ── OpenTelemetry (Phase 2 з ініціативи 0004) ──────────────────────
  /**
   * OTLP/HTTP collector endpoint (e.g. `https://api.honeycomb.io:443/v1/traces`,
   * `https://otlp-gateway-prod-eu-north-0.grafana.net/otlp/v1/traces`,
   * `http://tempo:4318/v1/traces`). Без нього OTel SDK НЕ ініціалізується —
   * `aiSpan`/`dbSpan` стають NoopTracer-обгортками, auto-instrumentation
   * не реєструється. Sentry tracing продовжує працювати окремо. Деталі:
   * `apps/server/src/obs/tracing.ts` + `docs/observability/runbook.md`.
   */
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  /** Endpoint лише для traces (overrides `OTEL_EXPORTER_OTLP_ENDPOINT`). */
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: z.string().optional(),
  /**
   * Headers (e.g. `x-honeycomb-team=<key>`). Формат — comma-separated
   * `k=v,k=v`. SECRET-значення (API keys) ходять через `secrets`,
   * НЕ комітимо в `.env.example`.
   */
  OTEL_EXPORTER_OTLP_HEADERS: z.string().optional(),
  OTEL_EXPORTER_OTLP_TRACES_HEADERS: z.string().optional(),
  /** `service.name` resource attribute. Default: `sergeant-api`. */
  OTEL_SERVICE_NAME: z.string().optional(),
  /** Override service.version (default — береться з SENTRY_RELEASE / Git SHA). */
  OTEL_SERVICE_VERSION: z.string().optional(),
  /** Default sample rate для GET-запитів. 0.0–1.0; default 0.1 (10%). */
  OTEL_TRACES_SAMPLE_RATE: z.string().optional(),
  /**
   * Personal API key для server-side PostHog cleanup (ADR-0016 ADR-6.3).
   * Має project-level scope із write-доступом до `persons`. БЕЗ нього
   * `deletePostHogPerson()` повертає `outcome: "skipped"` — GDPR worker
   * markує row як completed (no-op).
   */
  POSTHOG_API_KEY: z.string().optional(),
  /** Числовий ID PostHog-проєкту (Settings → Project → ID). */
  POSTHOG_PROJECT_ID: z.string().optional(),
  /**
   * Server-side host для PostHog API. EU Cloud: `https://eu.i.posthog.com`
   * (default), US: `https://us.i.posthog.com`, self-hosted: власна URL.
   * Парний до клієнтського `VITE_POSTHOG_HOST`.
   */
  POSTHOG_HOST: z.string().optional(),

  // ── Security ───────────────────────────────────────────────────────
  // M1 (2026-05-04) — CSP_DISABLE видалено. Якщо потрібно швидко вимкнути
  // CSP — використовуй CSP_REPORT_ONLY=1 (header переходить у Report-Only,
  // не блокуючи браузер). Постійне вимкнення робиться лише через explicit
  // PR (revert apiHelmetMiddleware).
  /** `"1"` — CSP у report-only mode. */
  CSP_REPORT_ONLY: z.string().optional(),
  // ── Monobank webhook ─────────────────────────────────────────────────
  /** Feature flag: увімкнути webhook-based Monobank інтеграцію. */
  MONO_WEBHOOK_ENABLED: z
    .enum(["true", "false", "1", "0", ""])
    .optional()
    .transform((v) => v === "true" || v === "1"),
  /** 32-byte hex ключ для AES-256-GCM шифрування Monobank токенів. */
  MONO_TOKEN_ENC_KEY: z.string().optional(),
  /** Публічна базова URL API (Railway) для реєстрації webhook у Monobank. */
  PUBLIC_API_BASE_URL: z.string().optional(),

  // ── Nutrition backups ──────────────────────────────────────────────
  /**
   * Серверний секрет для HMAC-SHA256, що формує ім'я файлу
   * nutrition-backup на диску. Без секрету `safeBackupKeyFromToken`
   * кидає помилку, тому `/api/nutrition/backup-{upload,download}`
   * повертають 503 і не торкаються файлової системи.
   *
   * У production обов'язковий — інакше ключ можна перебрати, як це
   * було з 32-bit FNV-1a (IDOR). Згенеруй: `openssl rand -hex 32`.
   */
  NUTRITION_BACKUP_KEY_SECRET: z.string().optional(),

  // ── External APIs ──────────────────────────────────────────────────
  /** USDA FoodData Central API key. Fallback: `DEMO_KEY`. */
  USDA_API_KEY: z.string().optional(),

  // ── Shutdown ───────────────────────────────────────────────────────
  /** Grace-period (мс) для завершення in-flight запитів при SIGTERM. */
  SHUTDOWN_GRACE_MS: coerceInt.nonnegative().default(15_000),
  /** Hard-timeout (мс) — process.exit якщо shutdown зависне. */
  SHUTDOWN_HARD_TIMEOUT_MS: coerceInt.nonnegative().default(25_000),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${formatted}`);
  }
  return Object.freeze(result.data);
}

export const env: Env = parseEnv();

/**
 * Startup assertions для production. Виклик у `index.ts` після імпорту.
 * Не дублює `betterAuthEnv.ts` — лише перевіряє змінні поза auth-скоупом.
 */
export function assertStartupEnv(): void {
  const isProduction =
    env.NODE_ENV === "production" ||
    Boolean(env.RAILWAY_ENVIRONMENT) ||
    Boolean(env.RAILWAY_SERVICE_NAME);

  const warnings: string[] = [];

  if (!env.DATABASE_URL) {
    if (isProduction) {
      throw new Error(
        "DATABASE_URL is required in production. Set it to a Postgres connection string.",
      );
    }
    warnings.push(
      "DATABASE_URL is not set — database features will be unavailable.",
    );
  }

  if (!env.ANTHROPIC_API_KEY) {
    warnings.push(
      "ANTHROPIC_API_KEY is not set — AI chat/coach/nutrition endpoints will return 500.",
    );
  }

  if (!env.REDIS_URL) {
    warnings.push(
      "REDIS_URL is not set — rate limiting falls back to in-memory (per-process, not global).",
    );
  }

  if (isProduction && !env.SENTRY_DSN) {
    warnings.push(
      "SENTRY_DSN is not set — error tracking is disabled in production.",
    );
  }

  if (isProduction && !env.METRICS_TOKEN) {
    warnings.push(
      "METRICS_TOKEN is not set — /metrics endpoint is unprotected.",
    );
  }

  if (isProduction && !env.NUTRITION_BACKUP_KEY_SECRET) {
    throw new Error(
      "NUTRITION_BACKUP_KEY_SECRET is required in production. Without it nutrition backup file paths are derivable per-user and brute-forceable. Generate one with `openssl rand -hex 32`.",
    );
  } else if (!env.NUTRITION_BACKUP_KEY_SECRET) {
    warnings.push(
      "NUTRITION_BACKUP_KEY_SECRET is not set — /api/nutrition/backup-{upload,download} will return 503.",
    );
  }

  // H9: AI_QUOTA_DISABLED is a billing kill-switch — fine in CI/test where e2e
  // hammers real Anthropic without burning user quota, catastrophic in
  // production where it disables every per-user / per-IP cap. The advisory
  // module-load `logger.warn` in aiQuota.ts was easy to miss; this fail-fast
  // check refuses to start the server at all so the misconfig is caught at
  // boot instead of at the next billing cycle.
  if (isProduction && env.AI_QUOTA_DISABLED) {
    throw new Error(
      "AI_QUOTA_DISABLED MUST NOT be set in production. It disables every per-user / per-IP AI cap and lets clients burn the entire Anthropic budget. If you really need this in production (e.g. emergency disable of the quota subsystem itself), unset NODE_ENV / RAILWAY_ENVIRONMENT for that run, document the reason in the runbook, and remove the override immediately after.",
    );
  }

  // Hard Rule #20 (stack-pulse-2026-05 PR-06 Phase 2): OpenClaw must
  // authenticate to GitHub via the GitHub App-flow only. The legacy PAT
  // (`OPENCLAW_GITHUB_PAT`) and its `Git_PAT` fallback have been removed
  // from the env schema, but a stale value in Railway / Vercel
  // environment storage still leaks into `process.env`. We hard-block
  // production startup if either is present so the misconfig is caught
  // at boot — and so the operator is forced to scrub the secret-store
  // instead of leaving a long-lived token sitting around. Read raw
  // `process.env` (not the zod-typed `env`) precisely because the
  // schema dropped these keys; we need to spot the leftover regardless.
  if (isProduction) {
    const leftoverPats: string[] = [];
    if (process.env["OPENCLAW_GITHUB_PAT"]) {
      leftoverPats.push("OPENCLAW_GITHUB_PAT");
    }
    if (process.env["Git_PAT"]) {
      leftoverPats.push("Git_PAT");
    }
    if (leftoverPats.length > 0) {
      throw new Error(
        `Hard Rule #20 violated: ${leftoverPats.join(", ")} present in production. OpenClaw must authenticate via the GitHub App-flow only — set OPENCLAW_GITHUB_APP_{ID,PRIVATE_KEY,INSTALLATION_ID} and remove the legacy PAT(s) from the secret-store. See docs/playbooks/rotate-openclaw-credentials.md.`,
      );
    }
  }

  if (env.MONO_WEBHOOK_ENABLED) {
    if (!env.MONO_TOKEN_ENC_KEY) {
      throw new Error(
        "MONO_TOKEN_ENC_KEY is required when MONO_WEBHOOK_ENABLED=true. Must be 32-byte hex (64 chars).",
      );
    }
    if (!env.PUBLIC_API_BASE_URL) {
      throw new Error(
        "PUBLIC_API_BASE_URL is required when MONO_WEBHOOK_ENABLED=true.",
      );
    }
  }

  // C1: encrypt OAuth tokens at rest. In production we hard-fail without
  // the key — running plaintext-tokens-in-prod is exactly the regression
  // we shipped this code to prevent. In dev/test we only warn so existing
  // local dev environments don't break overnight.
  //
  // H4: accept either the new multi-key form (`*_KEYS` + `*_CURRENT_VERSION`)
  // or the legacy single-key (`BETTER_AUTH_TOKEN_ENC_KEY`). Validate via
  // `parseKeyRing` so configuration errors fail fast at boot, not on first
  // sign-in.
  const hasKeyRing = Boolean(
    env.BETTER_AUTH_TOKEN_ENC_KEYS || env.BETTER_AUTH_TOKEN_ENC_KEY,
  );
  if (hasKeyRing) {
    try {
      parseKeyRing({
        keysCsv: env.BETTER_AUTH_TOKEN_ENC_KEYS,
        currentVersion: env.BETTER_AUTH_TOKEN_ENC_KEY_CURRENT_VERSION,
        legacyKey: env.BETTER_AUTH_TOKEN_ENC_KEY,
        envName: "BETTER_AUTH_TOKEN_ENC_KEY",
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`BETTER_AUTH_TOKEN_ENC_KEY[S] is invalid: ${detail}`);
    }
  } else if (isProduction && env.DATABASE_URL) {
    throw new Error(
      "BETTER_AUTH_TOKEN_ENC_KEY (or _KEYS) is required in production. Generate one with `openssl rand -hex 32`.",
    );
  } else if (env.DATABASE_URL) {
    warnings.push(
      "BETTER_AUTH_TOKEN_ENC_KEY is not set — OAuth tokens will be stored as plaintext (insecure; allowed in dev only).",
    );
  }

  if (warnings.length > 0) {
    for (const w of warnings) logger.warn({ msg: "env_warning", detail: w });
  }
}
