import { z } from "zod";

import { aiRoutingEnvShape } from "./aiRoutingEnv.js";
import { CHAT_VIA_OPENROUTER_DEFAULT, defaultChatModel } from "./chatModels.js";
import { parseKeyRing } from "../lib/keyRing.js";
// Хелпери винесені в `./envHelpers.js` цією гілкою; main паралельно
// забрав LLM_*-ключі у `aiRoutingEnvShape` (PR #634), тож
// `llmProviderEnum` тут більше не потрібен — `aiRoutingEnv.ts` тримає
// власну копію.
import {
  boolFromEnv,
  coerceInt,
  floatFromEnv,
  intFromEnv,
  optionalUrl,
  stringWithDefault,
} from "./envHelpers.js";
import { telegramEnvShape } from "./telegramEnv.js";

const envSchema = z.object({
  ...aiRoutingEnvShape,

  NODE_ENV: z
    .enum(["production", "development", "test"])
    .default("development"),

  APP_ENV: z.string().optional(),

  PORT: coerceInt.default(3000),

  TRUST_PROXY: z.string().optional(),

  HOST: stringWithDefault("0.0.0.0"),

  REQUEST_TIMEOUT_MS: intFromEnv(120_000),

  COMPRESSION_ENABLED: boolFromEnv(true),

  DATABASE_URL: optionalUrl(),

  DATABASE_URL_POOL: optionalUrl(),

  DATABASE_URL_REPLICA: optionalUrl(),

  PG_POOL_SIZE: intFromEnv(20),

  PG_CONNECTION_TIMEOUT_MS: intFromEnv(5_000),

  PG_SLOW_CONNECT_MS: intFromEnv(500),

  PG_IDLE_TIMEOUT_MS: intFromEnv(30_000),

  PG_STATEMENT_TIMEOUT_MS: intFromEnv(30_000),

  DB_MAX_RETRIES: intFromEnv(3),

  DB_SLOW_MS: coerceInt.positive().default(200),

  SLOW_QUERY_THRESHOLD_MS: intFromEnv(100),

  LOG_SLOW_QUERIES: boolFromEnv(true),

  REDIS_URL: stringWithDefault(""),

  REDIS_MAX_RETRIES: intFromEnv(10),

  REDIS_RECONNECT_DELAY_MS: intFromEnv(100),

  REDIS_MAX_RECONNECT_DELAY_MS: intFromEnv(3_000),

  RATE_LIMIT_FAIL_CLOSED_AUTH: z
    .enum(["true", "false", "1", "0", ""])
    .default("true")
    .transform((v) => v === "" || v === "true" || v === "1"),

  BETTER_AUTH_URL: z.string().url().optional(),
  BETTER_AUTH_SECRET: z.string().optional(),

  /**
   * Origin веб-застосунку (Vercel у проді, Vite локально). Використовується
   * як `callbackURL` у транзакційних листах Better Auth — куди повертається
   * користувач після кліку «Підтвердити email».
   *
   * Окремий від `BETTER_AUTH_URL`: фронт і API живуть на різних хостах
   * (Vercel ↔ Coolify), а API не роздає SPA (`config.servesFrontend === false`),
   * тож редирект на API-домен дає 404.
   *
   * Необовʼязковий: без нього `getWebAppOrigin()` бере перший http(s)-запис
   * із `ALLOWED_ORIGINS` — у проді там уже стоїть домен Vercel. Задавай явно
   * лише тоді, коли перший allowed-origin не є основним доменом застосунку.
   * Значення автоматично потрапляє у `trustedOrigins` (див. `auth.ts`).
   */
  WEB_APP_URL: z.string().url().optional(),

  BETTER_AUTH_CROSS_SITE_COOKIES: z.string().optional(),

  BETTER_AUTH_TOKEN_ENC_KEY: z.string().optional(),

  BETTER_AUTH_TOKEN_ENC_KEYS: z.string().optional(),

  BETTER_AUTH_TOKEN_ENC_KEY_CURRENT_VERSION: z.string().optional(),
  MIN_PASSWORD_LENGTH: coerceInt.positive().default(10),

  MAX_PASSWORD_LENGTH: coerceInt.positive().max(256).default(256),

  REQUIRE_EMAIL_VERIFICATION: z
    .enum(["true", "false", "1", "0", ""])
    .default("false")
    .transform((v) => v === "true" || v === "1"),

  ALLOWED_ORIGINS: z.string().optional(),

  ALLOWED_ORIGIN_REGEX: z.string().optional(),

  RAILWAY_ENVIRONMENT: z.string().optional(),
  RAILWAY_SERVICE_NAME: z.string().optional(),
  RAILWAY_GIT_COMMIT_SHA: z.string().optional(),

  GIT_SHA: z.string().optional(),

  GIT_COMMIT: z.string().optional(),

  VERCEL_GIT_COMMIT_SHA: z.string().optional(),

  GITHUB_SHA: z.string().optional(),

  npm_package_version: z.string().optional(),

  ANTHROPIC_API_KEY: stringWithDefault(""),

  CHAT_MODEL_FIRST_TURN: stringWithDefault(defaultChatModel("firstTurn")),

  CHAT_MODEL_SYNTHESIS: stringWithDefault(defaultChatModel("synthesis")),

  // Транспорт чату: `true` (дефолт з 2026-08-05) — шлюз OpenRouter, `false` —
  // прямий Anthropic. Лише `/api/chat`. Виміри й умова відкату — в
  // `env/chatModels.ts`; без `OPENROUTER_API_KEY` прапорець не діє.
  //
  // Дефолт береться з `CHAT_VIA_OPENROUTER_DEFAULT`, а не з літерала: цю ж
  // константу читає ран-таймний `chatViaOpenRouter()`, і коли число стояло
  // тут окремо, воно розійшлося з ран-таймом (схема ON, ран-тайм OFF).
  CHAT_VIA_OPENROUTER: boolFromEnv(CHAT_VIA_OPENROUTER_DEFAULT),

  CHAT_STRICT_TOOLS: boolFromEnv(true),

  CHAT_TOOL_SEARCH: boolFromEnv(true),

  /**
   * Слати на турі синтезу лише ті tool-визначення, які згадані у
   * відтвореному `tool_calls_raw`, замість усього реєстру.
   *
   * Діє лише там, де tool search недоступний (шлюз OpenRouter) — на Anthropic
   * payload лишається старим, щоб не фрагментувати спільний prompt-cache.
   * Обґрунтування й вимір — у `chat/promptCache.ts::buildSynthesisToolsPayload`.
   * `false` — миттєвий відкат без редеплою.
   */
  CHAT_SYNTHESIS_TRIM_TOOLS: boolFromEnv(true),

  CHAT_CACHE_TTL_1H: boolFromEnv(true),

  CHAT_RESPONSE_CACHE_TTL_MS: intFromEnv(60_000),

  CHAT_RESPONSE_CACHE_MAX_ENTRIES: intFromEnv(500),

  AI_TIMEOUT_MS: intFromEnv(180_000),

  AI_MAX_RETRIES: intFromEnv(2),

  CHAT_MAX_TEXT_CONTINUATIONS: intFromEnv(3),

  AI_CIRCUIT_BREAKER_THRESHOLD: intFromEnv(5),

  AI_CIRCUIT_BREAKER_RESET_MS: intFromEnv(30_000),

  AI_QUOTA_CIRCUIT_THRESHOLD: intFromEnv(5),

  AI_QUOTA_CIRCUIT_WINDOW_MS: intFromEnv(60_000),

  AI_QUOTA_CIRCUIT_OPEN_MS: intFromEnv(300_000),

  GROQ_API_KEY: z.string().optional(),

  GROQ_TRANSCRIBE_MODEL: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z
      .enum(["whisper-large-v3-turbo", "whisper-large-v3"])
      .default("whisper-large-v3-turbo"),
  ),

  AI_QUOTA_DISABLED: z
    .enum(["true", "false", "1", "0", ""])
    .default("false")
    .transform((v) => v === "true" || v === "1"),

  AI_DAILY_USER_LIMIT: coerceInt.nonnegative().optional(),

  // `AI_DAILY_ANON_LIMIT` прибрано: анонімної гілки квоти більше немає —
  // `/api/chat` та решта AI-роутів стоять за `requireSession()` (A1,
  // `docs/90-work/audits/ai-abuse-2026-08-05.md`), тож дожити до квоти без
  // сесії неможливо. Схема не `.strict()`, тому змінна, що ще лишилась в
  // ops-конфігу, просто ігнорується.

  AI_QUOTA_TOOL_COST: coerceInt.nonnegative().optional(),

  AI_QUOTA_TOOL_LIMITS: z.string().optional(),

  AI_QUOTA_TOOL_DEFAULT_LIMIT: coerceInt.nonnegative().optional(),

  AI_QUOTA_FOUNDER_IDS: z.string().optional(),

  AI_TIERED_PRO_ENABLED: boolFromEnv(true),

  /**
   * Повернути Free/анона на premium-модель синтезу (стан до 2026-08-06).
   *
   * Default `false`: неоплачений трафік іде standard-тиром. Читає його
   * `aiQuota.ts::freeOnPremiumEnabled()` напряму з `process.env` (як решта
   * прапорців того модуля); тут — щоб змінна була видима в єдиному реєстрі env.
   */
  AI_FREE_ON_PREMIUM: boolFromEnv(false),

  AI_PRO_PREMIUM_DAILY_LIMIT: coerceInt.nonnegative().default(20),

  AI_PRO_STANDARD_DAILY_LIMIT: coerceInt.nonnegative().default(80),

  AI_PRO_STANDARD_CHAT_MODEL: stringWithDefault(defaultChatModel("standard")),

  AI_PRO_FLOOR_CHAT_MODEL: stringWithDefault(defaultChatModel("floor")),

  AI_PRO_STANDARD_COACH_MODEL: stringWithDefault(
    "google/gemini-2.5-flash-lite",
  ),

  AI_PRO_FLOOR_COACH_MODEL: stringWithDefault("google/gemini-2.5-flash-lite"),

  SSE_HEARTBEAT_MS: coerceInt.positive().default(15_000),

  VAPID_PUBLIC_KEY: z.string().optional(),

  VAPID_PRIVATE_KEY: z.string().optional(),

  VAPID_EMAIL: z.string().optional(),

  PUSH_SEND_TARGET_LIMIT: z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v === "") return 10;
      const n = Number.parseInt(v, 10);
      return Number.isFinite(n) && n > 0 ? n : 10;
    }),

  PUSH_SEND_TARGET_WINDOW_MS: z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v === "") return 60_000;
      const n = Number.parseInt(v, 10);
      return Number.isFinite(n) && n > 0 ? n : 60_000;
    }),

  PUSH_INTERNAL_ALLOWED_IPS: stringWithDefault(""),

  APNS_P8_KEY: z.string().optional(),
  APNS_KEY_ID: z.string().optional(),
  APNS_TEAM_ID: z.string().optional(),
  APNS_BUNDLE_ID: z.string().optional(),

  APNS_PRODUCTION: z.string().optional(),

  FCM_SERVICE_ACCOUNT_JSON: z.string().optional(),

  RESEND_API_KEY: stringWithDefault(""),

  RESEND_FROM: z.string().optional(),

  SENTRY_DSN: stringWithDefault(""),
  SENTRY_ENVIRONMENT: z.string().optional(),
  SENTRY_RELEASE: z.string().optional(),

  SENTRY_TRACES_SAMPLE_RATE: z.string().optional(),

  SENTRY_SAMPLE_PROFILE: z.enum(["minimal", "prod", "aggressive"]).optional(),

  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .optional(),

  LOG_PRETTY: z.string().optional(),

  METRICS_TOKEN: z.string().optional(),

  GRAFANA_CLOUD_LOKI_URL: optionalUrl(),

  GRAFANA_CLOUD_LOKI_USERNAME: z.string().optional(),

  GRAFANA_CLOUD_LOKI_TOKEN: z.string().optional(),

  POSTHOG_API_KEY: z.string().optional(),

  POSTHOG_PROJECT_ID: z.string().optional(),

  POSTHOG_HOST: z.string().optional(),

  POSTHOG_PROJECT_API_KEY: z.string().optional(),

  CSP_REPORT_ONLY: z.string().optional(),

  SECURITY_EVENTS_MUTED: boolFromEnv(false),

  MONO_WEBHOOK_ENABLED: z
    .enum(["true", "false", "1", "0", ""])
    .optional()
    .transform((v) => v === "true" || v === "1"),

  MONO_TOKEN_ENC_KEY: z.string().optional(),

  MONO_TOKEN_ENC_KEYS: z.string().optional(),

  MONO_TOKEN_ENC_KEY_CURRENT_VERSION: z.string().optional(),

  PUBLIC_API_BASE_URL: z.string().optional(),

  // ─── Silpo MCP integration (walking-skeleton experiment, 2026-08-17) ────
  // Spec: docs/90-work/planning/specs/silpo-mcp-integration.md § Експеримент.
  // Exact parity with the MONO_TOKEN_ENC_KEY* triplet above — same KeyRing
  // helper (`parseKeyRing`), same validation shape below. Default `false`:
  // merging this experiment must never turn the integration on by itself
  // (offer/ToS gate is still open — see spec § Відкриті гейти).
  SILPO_ENABLED: boolFromEnv(false),

  SILPO_MCP_URL: stringWithDefault("https://mcp.silpo.ua/mcp"),

  SILPO_OAUTH_CLIENT_ID: z.string().optional(),

  SILPO_TOKEN_ENC_KEY: z.string().optional(),

  SILPO_TOKEN_ENC_KEYS: z.string().optional(),

  SILPO_TOKEN_ENC_KEY_CURRENT_VERSION: z.string().optional(),

  STRIPE_SECRET_KEY: z
    .string()
    .regex(
      /^sk_(test|live)_[A-Za-z0-9]+$/,
      "STRIPE_SECRET_KEY must start with sk_test_ or sk_live_",
    )
    .optional(),

  STRIPE_WEBHOOK_SECRET: z
    .string()
    .regex(
      /^whsec_[A-Za-z0-9]+$/,
      "STRIPE_WEBHOOK_SECRET must start with whsec_",
    )
    .optional(),

  STRIPE_WEBHOOK_TOLERANCE_SECONDS: intFromEnv(300),

  STRIPE_PRICE_ID_PRO_MONTHLY: z
    .string()
    .regex(
      /^price_[A-Za-z0-9]+$/,
      "STRIPE_PRICE_ID_PRO_MONTHLY must match Stripe `price_*` format",
    )
    .optional(),

  STRIPE_ENABLED: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v === "") return false;
      const lower = v.trim().toLowerCase();
      if (lower === "true" || lower === "1") return true;
      if (lower === "false" || lower === "0") return false;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "STRIPE_ENABLED must be one of true/false/1/0 — refusing to guess on a billing flag",
      });
      return z.NEVER;
    }),

  // AI-LEGACY: expires 2026-10-31 — інфраструктура закритої бети; знімається
  // разом із docs/90-work/beta-launch/ (перелік — у README тієї теки).
  //
  // Видає Pro КОЖНОМУ автентизованому користувачу, не заводячи рядків у
  // `subscriptions`. Причина: під час закритої бети доступ і так лише за
  // інвайтом, а поіменна видача скриптом (`scripts/billing/grant-beta-pro.mjs`)
  // додає крок, який нічого не захищає — і про який легко забути, коли
  // тестер приєднався між прогонами.
  //
  // Парситься так само строго, як `STRIPE_ENABLED`: одруківка валить старт
  // замість того, щоб тихо лишити всіх на Free. Це не косметика — єдина
  // річ, яку прапорець реально відмикає, коштує грошей (див. нижче).
  //
  // AI-DANGER: PRO_LIMITS ставить `aiRequestsPerDay: null`, тобто БЕЗ
  // ліміту. З увімкненим прапорцем персональної стелі на AI не лишається
  // ні в кого, і єдиним гальмом стає ГЛОБАЛЬНИЙ денний бюджет
  // (`ANTHROPIC_BUDGET_HARD_DEGRADE_ALL`) — а він, спрацювавши, роняє на
  // дешеву модель ОДРАЗУ ВСІХ. Тобто один захоплений тестер може зіпсувати
  // досвід решті. Вмикати свідомо і лише на закриту групу.
  BILLING_ALL_PRO: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v === "") return false;
      const lower = v.trim().toLowerCase();
      if (lower === "true" || lower === "1") return true;
      if (lower === "false" || lower === "0") return false;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "BILLING_ALL_PRO must be one of true/false/1/0 — refusing to guess on a billing flag",
      });
      return z.NEVER;
    }),

  LIQPAY_ENABLED: boolFromEnv(false),

  LIQPAY_PUBLIC_KEY: z.string().optional(),
  LIQPAY_PRIVATE_KEY: z.string().optional(),

  PLATA_ENABLED: boolFromEnv(false),

  PLATA_TOKEN: z.string().optional(),

  PLATA_MODE: z.enum(["test", "live"]).default("test"),

  PRO_MONTHLY_UAH_KOPIYKAS: coerceInt.positive().default(19900),

  NUTRITION_BACKUP_KEY_SECRET: z.string().optional(),

  USDA_API_KEY: z.string().optional(),
  /**
   * UPCitemdb — третє (останнє) джерело каскаду штрихкодів.
   *
   * AI-DANGER: до 2026-07-25 endpoint був **захардкоджений** на
   * `prod/trial` — 100 запитів на добу **на весь продукт**, не на
   * користувача, і без жодного способу це змінити без релізу. Ризик не був
   * задокументований ніде (на відміну від USDA `DEMO_KEY`, який хоча б
   * згаданий в `env-vars.md`). Дефолт лишається тріальним — щоб нічого не
   * зламати, — але тепер його видно і його можна замінити змінною оточення.
   *
   * Дослідження джерел і рекомендована послідовність дій:
   * `docs/90-work/research/2026-07-25-barcode-sources-and-moderation.md`.
   */
  UPCITEMDB_BASE_URL: stringWithDefault("https://api.upcitemdb.com/prod/trial"),

  UPCITEMDB_API_KEY: z.string().optional(),

  SHUTDOWN_GRACE_MS: coerceInt.nonnegative().default(15_000),

  SHUTDOWN_HARD_TIMEOUT_MS: coerceInt.nonnegative().default(25_000),

  INTERNAL_API_KEY: stringWithDefault(""),

  WEBHOOK_HMAC_SECRET: stringWithDefault(""),

  WEBHOOK_HMAC_REQUIRED: boolFromEnv(false),

  WEBHOOK_HMAC_TS_TOLERANCE_SEC: intFromEnv(300),

  MONO_TOKEN: stringWithDefault(""),

  /**
   * Персональний токен ДПС (Електронний кабінет → «Токени публічної
   * частини») для `GET /ws/api_public/rro/chkAll` — чек-скан v1, QR/ДПС-шлях
   * (`docs/90-work/planning/specs/receipt-scan.md`). Один спільний токен
   * founder-а на всіх користувачів — дані чека публічні. Відсутність —
   * толерантний стан: `POST /api/finyk/receipts/lookup` віддає 503 з
   * людським повідомленням; vision-шлях (`/analyze`) від цього не залежить.
   */
  DPS_API_TOKEN: stringWithDefault(""),

  RATE_LIMIT_MAX: intFromEnv(100),

  RATE_LIMIT_WINDOW_SEC: intFromEnv(60),

  AUTH_RATE_LIMIT_MAX: intFromEnv(5),

  AUTH_RATE_LIMIT_WINDOW_SEC: intFromEnv(60),

  // Per-account credential bucket (F2). Keyed on the targeted email, not the
  // caller's IP, so renting more IPs does not buy more guesses. 10 per 15 min
  // is deliberately looser than the per-IP 5/60s: it must not fire during
  // ordinary "I mistyped my password four times" use, only against sustained
  // guessing. Window, not permanent lockout — a permanent one would let an
  // attacker lock any account out of its own login.
  AUTH_ACCOUNT_RATE_LIMIT_MAX: intFromEnv(10),

  AUTH_ACCOUNT_RATE_LIMIT_WINDOW_SEC: intFromEnv(900),

  RATE_LIMIT_IP_MAX: intFromEnv(200),

  SYNC_AUDIT_ADMIN_USER_IDS: stringWithDefault(""),

  MONO_ENRICHMENT_WORKER_ENABLED: boolFromEnv(false),

  MONO_ENRICHMENT_BATCH_SIZE: intFromEnv(5),

  MONO_ENRICHMENT_INTERVAL_MS: intFromEnv(5_000),

  MONO_ENRICHMENT_MAX_ATTEMPTS: intFromEnv(5),

  /**
   * Трекінг останнього візиту (`lib/lastSeen.ts`).
   *
   * Дефолт `true`: без нього прохід підштовхувань не має за чим відрізнити
   * відсутнього юзера від присутнього і мовчить. Прапорець існує як
   * рубильник (зайвий UPDATE на юзера щогодини) і щоб глушити фонову
   * телеметрію у тестах: маршрутні тести мокають пул чергою одноразових
   * відповідей, і будь-який позаплановий запит її зʼїдає.
   */
  LAST_SEEN_TRACKING_ENABLED: boolFromEnv(true),

  /**
   * Хвилинний прохід нагадувань (`lib/reminders/scheduler.ts`).
   *
   * Дефолт `true`: без нього нагадування про звички / їжу / тренування не
   * доходять при закритому застосунку взагалі — локальні таймери у
   * сервіс-воркері помирають разом із ним. Прапорець існує як аварійний
   * рубильник (раптовий потік дублів, деградація БД) і щоб глушити
   * планувальник у тестах та скриптах, які піднімають увесь app.
   */
  REMINDER_SWEEP_ENABLED: boolFromEnv(true),

  MCC_BATCH_HOURLY_ENABLED: boolFromEnv(false),

  MCC_BATCH_MAX_SIZE: intFromEnv(100),

  MCC_BATCH_INTERVAL_MS: intFromEnv(3_600_000),

  AI_MEMORY_ENABLED: boolFromEnv(false),

  VOYAGE_API_KEY: stringWithDefault(""),

  VOYAGE_EMBEDDING_MODEL: stringWithDefault("voyage-3.5-lite"),

  VOYAGE_EMBEDDING_DIM: intFromEnv(1024),

  AI_MEMORY_EMBEDDING_VERSION: stringWithDefault("1"),

  VOYAGE_TIMEOUT_MS: intFromEnv(15_000),

  VOYAGE_MAX_RETRIES: intFromEnv(2),

  VOYAGE_BATCH_SIZE: intFromEnv(32),

  AI_MEMORY_HNSW_EF_SEARCH: intFromEnv(40),

  AI_MEMORY_TOP_K: intFromEnv(8),

  AI_MEMORY_RAG_TOP_K: intFromEnv(4),

  AI_MEMORY_RAG_TIMEOUT_MS: intFromEnv(1_500),

  AI_MEMORY_DEDUP_THRESHOLD: floatFromEnv(0.97),

  AI_MEMORY_INGEST_CONCURRENCY: intFromEnv(4),

  AI_MEMORY_INGEST_MAX_CONTENT_LEN: intFromEnv(4_000),

  AI_MEMORY_INGEST_ATTEMPTS: intFromEnv(5),

  MONO_AI_MEMORY_INGEST_ENABLED: boolFromEnv(true),

  N8N_WEBHOOK_BASE_URL: stringWithDefault(""),

  SERGEANT_ALERT_BOT_TOKEN: stringWithDefault(""),

  SERGEANT_OPS_CHAT_ID: stringWithDefault(""),

  // Telegram waitlist/beta-invite fields — moved to `telegramEnv.ts` purely
  // to shave lines off this file (Hard Rule #18). Spread keeps the merged
  // shape (and therefore `Env`/`env.TELEGRAM_*`) byte-identical.
  ...telegramEnvShape,

  WEBHOOK_EVENTS_RETENTION_DAYS: intFromEnv(30),

  WEBHOOK_EVENTS_RETENTION_POLL_INTERVAL_MS: intFromEnv(60 * 60 * 1000),

  // In-process полер `gdpr_cleanup_queue` (modules/gdpr/cleanupPoller.ts).
  // Та сама філософія, що WEBHOOK_EVENTS_RETENTION_POLL_INTERVAL_MS:
  // default — година, 0 → off. Default УВІМКНЕНО: без полера черга не
  // дренується взагалі (Railway/n8n cron-и мертві — ADR-0074).
  GDPR_CLEANUP_POLL_INTERVAL_MS: intFromEnv(60 * 60 * 1000),

  LOG_ARCHIVE_ENABLED: boolFromEnv(false),

  LOG_RETENTION_DAYS: intFromEnv(30),

  LOG_ARCHIVE_POLL_INTERVAL_MS: intFromEnv(60 * 60 * 1000),

  LOG_ARCHIVE_BATCH_SIZE: intFromEnv(1000),

  GCS_LOG_ARCHIVE_BUCKET: stringWithDefault(""),

  HETZNER_MONTHLY_COST_USD: floatFromEnv(0),

  HETZNER_PLAN: stringWithDefault("cx23"),

  VERCEL_MONTHLY_COST_USD: floatFromEnv(0),

  VERCEL_PLAN: stringWithDefault("hobby"),

  POSTHOG_MONTHLY_COST_USD: floatFromEnv(0),

  POSTHOG_PLAN: stringWithDefault("free"),

  SENTRY_MONTHLY_COST_USD: floatFromEnv(0),

  SENTRY_PLAN: stringWithDefault("developer"),

  ANTHROPIC_MONTHLY_BUDGET_USD: floatFromEnv(0),

  ANTHROPIC_PLAN: stringWithDefault("usage"),

  VOYAGE_MONTHLY_BUDGET_USD: floatFromEnv(0),

  VOYAGE_PLAN: stringWithDefault("usage"),

  VOYAGE_DAILY_BUDGET_USD: floatFromEnv(0),

  ANTHROPIC_BUDGET_SOFT_USD: floatFromEnv(3),
  ANTHROPIC_BUDGET_HARD_USD: floatFromEnv(5),

  ANTHROPIC_BUDGET_CHECK_INTERVAL_MS: intFromEnv(300_000),

  ANTHROPIC_BUDGET_ALERT_ENABLED: boolFromEnv(true),

  ANTHROPIC_BUDGET_HARD_DEGRADE_ALL: boolFromEnv(false),

  VOYAGE_DAILY_BUDGET_USD_SOFT: floatFromEnv(1),

  VOYAGE_DAILY_BUDGET_USD_HARD: floatFromEnv(5),

  // Модель, яку коуч шле в Anthropic (прямий провайдер або fallback під
  // OpenRouter-ом). WHY окрема змінна: раніше тут стояв
  // `CHAT_MODEL_SYNTHESIS`, а він тепер може нести OpenRouter-only id —
  // Anthropic на такий відповість 404 і зніме коучу останню сітку безпеки.
  COACH_MODEL_ANTHROPIC: stringWithDefault("claude-sonnet-4-6"),

  NUTRITION_MODEL: stringWithDefault("claude-sonnet-4-6"),

  DIGEST_MODEL: stringWithDefault("claude-sonnet-4-6"),

  CLASSIFY_MODEL: stringWithDefault("claude-haiku-4-5-20251001"),

  MONO_ENRICHMENT_MODEL: stringWithDefault("claude-haiku-4-5-20251001"),
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
  return result.data;
}

export const env: Env = parseEnv();

export function isDeployedProduction(
  procEnv: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    procEnv["NODE_ENV"] === "production" ||
    procEnv["APP_ENV"] === "production" ||
    Boolean(procEnv["RAILWAY_ENVIRONMENT"]) ||
    Boolean(procEnv["RAILWAY_SERVICE_NAME"])
  );
}

export function assertStartupEnv(): void {
  const isProduction = isDeployedProduction();

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

  // Дефолтна конфігурація — gateway-only (усі LLM_*_PROVIDER=openrouter,
  // CHAT/VISION_VIA_OPENROUTER=true), тож відсутній Anthropic-ключ сам по
  // собі нічого не ламає — він лише вимикає FallbackProvider і прямий
  // транспорт. До 2026-08-29 warning тут погрожував 500-ками на chat/coach/
  // nutrition — неправда з часів до-OpenRouter, яка вела ops додавати ключ,
  // що ніде не використовується. Жорстке попередження лишається рівно для
  // конфігурації без ЖОДНОГО upstream-ключа.
  if (!env.ANTHROPIC_API_KEY && !env.OPENROUTER_API_KEY) {
    warnings.push(
      "Neither OPENROUTER_API_KEY nor ANTHROPIC_API_KEY is set — every AI endpoint will 503 (or serve StubProvider text).",
    );
  } else if (!env.ANTHROPIC_API_KEY) {
    warnings.push(
      "ANTHROPIC_API_KEY is not set — direct-Anthropic fallback is disabled; AI runs gateway-only via OpenRouter.",
    );
  }

  const openrouterProviders = [
    env.LLM_PROVIDER,
    env.LLM_READONLY_PROVIDER,
    env.LLM_DIGEST_PROVIDER,
    env.LLM_COACH_PROVIDER,
    env.LLM_NUTRITION_PROVIDER,
    env.LLM_MONO_PROVIDER,
    env.LLM_RECEIPT_PROVIDER,
  ];
  if (openrouterProviders.includes("openrouter") && !env.OPENROUTER_API_KEY) {
    warnings.push(
      "OPENROUTER_API_KEY is not set but LLM_*_PROVIDER=openrouter — those paths will degrade to StubProvider.",
    );
  }

  if (!env.DPS_API_TOKEN) {
    warnings.push(
      "DPS_API_TOKEN is not set — POST /api/finyk/receipts/lookup returns 503; /analyze (vision) is unaffected.",
    );
  }

  // Відкат тут повний (`chatViaOpenRouter()` вимагає ключа, тож і транспорт,
  // і model-id повертаються на Anthropic разом), тому чат лишається робочим.
  // Але прапорець виставили не просто так — мовчати про те, що він не подіяв,
  // означає лишити ops у переконанні, що міграція відбулась.
  if (env.CHAT_VIA_OPENROUTER && !env.OPENROUTER_API_KEY) {
    warnings.push(
      "CHAT_VIA_OPENROUTER is on (now the default) but OPENROUTER_API_KEY is not set — chat stays on direct Anthropic with Anthropic model ids. Set the key to activate the gateway, or CHAT_VIA_OPENROUTER=false to silence this.",
    );
  }

  if (env.VISION_VIA_OPENROUTER && !env.OPENROUTER_API_KEY) {
    warnings.push(
      "VISION_VIA_OPENROUTER is on (now the default) but OPENROUTER_API_KEY is not set — analyze-photo/refine-photo stay on direct Anthropic with NUTRITION_MODEL. Set the key to activate the gateway, or VISION_VIA_OPENROUTER=false to silence this.",
    );
  }

  if (!env.REDIS_URL) {
    warnings.push(
      "REDIS_URL is not set — rate limiting falls back to in-memory (per-process, not global).",
    );
  }

  if (isProduction && !env.METRICS_TOKEN) {
    throw new Error(
      "METRICS_TOKEN is required in production. Without it `GET /metrics` is publicly reachable, leaking route latency, AI cost, and circuit-breaker telemetry — and the OTel Prometheus exporter has a HIGH-severity crash advisory exploitable from the same surface. Generate one with `openssl rand -hex 32` and set it on the deployment.",
    );
  } else if (!env.METRICS_TOKEN) {
    warnings.push(
      "METRICS_TOKEN is not set — /metrics endpoint is unprotected.",
    );
  }

  if (isProduction && !env.BETTER_AUTH_URL) {
    throw new Error(
      "BETTER_AUTH_URL is required in production. Without it Better Auth falls back to `http://localhost:$PORT`, and `getAdvancedCookieOptions()` in auth.ts silently drops Secure / SameSite=None from the session cookie — sessions ship over plaintext and cross-site login stops working. Set it to the public HTTPS API URL.",
    );
  }

  if (isProduction) {
    const insecureUrls: string[] = [];
    if (env.BETTER_AUTH_URL && !env.BETTER_AUTH_URL.startsWith("https://")) {
      insecureUrls.push(`BETTER_AUTH_URL=${env.BETTER_AUTH_URL}`);
    }
    if (
      env.PUBLIC_API_BASE_URL &&
      !env.PUBLIC_API_BASE_URL.startsWith("https://")
    ) {
      insecureUrls.push(`PUBLIC_API_BASE_URL=${env.PUBLIC_API_BASE_URL}`);
    }
    // `WEB_APP_URL` їде у листи як `callbackURL` і додається у
    // `trustedOrigins`. http-значення у проді означало б, що ми самі
    // надсилаємо користувачам посилання на незахищений origin.
    if (env.WEB_APP_URL && !env.WEB_APP_URL.startsWith("https://")) {
      insecureUrls.push(`WEB_APP_URL=${env.WEB_APP_URL}`);
    }
    if (insecureUrls.length > 0) {
      throw new Error(
        `Production deploys must use HTTPS for public URLs. Insecure values detected: ${insecureUrls.join(
          ", ",
        )}. Better Auth requires \`https://\` to set Secure / SameSite=None on session cookies; an HTTP base URL silently ships cookies plaintext.`,
      );
    }
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

  if (isProduction && (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY)) {
    throw new Error(
      "VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are required in production. Without them /api/push/* silently returns 503. Generate a keypair with `npx web-push generate-vapid-keys`.",
    );
  } else if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    warnings.push(
      "VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set — web push is unavailable (/api/push/* → 503).",
    );
  }

  if (isProduction && env.STRIPE_ENABLED && !env.STRIPE_SECRET_KEY) {
    throw new Error(
      "STRIPE_ENABLED=true requires STRIPE_SECRET_KEY in production. With enforcement on and no Stripe wiring, gated routes return 402 while /api/billing/checkout returns 503 — users would be locked out with no way to upgrade. Set the key or flip STRIPE_ENABLED off.",
    );
  }

  if (isProduction && env.STRIPE_SECRET_KEY) {
    if (!env.STRIPE_WEBHOOK_SECRET) {
      throw new Error(
        "STRIPE_WEBHOOK_SECRET is required in production when STRIPE_SECRET_KEY is set. Without it the Stripe webhook endpoint cannot verify signatures and any caller can mutate billing state. Set the value from Stripe Dashboard → Developers → Webhooks → Signing secret.",
      );
    }
    if (!env.STRIPE_PRICE_ID_PRO_MONTHLY) {
      throw new Error(
        "STRIPE_PRICE_ID_PRO_MONTHLY is required in production when STRIPE_SECRET_KEY is set. Without it `/api/billing/checkout` throws BillingConfigurationError → 503 the first time a user clicks Upgrade. Copy the value from Stripe Dashboard → Products → Pro → Pricing (must match `price_*` format).",
      );
    }
    if (env.STRIPE_WEBHOOK_TOLERANCE_SECONDS <= 0) {
      throw new Error(
        "STRIPE_WEBHOOK_TOLERANCE_SECONDS must be > 0 in production when STRIPE_SECRET_KEY is set. A value of 0 (or negative) disables the timestamp replay-window check entirely, turning any captured signed webhook payload into an unbounded replay primitive against the billing endpoint. Default 300s; only set explicitly if your platform has unusual clock skew, and never set <= 0 in production. See https://stripe.com/docs/webhooks/signatures § 'Preventing replay attacks'.",
      );
    }
  }

  if (
    env.LIQPAY_ENABLED &&
    (!env.LIQPAY_PUBLIC_KEY || !env.LIQPAY_PRIVATE_KEY)
  ) {
    throw new Error(
      "LIQPAY_ENABLED=true requires LIQPAY_PUBLIC_KEY and LIQPAY_PRIVATE_KEY. Without them /api/billing/checkout throws BillingConfigurationError → 503 the first time a UA user picks LiqPay. Set both from the LiqPay merchant cabinet (ФОП), or flip LIQPAY_ENABLED off.",
    );
  }
  if (env.PLATA_ENABLED && !env.PLATA_TOKEN) {
    throw new Error(
      "PLATA_ENABLED=true requires PLATA_TOKEN (monopay merchant X-Token). Without it /api/billing/checkout and the Plata recurring scheduler fail. Set it from the monobank acquiring cabinet (ФОП), or flip PLATA_ENABLED off.",
    );
  }

  if (env.AI_MEMORY_ENABLED && !env.VOYAGE_API_KEY) {
    if (isProduction) {
      throw new Error(
        "VOYAGE_API_KEY is required in production when AI_MEMORY_ENABLED=true. Without it embedding-calls throw MissingVoyageApiKeyError on first request (HTTP 503 у /api/ai-memory/recall, BullMQ skip у ingest) — fail-loud at boot instead of silently shipping a half-wired feature. Set the key from voyageai.com → API keys, або вимкни `AI_MEMORY_ENABLED=false` доки key не буде доступний. Activation runbook: docs/01-product/launch/tech/ai-memory-activation.md.",
      );
    }
    warnings.push(
      "AI_MEMORY_ENABLED=true but VOYAGE_API_KEY is not set — embedding calls will throw MissingVoyageApiKeyError on the first request. Set VOYAGE_API_KEY or disable AI_MEMORY_ENABLED.",
    );
  }

  if (isProduction && env.AI_QUOTA_DISABLED) {
    throw new Error(
      "AI_QUOTA_DISABLED MUST NOT be set in production. It disables every per-user / per-IP AI cap and lets clients burn the entire Anthropic budget. If you really need this in production (e.g. emergency disable of the quota subsystem itself), unset NODE_ENV / APP_ENV / RAILWAY_ENVIRONMENT for that run, document the reason in the runbook, and remove the override immediately after.",
    );
  }

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
        `Hard Rule #20 violated: ${leftoverPats.join(", ")} present in production. Remove the legacy PAT(s) from the secret-store — the OpenClaw Gateway is decommissioned and no component authenticates with these tokens. See docs/00-start/playbooks/rotate-secrets.md.`,
      );
    }
  }

  if (env.MONO_WEBHOOK_ENABLED) {
    if (!env.MONO_TOKEN_ENC_KEYS && !env.MONO_TOKEN_ENC_KEY) {
      throw new Error(
        "MONO_TOKEN_ENC_KEY (or MONO_TOKEN_ENC_KEYS) is required when MONO_WEBHOOK_ENABLED=true. Must be 32-byte hex (64 chars).",
      );
    }
    try {
      parseKeyRing({
        keysCsv: env.MONO_TOKEN_ENC_KEYS,
        currentVersion: env.MONO_TOKEN_ENC_KEY_CURRENT_VERSION,
        legacyKey: env.MONO_TOKEN_ENC_KEY,
        envName: "MONO_TOKEN_ENC_KEY",
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`MONO_TOKEN_ENC_KEY[S] is invalid: ${detail}`);
    }
    if (!env.PUBLIC_API_BASE_URL) {
      throw new Error(
        "PUBLIC_API_BASE_URL is required when MONO_WEBHOOK_ENABLED=true.",
      );
    }
  }

  if (env.SILPO_ENABLED) {
    if (!env.SILPO_TOKEN_ENC_KEYS && !env.SILPO_TOKEN_ENC_KEY) {
      throw new Error(
        "SILPO_TOKEN_ENC_KEY (or SILPO_TOKEN_ENC_KEYS) is required when SILPO_ENABLED=true. Must be 32-byte hex (64 chars).",
      );
    }
    try {
      parseKeyRing({
        keysCsv: env.SILPO_TOKEN_ENC_KEYS,
        currentVersion: env.SILPO_TOKEN_ENC_KEY_CURRENT_VERSION,
        legacyKey: env.SILPO_TOKEN_ENC_KEY,
        envName: "SILPO_TOKEN_ENC_KEY",
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`SILPO_TOKEN_ENC_KEY[S] is invalid: ${detail}`);
    }
    if (!env.SILPO_OAUTH_CLIENT_ID) {
      throw new Error(
        "SILPO_OAUTH_CLIENT_ID is required when SILPO_ENABLED=true (one-time Dynamic Client Registration output — see docs/02-engineering/integrations/env-vars.md § Silpo MCP).",
      );
    }
    if (!env.PUBLIC_API_BASE_URL) {
      throw new Error(
        "PUBLIC_API_BASE_URL is required when SILPO_ENABLED=true (OAuth callback URL).",
      );
    }
  }

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

  if (isProduction && !env.SENTRY_DSN) {
    throw new Error(
      "SENTRY_DSN is required in production. Without it server exceptions are invisible — the Sentry → n8n → Telegram alert chain never fires while /health stays green. Copy the DSN from sentry.io → Project Settings → Client Keys (DSN). For a deliberate no-Sentry run, unset NODE_ENV/APP_ENV/RAILWAY_ENVIRONMENT for that run and document the reason in the runbook.",
    );
  } else if (!env.SENTRY_DSN) {
    warnings.push("SENTRY_DSN is not set — error tracking is disabled.");
  }

  if (warnings.length > 0) {
    for (const w of warnings) console.warn(`[env_warning] ${w}`);
  }
}
