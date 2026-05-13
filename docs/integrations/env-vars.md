# Environment variables — повний reference

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Active

Цей документ — канонічний reference усіх змінних оточення Sergeant. Мінімальний `.env` (12 змінних, потрібних для `pnpm dev:web` + `pnpm dev:server`) лежить у [`/.env.example`](../../.env.example) у корені репо. Сюди винесено: повний опис, формати, default-и, наслідки незаповненості, перехресні посилання на код / ADR / hardening-ноти.

**Хто де (target hosting):**

- **Railway (бекенд `apps/server`)**: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `ANTHROPIC_API_KEY`, `USDA_FDC_API_KEY`, `VAPID_*`, `API_SECRET`, `ALLOWED_ORIGINS`, `PORT`, `AI_*`, server-side інтеграції.
- **Vercel (фронт `apps/web`)**: лише `VITE_*` (потрапляють у клієнтський бандл) + `BACKEND_URL` для Vercel Edge Middleware. **Ніколи** не використовуйте префікс `VITE_` для секретів (сесії, БД, приватні ключі API).
- **Mobile (Expo, `apps/mobile`)**: `EXPO_PUBLIC_*` — інлайнються у бандл на build-time.

Деталі топології і проксі: [`docs/integrations/railway-vercel.md`](./railway-vercel.md).

---

## 1. Required for `pnpm dev` (мінімальний набір)

| Змінна                  | Дефолт                                      | Що ламає, якщо не задано                                                                                                                              |
| ----------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`          | `postgresql://hub:hub@localhost:5432/hub`   | Сервер не стартує. Локально — `pnpm db:up` піднімає Postgres у Docker. Railway — Reference `${{ Postgres.DATABASE_URL }}`.                            |
| `BETTER_AUTH_URL`       | `http://localhost:3000`                     | Better Auth callback URL. Авто-підставляється, якщо є `REPLIT_DEV_DOMAIN`.                                                                            |
| `BETTER_AUTH_SECRET`    | `change_me_to_a_long_random_string_32chars` | Сесійні кукі неможливо підписати → 500 на /api/auth/\*. Мінімум 32 символи; згенерувати: `openssl rand -base64 32`.                                   |
| `ANTHROPIC_API_KEY`     | `sk-ant-api03-...`                          | HubChat / Fizruk / Nutrition AI повертають 503. Без ключа клієнт виходить раніше з помилкою quota.                                                    |
| `USDA_FDC_API_KEY`      | _empty_                                     | Fallback на DEMO_KEY (40 req/hr shared). У production обов'язковий — інакше штрихкод-сканер падає на 429. Безкоштовно: api.data.gov.                  |
| `VAPID_PUBLIC_KEY`      | _empty_                                     | Web Push не реєструється (фронт ловить помилку у `Notifications.tsx`). Згенерувати: `node -e "console.log(require('web-push').generateVAPIDKeys())"`. |
| `VAPID_PRIVATE_KEY`     | _empty_                                     | Те саме — потрібно у парі з `VAPID_PUBLIC_KEY`.                                                                                                       |
| `VAPID_EMAIL`           | `mailto:you@example.com`                    | Браузери вимагають `mailto:` URI у VAPID claims, інакше push не доставляється.                                                                        |
| `API_SECRET`            | `change_me_to_a_random_string`              | `/api/push/send` приймає довільні запити (security hole). Bearer-токен для server-to-server викликів push-ендпоінта.                                  |
| `ALLOWED_ORIGINS`       | `http://localhost:5173`                     | CORS-preflight ріже фронт (Vite dev server). Через кому: `https://sergeant.vercel.app,https://app.sergeant.app`.                                      |
| `PORT`                  | `3000`                                      | Express слухає 3000.                                                                                                                                  |
| `VITE_API_PROXY_TARGET` | `http://127.0.0.1:3000`                     | У dev режимі Vite проксує `/api/*` на бекенд. Має співпадати з `PORT`.                                                                                |

---

## 2. Better Auth — крос-доменна авторизація, OAuth, email

### `BETTER_AUTH_CROSS_SITE_COOKIES` _(optional)_

`0` = не форсити `SameSite=None` на сесійних кукі. Виставляйте, якщо фронт і API на одному домені через proxy (Vercel Edge Middleware → Railway), щоб не ламати Safari ITP / Chrome Tracking Protection. **Default**: forsено `None` (для крос-доменних сценаріїв).

### `BETTER_AUTH_TRUSTED_NATIVE_SCHEMES` _(optional)_

Список нативних deep-link схем, яким Better Auth довіряє для OAuth callback / cross-origin sign-in. Доповнює `localhost:*` у `getTrustedOrigins()`.

- **Без змінної у production**: тільки `sergeant://` (схема опублікованої RN-аппки, [`apps/mobile/app.config.ts`](../../apps/mobile/app.config.ts)).
- **Без змінної у dev**: ще додається `exp://` (Expo Go).
- **`exp://` НЕ bound до конкретної аппки** — будь-який Expo Go застосунок на пристрої може її claim-ити, тому у production воно заборонене (закриває [hardening-карту H5](../security/hardening/H5-trusted-origins-exp-scheme.md)).
- Якщо змінну задати — вона **повністю** замінює дефолти (немає merge-режиму). Приклад: `BETTER_AUTH_TRUSTED_NATIVE_SCHEMES=sergeant-staging://`.

### `RESEND_API_KEY`, `RESEND_FROM` _(optional, recommended for prod)_

Resend — транзакційні листи Better Auth (скидання пароля, верифікація email). Без ключа листи не відправляються; у production сервер логне попередження на старті.

- `RESEND_API_KEY=re_...`
- `RESEND_FROM=Sergeant <noreply@yourdomain.com>` — від кого; має бути з верифікованого домену в Resend (для тесту: `onboarding@resend.dev`).

### `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` _(optional)_

Google OAuth (Better Auth `socialProviders.google`). Активує кнопку «Увійти через Google» на AuthPage. Без обох змінних `socialProviders.google` не вмикається і клік повертає `Provider not configured` у `authError`.

- Створення клієнта: [console.cloud.google.com/auth/clients/create](https://console.cloud.google.com/auth/clients/create).
- Authorized redirect URIs мають містити `<BETTER_AUTH_URL>/api/auth/callback/google`.
- У production redirect URI має бути на домені фронта (Vercel Edge Middleware проксує `/api/*`): `https://sergeant.vercel.app/api/auth/callback/google`. Інакше state-cookie ставиться на API-домен як 3rd-party, Safari ITP / Chrome Tracking Protection її ріже → callback повертається з `error=state_mismatch`.
- Локально: `http://localhost:5000/api/auth/callback/google`.

### `REQUIRE_EMAIL_VERIFICATION` _(optional, default `false`)_

Коли `true` — sign-in блокується для неверифікованих email-ів. Default `false`, щоб не лочити legacy-акаунти, створені до того як `sendOnSignUp` був увімкнений. Ops фліпає `true` після soft-gate sweep-у legacy users.

Незалежно від цього flag-а:

- Кожен новий sign-up отримує верифікаційний лист (`auth.ts → sendOnSignUp`).
- `/api/mono/connect` гейтиться на `email_verified=true` через `requireVerifiedEmail()` middleware.

Дивись [`docs/security/hardening/H6-email-verification.md`](../security/hardening/H6-email-verification.md).

### `MIN_PASSWORD_LENGTH`, `MAX_PASSWORD_LENGTH` _(optional)_

- `MIN_PASSWORD_LENGTH=10` (default).
- `MAX_PASSWORD_LENGTH=256` — **hard-capped at 256** як DoS-захист (bound per-request scrypt work). Better Auth хешить паролі через **scrypt** (`@better-auth/utils`, `N=16384, r=16, p=1, dkLen=64`), у якого нема 72-byte input-ліміту, тому cap — операційний, не криптографічний. Setting >256 is rejected at startup (fail-fast). Дивись [ADR-0042](../adr/0042-password-hashing-strategy.md).

### `BETTER_AUTH_TOKEN_ENC_KEY` _(optional, recommended for prod)_

32-байтний hex-ключ для шифрування OAuth-токенів (access/refresh) у БД. Без ключа токени зберігаються **відкритим текстом** — дозволено тільки в dev/test, у production `assertStartupEnv()` логне env_warning. Згенерувати: `openssl rand -hex 32`.

- Нова multi-key ротація: `BETTER_AUTH_TOKEN_ENC_KEYS` (CSV `<ver>:<hex>`) + `BETTER_AUTH_TOKEN_ENC_KEY_CURRENT_VERSION` (активна версія). Legacy single-key варіант (`BETTER_AUTH_TOKEN_ENC_KEY`) залишається підтримуватися для зворотньої сумісності.
- У production рекомендується використовувати `BETTER_AUTH_TOKEN_ENC_KEYS` + `BETTER_AUTH_TOKEN_ENC_KEY_CURRENT_VERSION` для безшовної ротації ключів без downtime.

---

## 3. Anthropic AI — квоти, circuit breaker, tool-budget

### `AI_DAILY_USER_LIMIT`, `AI_DAILY_ANON_LIMIT` _(optional)_

Денні ліміти викликів AI (таблиця `ai_usage_daily` у Postgres).

- `AI_DAILY_USER_LIMIT=120` (default) — для залогінених користувачів.
- `AI_DAILY_ANON_LIMIT=40` (default) — без сесії, ключ — IP.

### `AI_QUOTA_DISABLED` _(optional, dev/test only)_

`AI_QUOTA_DISABLED=1` повністю вимикає квоту (no-op для `assertAiQuota`). **!!! ТІЛЬКИ для CI/test/dev.** У production `assertStartupEnv()` хард-блокує server-startup, якщо `AI_QUOTA_DISABLED=true` і `NODE_ENV=production` (або `RAILWAY_ENVIRONMENT`/`RAILWAY_SERVICE_NAME` виставлені). Без цього хард-блока випадковий copy-paste flag-а зі staging до prod дав би unlimited Anthropic budget burn. Дивись [`docs/security/ai-quota-kill-switch.md`](../security/ai-quota-kill-switch.md).

### `AI_QUOTA_TOOL_COST`, `AI_QUOTA_TOOL_DEFAULT_LIMIT`, `AI_QUOTA_TOOL_LIMITS` _(optional)_

Tool-use квота (окремий bucket у `ai_usage_daily`). Кожен виклик tool-а (наприклад `change_category`, `create_debt`) коштує `AI_QUOTA_TOOL_COST` одиниць у власному лічильнику `tool:<name>`.

- `AI_QUOTA_TOOL_COST=3` (default).
- `AI_QUOTA_TOOL_DEFAULT_LIMIT=60` (default).
- `AI_QUOTA_TOOL_LIMITS={"change_category":30,"create_debt":10,"create_receivable":10,"hide_transaction":30,"set_budget_limit":10,"set_monthly_plan":5,"mark_habit_done":30,"plan_workout":10,"create_habit":10}` — JSON з лімітами на кожен tool. Tool-и, не вказані у JSON, беруть `AI_QUOTA_TOOL_DEFAULT_LIMIT` (або unlimited якщо пусто).

### `LLM_PROVIDER` _(optional, default `anthropic`)_

**PR-23** — pluggable LLM-провайдер за [`apps/server/src/lib/llm/provider.ts`](../../apps/server/src/lib/llm/provider.ts). Дозволяє переключити сервер у fail-soft режим без зміни call-sites:

- `anthropic` (default) — `AnthropicProvider`, тонкий wrapper навколо `anthropicMessages()` із PR-12 logic (retry, timeout, prompt-caching, USD-ledger). Якщо `ANTHROPIC_API_KEY` пустий → factory деградує у `stub` (warn-log на startup-і).
- `stub` — `StubProvider`, no-op повертає `{"ok":true,"stub":true}` JSON. Призначення: e2e-тести без real-Anthropic-калькування, локальний dev без ключа, інцидент-recovery під час Anthropic-outage (read-only OpenClaw paths-ів).
- `openrouter` — зарезервовано під майбутню імплементацію (OpenRouter fallback). Поки що деградує у `stub`, щоб неочікуваний env не валив app.

PR-24 wire-up: OpenClaw `classify`. PR-25 wire-up: `weekly-digest` (через окремий `LLM_DIGEST_PROVIDER` toggle — див. нижче). Інші Anthropic-call-sites (chat, coach, nutrition) поки що працюють напряму через `anthropicMessages()`, як і раніше.

### `LLM_READONLY_PROVIDER` _(optional, default `anthropic`)_

**PR-24** — окремий provider для read-only OpenClaw paths (зараз: `before_dispatch` cheap-router classifier у [`apps/server/src/modules/openclaw/classify.ts`](../../apps/server/src/modules/openclaw/classify.ts); пізніше — інші read-only flows). Дозволяє перемкнути саме classifier у fallback-режим, **не зачіпаючи** основний `LLM_PROVIDER`, який обслуговує chat/coach/nutrition.

Значення такі самі, як у `LLM_PROVIDER`:

- `anthropic` (default) — повний шлях через `anthropicMessages()`.
- `stub` — повертає plausible default `{"class":"chat"}` без HTTP-callu. Idey для:
  - **Anthropic-outage:** classifier деградує у `chat`-default, чат-flow продовжує працювати окремо (Layer 2 повний agent).
  - **Local-dev без `ANTHROPIC_API_KEY`:** не падає на classify-розі.
  - **E2E-тести:** детермінований, безкоштовний шлях без витрат токенів.
- `openrouter` — зарезервовано, поки що деградує у stub (PR-26+).

**Спостережуваність (PR-24).** Кожен виклик `LLMProvider.generate()` через обгортку [`invokeLLM()`](../../apps/server/src/lib/llm/provider.ts) інкрементує Prom-counter `llm_provider_invocations_total{provider,endpoint,outcome}` (outcome: `ok|error|missing_api_key|rate_limited|timeout`) + кладе Sentry breadcrumb `category=llm.provider, level=info|warning` з provider/endpoint/outcome/model. Дашборд `ai-cost` (PR-13) використовує цей counter для розщеплення runtime-distribution між Anthropic vs stub-режимами.

### `LLM_DIGEST_PROVIDER` _(optional, default `anthropic`)_

**PR-25** — окремий provider для WF-08 weekly-digest endpoint-у (`POST /api/weekly-digest` у [`apps/server/src/modules/digest/weekly-digest.ts`](../../apps/server/src/modules/digest/weekly-digest.ts)). Дозволяє перемкнути саме digest у fallback-режим, **не зачіпаючи** ні головний `LLM_PROVIDER` (chat/coach/nutrition), ні `LLM_READONLY_PROVIDER` (OpenClaw classify).

Значення такі самі, як у `LLM_PROVIDER`:

- `anthropic` (default) — повний AI-аналіз через `AnthropicProvider`: модель `claude-sonnet-4-6`, `max_tokens=2500`, JSON-відповідь зі структурованими `summary`/`comment`/`recommendations` на кожну секцію (finyk/fizruk/nutrition/routine) + `overallRecommendations`.
- `stub` — повертає **template-based digest** із raw тижневих метрик (числа тижня прямо у `summary` секції) і **порожніми `recommendations`/`overallRecommendations`** — `StubProvider` обслуговує запит без HTTP-call-у до Anthropic. Use-cases:
  - **Anthropic-incident:** founder бачить тижневі числа без AI-коментарів. Краще, ніж 502 на digest-роуті.
  - **Local-dev без `ANTHROPIC_API_KEY`:** endpoint не падає, digest-UI може dev-тестуватися з числами.
  - **E2E-тести:** детермінований template-вихід без витрат токенів.
- `openrouter` — зарезервовано, поки що деградує у stub (PR-26+).

### `LLM_DIGEST_FALLBACK_ON_ERROR` _(optional, default `true`)_

**PR-25** — fail-soft toggle для weekly-digest. Коли `true` (default) і `LLM_DIGEST_PROVIDER=anthropic`, Anthropic-помилки (`5xx` / `rate_limited` / `timeout` / shape-mismatch / parse-error) ловляться у handler-і і digest повертається з template-репорту замість `502 ExternalServiceError`. Sentry breadcrumb `level=warning` + Prom-counter `llm_provider_invocations_total{outcome!=ok}` дають видимість для алертингу.

Коли `false` — strict-mode, як у PR-12: handler кидає `ANTHROPIC_ERROR` / `ANTHROPIC_PARSE_ERROR` / `ANTHROPIC_SHAPE_MISMATCH` і клієнт отримує 502. Корисно для e2e-тестів які явно перевіряють Anthropic-error semantics, або для проектів, де founder воліє бачити порожній звіт через failed UI замість шаблонних чисел.

Прийнятні значення: `1`/`true`/`yes` → on, інакше → off.

### `AI_TIMEOUT_MS`, `AI_MAX_RETRIES`, `AI_CIRCUIT_BREAKER_THRESHOLD`, `AI_CIRCUIT_BREAKER_RESET_MS` _(optional)_

Тюнінг Anthropic-клієнта.

- `AI_TIMEOUT_MS=180000` (default) — таймаут одного AI-запиту.
- `AI_MAX_RETRIES=2` (default) — повторні спроби при transient помилках.
- `AI_CIRCUIT_BREAKER_THRESHOLD=5` (default) — скільки помилок відкривають breaker.
- `AI_CIRCUIT_BREAKER_RESET_MS=30000` (default) — інтервал half-open тесту.

### `N8N_AGENT_DISPATCHER_WEBHOOK_URL` _(optional)_

Console → n8n dispatcher webhook для Telegram-controlled AI agents. Скопіюйте production webhook URL з workflow 20 після імпорту в n8n. Приклад: `https://n8n.your-domain.com/webhook/agent-dispatcher`.

### `ANTHROPIC_PROMPT_CACHE` _(optional, default off — `tools/openclaw` only)_

Опт-ін для prompt caching у `tools/openclaw` agent-loop (PR-39, ADR-0057). Truthy values: `1`, `true`, `yes` (case-insensitive). Коли увімкнено, `tools/openclaw/src/agents/run-agent-loop.ts` додає `cache_control: { type: "ephemeral" }` на (a) system prompt і (b) останній tool у `tools[]`. Cache TTL — 5 хвилин; net-cost-win починається з ≥2 викликів у вікні (tool-use loop або кілька slash-команд підряд). Affects лише `tools/openclaw` (Telegram-bot процес у окремому Railway service); не впливає на `apps/server` Anthropic-клієнт.

---

## 4. Groq Whisper — голосова транскрипція

### `GROQ_API_KEY` _(optional)_

Використовується ендпоінтом `/api/transcribe` ([VoiceMicButton](../../apps/web/src/shared/components/ui/VoiceMicButton.tsx) на фронті). Без ключа endpoint повертає 503, фронт автоматично відкочується на Web Speech API. Зареєструватися: [console.groq.com/keys](https://console.groq.com/keys).

### `GROQ_TRANSCRIBE_MODEL` _(optional)_

Whisper-модель Groq. **Default**: `whisper-large-v3-turbo` — найдешевший варіант з адекватною якістю українською. Альтернатива: `whisper-large-v3` (точніше, але дорожче).

### `TRANSCRIBE_USD_CAP_DAILY_MICROS` _(optional)_

[Hardening карта H9](../security/hardening/H9-transcribe-usd-cap.md) — per-user-per-day USD cap на `/api/transcribe`, у _micros_ (1 USD = 1_000_000 micros).

- **Default**: `1_000_000` = $1.00 / day / user.
- `0` ефективно вимикає cap (e2e/синтетичні тести).
- Vercel preview зазвичай $5–$10 на день для QA. Прод-default лишай $1.

---

## 5. Voyage AI + pgvector — AI memory (ADR-0028)

Серверна episodic-memory (відмінна від Memory Bank — [ADR-0021](../adr/0021-memory-bank.md), local-first). Storage — `ai_memories` table з pgvector `HALFVEC(1024)` + HNSW + hash-partitioning по `user_id`.

### `AI_MEMORY_ENABLED` _(optional, default `false`)_

Майстер-вимикач. False (default) — `remember()` / `recall()` no-op.

### `VOYAGE_API_KEY` _(optional, required if `AI_MEMORY_ENABLED=true`)_

Voyage AI embedding-провайдер. Без ключа клієнт кидає помилку при першому виклику; PR2 поставить memory-write як `failed` (без retry). Безкоштовний trial: [voyageai.com](https://www.voyageai.com/).

### `VOYAGE_EMBEDDING_MODEL`, `VOYAGE_EMBEDDING_DIM` _(optional)_

- `VOYAGE_EMBEDDING_MODEL=voyage-3.5-lite` (default; multilingual, 1024d).
- **УВАГА**: НЕ використовувати `voyage-3-lite` — він видає 512d, що несумісно з `HALFVEC(1024)` у міграції 025. 1024d-сумісні: `voyage-3.5-lite` (default), `voyage-3`, `voyage-3.5`, `voyage-3-large`.
- `VOYAGE_EMBEDDING_DIM=1024` (default).

### `AI_MEMORY_EMBEDDING_VERSION` _(optional)_

Internal semver embedding-схеми. Bumping triggers re-embed. Default: `1`.

### `VOYAGE_TIMEOUT_MS`, `VOYAGE_MAX_RETRIES`, `VOYAGE_BATCH_SIZE` _(optional)_

- `VOYAGE_TIMEOUT_MS=15000` (default; короткий, бо embedding fast).
- `VOYAGE_MAX_RETRIES=2` (default; на transient 5xx/timeout).
- `VOYAGE_BATCH_SIZE=32` (default; Voyage приймає до 128).

### `AI_MEMORY_HNSW_EF_SEARCH`, `AI_MEMORY_TOP_K` _(optional)_

- `AI_MEMORY_HNSW_EF_SEARCH=40` (default) — search-time ef. Більше → краще recall, повільніше.
- `AI_MEMORY_TOP_K=8` (default) — top-K для retrieval (PR3).

### `AI_MEMORY_INGEST_CONCURRENCY`, `AI_MEMORY_INGEST_ATTEMPTS`, `AI_MEMORY_INGEST_MAX_CONTENT_LEN` _(optional)_

Async-черга `ai-memory-ingest` (BullMQ; Redis-keys під префіксом `sergeant:`). Producer-и: mono webhook (finyk), weekly-digest (digest), `POST /api/ai-memory/ingest` (chat/fizruk/nutrition/routine/journal).

- `AI_MEMORY_INGEST_CONCURRENCY=4` (default) — Voyage rate-limit ~3 RPS на free tier; тримай ≤ 4 на одну реплику.
- `AI_MEMORY_INGEST_ATTEMPTS=5` (default) — спроб (BullMQ attempts) на retryable failure (5xx, 429, network). Backoff: 30s → 2min → 8min → 32min → 2h.
- `AI_MEMORY_INGEST_MAX_CONTENT_LEN=8000` (default) — жорсткий ліміт на content-розмір (чарів). Захист від випадкового embed-у гігабайт-payload-у з мобайл-клієнта.

### `MONO_AI_MEMORY_INGEST_ENABLED` _(optional, default `true`)_

Per-source kill-switch для finyk-ingest з Mono webhook-у (PR-19). Subordinate до master `AI_MEMORY_ENABLED` — якщо master `false`, цей прапор ігнорується (всі source-и no-op). Default `true` означає: після активації master-flag-у у Railway finyk-ingest стартує без додаткового toggle-у.

- `true` (default) — Mono webhook викликає `enqueueMemoryIngest(...)`, що формує BullMQ-job у `ai-memory-ingest`.
- `false` — Mono-webhook-source повністю обходиться; метрика `ai_memory_ingest_enqueued_total{mode="source_disabled", source="finyk"}` росте замість `mode="queued"`. Інші source-и (`digest`, `chat`, `fizruk`, `nutrition`, `routine`, `journal`) не зачіпаються.

Decision-point Day 30 — [`docs/observability/runbook.md § AI memory activation & Day-30 decision-point`](../observability/runbook.md#ai-memory-activation--day-30-decision-point).

### `MONO_AI_MEMORY_DIGEST_ENABLED` _(optional, default `false`, ⚠ prod required)_

Operator-toggle для n8n WF-30 [`30-ai-memory-daily-digest.json`](../../ops/n8n-workflows/30-ai-memory-daily-digest.json) (PR-21). Cron 09:05 Europe/Kyiv → SELECT агрегати з `ai_memories` за rolling 24h → Telegram #digest. Aggregated-only payload (без `user_id` у тексті); Voyage cost estimate включений у текст digest-а.

- Canonical-source — `apps/server/src/env/env.ts` (`boolFromEnv(false)`). Server-side digest-hook поки відсутній (PR-21 — n8n-only activation), але змінна парситься у server-env для парності з `MONO_AI_MEMORY_INGEST_ENABLED` і майбутніх metrics.
- **Activation step:** виставити `MONO_AI_MEMORY_DIGEST_ENABLED=true` на n8n Railway env (Settings → Environment Variables), потім flip workflow toggle у self-hosted n8n UI. Без цього кроку workflow JSON залишається `active=false` у git per hard-rule [`validate-n8n-workflows.mjs`](../../scripts/n8n/validate-n8n-workflows.mjs) («workflows in git must be inactive by default»).
- **Pre-requisites:** `AI_MEMORY_ENABLED=true` (master) + `MONO_AI_MEMORY_INGEST_ENABLED=true` (PR-19 ingest) — щоб `ai_memories` наповнювалась. Без цього digest буде слати graceful «За добу нічого не записано» kожен ранок.
- **Monitoring:** [`docs/observability/runbook.md § WF-30 AI memory daily digest (PR-21)`](../observability/runbook.md#wf-30-ai-memory-daily-digest-pr-21).

---

## 6. Postgres pool tuning

| Змінна                     | Default | Опис                                                                                                                              |
| -------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `PG_POOL_SIZE`             | `20`    | Максимум клієнтів у пулі pg. Sizing rule + tuning — [`docs/observability/pg-pool-sizing.md`](../observability/pg-pool-sizing.md). |
| `PG_CONNECTION_TIMEOUT_MS` | `5000`  | Таймаут очікування вільного клієнта з пулу.                                                                                       |
| `PG_SLOW_CONNECT_MS`       | `500`   | Поріг "повільного" `pool.connect()` — Pino warn + Sentry breadcrumb + `db_slow_pool_connects_total`.                              |
| `PG_IDLE_TIMEOUT_MS`       | `30000` | Таймаут idle-з'єднання перед закриттям.                                                                                           |
| `PG_STATEMENT_TIMEOUT_MS`  | `30000` | Максимальний час виконання одного SQL-запиту.                                                                                     |
| `DB_MAX_RETRIES`           | `3`     | Кількість повторних спроб при transient помилках БД (40001, deadlock).                                                            |
| `LOG_SLOW_QUERIES`         | `true`  | Логування повільних запитів у warn-лог + метрика `db_slow_queries_total`.                                                         |
| `SLOW_QUERY_THRESHOLD_MS`  | `100`   | Поріг для slow-query попереджень.                                                                                                 |

---

## 7. Observability — логування, metrics

### `LOG_LEVEL`, `LOG_PRETTY` _(optional)_

- `LOG_LEVEL` — рівень pino-логів. Default: `debug` у dev, `info` у production.
- `LOG_PRETTY=1` → human-readable вивід у dev (pino-pretty). **Не вмикати у prod.**

### `METRICS_TOKEN` _(optional)_

Bearer-токен для захисту `/metrics` (Prometheus scrape endpoint). Якщо не заданий — `/metrics` вимкнений. Для Grafana Agent / Railway scraper: `Authorization: Bearer <METRICS_TOKEN>`.

---

## 8. HTTP / runtime tuning

### `REQUEST_TIMEOUT_MS` _(optional)_

Глобальний timeout HTTP-запиту. **Default**: `120000` (2 хв). `0` = вимкнено.

### `COMPRESSION_ENABLED` _(optional)_

`true` (default) — увімкнути gzip/br стиснення відповідей.

### `SHUTDOWN_GRACE_MS`, `SHUTDOWN_HARD_TIMEOUT_MS` _(optional)_

Graceful shutdown.

- `SHUTDOWN_GRACE_MS=15000` (default) — скільки чекати in-flight запитів після SIGTERM, перш ніж force-close.
- `SHUTDOWN_HARD_TIMEOUT_MS=25000` (default) — hard-cut, після якого `process.exit(1)` — захист від зависання.

### `SSE_HEARTBEAT_MS` _(optional)_

Інтервал comment-frame у `/api/chat` SSE-стрімі. **Default**: `15000` ms — щоб проксі/браузер не різав з'єднання за idle timeout.

### `ALLOWED_ORIGIN_REGEX` _(optional)_

Одинокий regex (без прапорців), який повинен матчити допустимі origin-и. Використовується **на доповнення** до `ALLOWED_ORIGINS` (не замість). Приклад: `^https://pr-\d+\.preview\.example\.com$`.

### `SERVER_MODE` _(optional)_

`replit` | `api` | `full`. Авто-детектиться по `REPLIT_DEV_DOMAIN`, якщо не задано.

### `TRUST_PROXY` _(optional)_

Скільки upstream-проксі hops довіряти при парсингу `X-Forwarded-For`. **Дефолт для Railway = 1** (Railway edge proxy). Якщо додаєте Cloudflare — підніміть кількість hops або задайте explicit CIDR allowlist. Невалідне значення (наприклад `true`) падає при boot-у.

Формати:

```
TRUST_PROXY=1                     ← single hop (Railway default)
TRUST_PROXY=2                     ← Cloudflare + Railway
TRUST_PROXY=10.0.0.0/8,192.168.0.0/16
TRUST_PROXY=loopback,uniquelocal  ← express keyword shortcuts
TRUST_PROXY=false                 ← повністю вимкнути XFF-парсинг
```

`true` **НЕ** підтримується — це робить кожен `req.ip` client-controlled.

---

## 9. Redis tuning

| Змінна                         | Default | Опис                                            |
| ------------------------------ | ------- | ----------------------------------------------- |
| `REDIS_MAX_RETRIES`            | `10`    | Макс. спроб реконекту Redis.                    |
| `REDIS_RECONNECT_DELAY_MS`     | `100`   | Початкова затримка реконекту.                   |
| `REDIS_MAX_RECONNECT_DELAY_MS` | `3000`  | Макс. затримка реконекту з exponential backoff. |

---

## 10. CSP — Content Security Policy

### `CSP_REPORT_ONLY` _(optional)_

`CSP_REPORT_ONLY=1` → `Content-Security-Policy-Report-Only` (тільки логування). Поступове розгортання.

`CSP_DISABLE` видалено в M1 — дивись [`docs/security/hardening/M1-csp-disable-runtime-flag.md`](../security/hardening/M1-csp-disable-runtime-flag.md). Для швидкого вимкнення CSP без блокувань — `CSP_REPORT_ONLY=1`.

---

## 11. Vercel Edge Middleware (фронт-only)

### `BACKEND_URL` _(required for Vercel production)_

Base URL Railway-API, який [`apps/web/middleware.ts`](../../apps/web/middleware.ts) проксує під `/api/*` на домен фронта.

- Має бути виставлений у Vercel Production env, інакше middleware no-op і фронт б'є на пусто (відносні `/api/...` без бекенду).
- Без проксі OAuth ламається на 3rd-party cookie.
- Приклад: `BACKEND_URL=https://sergeant-production.up.railway.app`.

---

## 12. Vite / фронтенд (`VITE_*`)

> Усі `VITE_*` потрапляють у клієнтський бандл — не використовуйте для секретів.

### `VITE_API_BASE_URL` _(optional)_

Базова URL API. ⚠ У production на Vercel — **залишити порожнім** або не виставляти: фронт ходить через відносні `/api/...`, які Vercel Edge Middleware проксує на Railway. Це робить auth-cookie 1st-party до домену фронта і лагодить OAuth-флов (Better Auth state cookie + cross-site cookie restrictions).

Заповнюйте лише якщо фронт хоститься поза Vercel. Приклад: `https://your-api.railway.app`.

### `VITE_WEB_VITALS_ENDPOINT` _(optional)_

Збір Core Web Vitals (LCP/INP/CLS/FCP/TTFB) на бекенд у Prometheus (`POST /api/metrics/web-vitals`). **Default**: увімкнено. `0` вимикає збір без re-deploy.

---

## 13. Sentry (error tracking)

### Бекенд (Railway)

| Змінна                      | Default | Опис                                                          |
| --------------------------- | ------- | ------------------------------------------------------------- |
| `SENTRY_DSN`                | _empty_ | DSN із Sentry-проєкту (тип: Node.js). Без DSN — Sentry no-op. |
| `SENTRY_ENVIRONMENT`        | _empty_ | `production` / `staging` / `dev`.                             |
| `SENTRY_RELEASE`            | _empty_ | Версія релізу (commit SHA).                                   |
| `SENTRY_TRACES_SAMPLE_RATE` | `0.1`   | Sample rate для performance traces.                           |

### Фронтенд (Vercel)

| Змінна                           | Default | Опис                                                                     |
| -------------------------------- | ------- | ------------------------------------------------------------------------ |
| `VITE_SENTRY_DSN`                | _empty_ | DSN із Sentry-проєкту (тип: React). Префікс `VITE_` → клієнтський бандл. |
| `VITE_SENTRY_ENVIRONMENT`        | _empty_ | Як і backend.                                                            |
| `VITE_SENTRY_RELEASE`            | _empty_ | Версія релізу.                                                           |
| `VITE_SENTRY_TRACES_SAMPLE_RATE` | `0.1`   | Sample rate для performance traces.                                      |
| `VITE_SENTRY_REPLAY_SAMPLE_RATE` | `0`     | Session Replay sample rate. `0` = вимкнено; `0.1` = 10% сесій.           |

---

## 13.5. OpenTelemetry traces (server-side OTLP)

Активує distributed tracing через NodeSDK + OTLP/HTTP exporter (`apps/server/src/obs/tracing.ts`). Якщо `OTEL_EXPORTER_OTLP_ENDPOINT` (або traces-specific override) не заданий — SDK НЕ реєструється; `aiSpan`/`dbSpan` працюють як no-op-обгортки над NoopTracer-ом без overhead. Деталі: [ADR-0035](../adr/0035-distributed-tracing-opentelemetry.md), runbook [`observability/runbook.md` § «OpenTelemetry traces»](../observability/runbook.md).

| Змінна                               | Default        | Опис                                                                                                                                                                             |
| ------------------------------------ | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT`        | _empty_        | OTLP/HTTP collector base-endpoint. Якщо порожній — OTel SDK no-op.                                                                                                               |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | _empty_        | Override лише для traces (наприклад `https://api.honeycomb.io:443/v1/traces`, `https://otlp-gateway-prod-eu-north-0.grafana.net/otlp/v1/traces`, `http://tempo:4318/v1/traces`). |
| `OTEL_EXPORTER_OTLP_HEADERS`         | _empty_        | Comma-separated `k=v` headers (e.g. `Authorization=Basic ...`). SECRET-значення (API keys) — через secrets manager, **НЕ** комітити у `.env.example`.                            |
| `OTEL_EXPORTER_OTLP_TRACES_HEADERS`  | _empty_        | Як `OTEL_EXPORTER_OTLP_HEADERS`, але лише для traces (override). Honeycomb: `x-honeycomb-team=hcaik_***,x-honeycomb-dataset=sergeant-prod`.                                      |
| `OTEL_SERVICE_NAME`                  | `sergeant-api` | `service.name` resource attribute.                                                                                                                                               |
| `OTEL_SERVICE_VERSION`               | _empty_        | Override service.version. Default fallback: `SENTRY_RELEASE` → `RAILWAY_GIT_COMMIT_SHA` → `VERCEL_GIT_COMMIT_SHA` → `GITHUB_SHA`.                                                |
| `OTEL_TRACES_SAMPLE_RATE`            | `0.1`          | Default sample-rate для GET-non-AI-маршрутів. Range `0.0..1.0` (clamped). Health-routes завжди 0%, AI/write — 100% (див. `apps/server/src/obs/sampler.ts`).                      |

> **Web-бандл:** `apps/web` НЕ підтягує OTel SDK (~50KB gzip). Замість цього `packages/api-client/src/httpClient.ts` генерує W3C `traceparent` header вручну (через `crypto.getRandomValues`). Сервер підхоплює traceId і будує від нього span-tree. RUM-spans на клієнті — окрема P1 ініціатива (0006-rum-spans-web).

> **Sentry співіснування:** Sentry web tracing і server OTel НЕ конфліктують у prod-і. Коли OTLP-endpoint увімкнено, можна виставити `SENTRY_TRACES_SAMPLE_RATE=0`, щоб не платити двічі за server-side latency tracking. Sentry error tracking залишається як було.

---

## 14. PostHog product analytics

### Web (`VITE_*`)

- `VITE_POSTHOG_KEY=phc_…` — Project API Key з PostHog. Public — можна тримати у клієнтському бандлі. Без ключа PostHog SDK не підтягується, трекінг залишається тільки у локальному ring-buffer (`hub_analytics_log_v1`).
- `VITE_POSTHOG_HOST=https://eu.i.posthog.com` (default — EU Cloud, GDPR-friendly). Для US-регіону: `https://us.i.posthog.com`.

### Server-side (GDPR cleanup + n8n WF-16/60/63)

[ADR-0016 §6.3](../adr/0016-user-deletion-and-pii-handling.md). Цей же триплет змінних читають n8n PostHog-workflow-и (`ops/n8n-workflows/16-posthog-daily-metrics.json`, `60-growth-funnel-snapshot.json`, `63-growth-acquisition-snapshot.json`) — вони мають бути виставлені на n8n Railway (Settings → Environment Variables), а не лише на API-service.

- `POSTHOG_API_KEY=phx_…` — Personal API key із project-scope доступом (scopes: `project:read`, `query:read` для n8n HogQL, `persons:write` для GDPR cleanup). Використовується в `deletePostHogPerson(userId)` із cleanup-черги при hard-delete акаунта та у WF-16 HogQL daily query. Без ключа cleanup-job + n8n повертають `outcome: "skipped"` / graceful Telegram alert — рекомендовано виставити у production.
- `POSTHOG_PROJECT_ID=12345` — числовий ID проєкту (Settings → Project → ID).
- `POSTHOG_HOST=https://eu.i.posthog.com` (default — EU Cloud, парний до `VITE_POSTHOG_HOST`).

### Server-side (event ingestion)

- `POSTHOG_PROJECT_API_KEY=phc_…` — Project ingestion key (той самий public ключ, що й `VITE_POSTHOG_KEY`). Використовується в `capturePostHogEvent()` для server-side трекінгу подій з webhook-ів / background workers (PR-09 — `subscription_started` зі Stripe). Без ключа capture-helper повертає `outcome: "skipped"` і caller (webhook handler) успішно завершує процесинг — аналітика best-effort.

---

## 15. Replit (опційно, авто-визначається)

Sergeant може хоститись на Replit dev-середовищі. Sentinel-змінні авто-детектяться:

- `REPLIT_DEV_DOMAIN=your-repl.repl.co`
- `REPLIT_DOMAINS=your-repl.repl.co`

Якщо виставлені — `BETTER_AUTH_URL` і `SERVER_MODE` авто-резолвляться.

---

## 16. Monobank webhook integration

### `MONO_WEBHOOK_ENABLED` _(optional, default `false`)_

Feature flag: увімкнути webhook-based інтеграцію. Коли `true` — `MONO_TOKEN_ENC_KEY` і `PUBLIC_API_BASE_URL` обов'язкові.

### `MONO_TOKEN_ENC_KEY` _(required if webhook enabled)_

32-byte hex ключ для AES-256-GCM шифрування Monobank токенів. Згенерувати: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

### `PUBLIC_API_BASE_URL` _(required if webhook enabled)_

Публічна базова URL API (Railway) для реєстрації webhook у Monobank.

- Webhook URL: `${PUBLIC_API_BASE_URL}/api/mono/webhook/${secret}`.
- Production: `https://sergeant-production.up.railway.app`.
- Dev: `https://xxx.trycloudflare.com` (через `cloudflared tunnel --url http://localhost:3000`).

---

## 17. Monobank / PrivatBank legacy polling proxy

> ⚠ Токени банків **НЕ** читаються з env — вони надходять від клієнта через заголовок `X-Token` і форвардяться до upstream. Сервер їх зберігає лише у memory кешу (хешовано); тривалість і таймаути керуються нижче.

### `BANK_FETCH_TIMEOUT_MS` _(optional)_

Per-attempt таймаут запиту до Monobank/PrivatBank API. **Default**: `15000` (15 с).

- Upstream'и зазвичай відповідають за <2 с, але `/personal/statement` із великим періодом може тягнутись довше.
- Floor 1 с, ceiling 60 с; значення поза смугою ігнорується (fallback на 15_000).
- Скоротити в продакшні корисно якщо upstream нестабільний — швидший fail-over на breaker.

### `BANK_CACHE_TTL_MS` _(optional)_

TTL in-memory дедуп-кешу для ідентичних GET-ів (key = upstream + path + query + sha256(token)). **Default**: `60000` (60 с).

- Балансує свіжість балансу та 429-rate limit на `/personal/statement` (1 req/60s/token).
- `0` вимикає кеш (кожен запит йде в upstream).
- Floor 0, ceiling `600_000` ms (10 хв).

---

## 18. Nutrition backups

### `NUTRITION_BACKUP_KEY_SECRET` _(required for prod)_

Серверний секрет для HMAC-SHA256, що формує ім'я файлу nutrition-backup на диску. Без нього `/api/nutrition/backup-{upload,download}` відповідає 503.

У production обов'язковий — інакше шлях до бекапу можна перебрати (історично було 32-bit FNV-1a, IDOR). Згенерувати: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

---

## 19. USDA FDC альтернативний ключ

### `USDA_API_KEY` _(optional, alias)_

Деякі внутрішні скрипти використовують `USDA_API_KEY` замість `USDA_FDC_API_KEY`. Значення можна задати однакове — не плутати з `FDC_API_KEY`, який є помилковим історичним ім'ям.

---

## 20. OpenClaw v0 — Telegram-only co-founder bot (ADR-0031)

> Server-side env. Token + Telegram allowlist живуть у `tools/openclaw` (бот працює там). Сервер відповідає за tool execution + audit log.

### `OPENCLAW_FOUNDER_USER_ID` _(required for OpenClaw)_

Better Auth `user.id` founder-а (для join-у з `ai_memories.user_id`, який партиціонується по `hash(user_id)`). Окремий від `OPENCLAW_FOUNDER_TG_USER_ID` (Telegram numeric `user_id`, у `tools/openclaw/.env`).

### `OPENCLAW_DAILY_USD_BUDGET` _(optional)_

Денний USD cap на Anthropic-token-и через OpenClaw. **Default**: `5` ($5).

Pre-call check: `SUM(cost_usd) WHERE invoked_at >= today_kyiv`. Reach → fail-closed.

### `OPENCLAW_MAX_ITERATIONS` _(optional)_

Hard cap на Plan→Act→Reflect ітерації у одному виклику. **Default**: `8`.

### `OPENCLAW_DAILY_MORNING_AT`, `OPENCLAW_WEEKLY_REVIEW_AT`, `OPENCLAW_MONTHLY_OKR_AT` _(optional)_

Schedule env (TZ-aware human-readable strings; Phase 2 wires actual cron):

- `OPENCLAW_DAILY_MORNING_AT=08:30 Europe/Kyiv`
- `OPENCLAW_WEEKLY_REVIEW_AT=Fri 18:00 Europe/Kyiv`
- `OPENCLAW_MONTHLY_OKR_AT=1 09:00 Europe/Kyiv`

### `OPENCLAW_BROADCAST_MODE` _(optional)_

Broadcast policy: `dm` | `digest` (default — weekly+monthly у 📊 Дайджести) | `all`.

### `OPENCLAW_USE_GITHUB_APP`, `OPENCLAW_GITHUB_APP_ID`, `OPENCLAW_GITHUB_APP_PRIVATE_KEY`, `OPENCLAW_GITHUB_APP_INSTALLATION_ID` _(optional, Phase 1 of stack-pulse-2026-05 PR-06)_

Авт-флоу через GitHub App — короткоживучі (1 година) installation-токени замість довгоживучих PAT-ів. **Phase 1** (тривкий tip-of-tree станом на 2026-05): App-flow доступний паралельно з PAT-flow, гейт `OPENCLAW_USE_GITHUB_APP=false` (default). **Phase 2** (через тиждень soak): default flips → `true`, PAT-flow видаляється разом з `Git_PAT`-fallback-ом, реєструється hard-rule «no PAT in production».

- `OPENCLAW_USE_GITHUB_APP` — `true|false`, default `false`. Без `true` решта `OPENCLAW_GITHUB_APP_*` — no-op.
- `OPENCLAW_GITHUB_APP_ID` — числовий ID App-у (з `Settings → Developer settings → GitHub Apps → Sergeant OpenClaw`).
- `OPENCLAW_GITHUB_APP_PRIVATE_KEY` — PEM-приватник App-у. Деякі secret-store-и (Vercel, Railway, 1Password CLI) розплющують `\n` → `github-auth.ts` репарює `\\n → \n` перед `crypto.createSign('RSA-SHA256')`.
- `OPENCLAW_GITHUB_APP_INSTALLATION_ID` — installation id (один App може стояти на кількох орг-ах; pin-имо явно щоб blast radius був однозначний).

Реалізація: [`apps/server/src/modules/openclaw/github-auth.ts`](../../apps/server/src/modules/openclaw/github-auth.ts) — мінт + кеш installation-токена з 5-хв headroom-ом до експайру. Rotation runbook — [`docs/playbooks/rotate-openclaw-credentials.md`](../playbooks/rotate-openclaw-credentials.md).

Failure-mode (Phase 1): якщо App-flow ввімкнений АЛЕ exchange падає (HTTP 401, expired key, etc.) — повертаємо `null`, **не** silently fallback-имо на PAT (це маскувало б config-drift); caller бачить `not_configured` у audit-логу і операторне сповіщення спрацьовує негайно.

### `OPENCLAW_GITHUB_PAT`, `OPENCLAW_GITHUB_REPO`, `OPENCLAW_GITHUB_BASE_BRANCH` _(optional, legacy — phasing out)_

GitHub PAT з `contents:write` для opening PR-ів з decision markdown у `docs/decisions/`. **Phasing out** (Phase 2 of stack-pulse-2026-05 PR-06).

- Якщо не задано — `record_decision` пише у Postgres з `git_pr_url=NULL` (manual retry у Phase 2).
- Fallback на `Git_PAT` якщо існує (Devin-VM-only convention; production codepath не повинен залежати від цього).
- `OPENCLAW_GITHUB_REPO=Skords-01/Sergeant`, `OPENCLAW_GITHUB_BASE_BRANCH=main`.
- **Не** додавати нові call-сайти на `env.OPENCLAW_GITHUB_PAT` — використовуй `getOpenclawGithubAuth()` з [`apps/server/src/modules/openclaw/github-auth.ts`](../../apps/server/src/modules/openclaw/github-auth.ts).

---

## 21. Mobile (Expo, `apps/mobile`)

### `EXPO_PUBLIC_SENTRY_DSN` _(optional)_

Публічний Sentry DSN для RN-клієнта. Інлайниться у бандл на build-time (префікс `EXPO_PUBLIC_` → доступно в `process.env`). Optional — без нього `initObservability()` виконує no-op і жодних подій у Sentry не відправляється. Дивись [`apps/mobile/src/lib/observability.ts`](../../apps/mobile/src/lib/observability.ts).

### `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_POSTHOG_HOST` _(optional)_

PostHog для mobile FTUX activation funnel (парний до web — той самий project key, що й `VITE_POSTHOG_KEY`).

- Без ключа `initPostHog()` виконує повний no-op: жодних HTTP-викликів, MMKV-записів чи буферизованої черги.
- `source: "mobile-expo"` super-property розділяє mobile-Expo трафік від web / Capacitor-shell у funnel-ах.
- `EXPO_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com` (default — EU Cloud).

Дивись [`apps/mobile/src/lib/observability/posthog.ts`](../../apps/mobile/src/lib/observability/posthog.ts) і [`docs/launch/product-os/ftux-sprint-plan.md`](../launch/product-os/ftux-sprint-plan.md) §S0.3.

---

## 22. Cost monitoring (PR-33)

> Server-side env, читається у `apps/server/src/env.ts` і пушиться у Prometheus Gauge `infra_monthly_cost_usd` через `applyInfraMonthlyCosts()` під час bootstrap-у. Споживач — Grafana-дашборд [`docs/observability/dashboards/cost-monitoring.json`](../observability/dashboards/cost-monitoring.json) (PR-33).

Усі змінні **opt-in** (default `0`); невиставлене / нульове значення → серія НЕ зʼявляється у `/metrics` (gauge не пре-allocate-имо нулі, щоб PromQL-фільтр був тривіальний). `*_PLAN`-лейбли служать виключно для group-by у Grafana — конкретний рядок задається free-form, але conventionally використовуй стандартні tier-нейми (`free|hobby|pro|team|business|enterprise|usage|budget`).

### Static infra subscriptions

- `RAILWAY_MONTHLY_COST_USD=20` (default `0`) — Railway hosting subscription monthly USD. `RAILWAY_PLAN=hobby` (default) — `hobby|pro|team|enterprise`.
- `VERCEL_MONTHLY_COST_USD=20` (default `0`) — Vercel hosting subscription monthly USD. `VERCEL_PLAN=hobby` (default) — `hobby|pro|enterprise`.
- `POSTHOG_MONTHLY_COST_USD=0` (default `0`) — PostHog analytics monthly USD. `POSTHOG_PLAN=free` (default) — `free|pay-as-you-go|scale|enterprise`.
- `SENTRY_MONTHLY_COST_USD=26` (default `0`) — Sentry error monitoring monthly USD. `SENTRY_PLAN=developer` (default) — `developer|team|business|enterprise`.

### AI budget envelopes

Не реальний bill, а **target** для алертів. У Grafana накладається лінією поверх `ai_cost_estimate_usd_total`-run-rate-у; коли фактичний run-rate перетинає лінію — операторне сповіщення.

- `ANTHROPIC_MONTHLY_BUDGET_USD=200` (default `0`) — місячний AI-бюджет на Anthropic. `ANTHROPIC_PLAN=usage` (default) — `usage` для pay-as-you-go.
- `VOYAGE_MONTHLY_BUDGET_USD=20` (default `0`) — місячний AI-бюджет на Voyage embeddings. `VOYAGE_PLAN=usage` (default).
- `VOYAGE_DAILY_BUDGET_USD=0.75` (default `0`) — **soft** daily-burn threshold для Voyage (USD/day). Виставляє `voyage_daily_budget_usd` gauge → Prometheus rule [`voyage-cost.yml`](../../ops/prometheus/rules/voyage-cost.yml) пейджить `VoyageDailyBudgetSoftBreach` (warn @ 80%, after 10m) і `VoyageDailyBudgetHardBreach` (page @ 100%, after 5m). Default `0` → правило не активне (guard `voyage_daily_budget_usd > 0`). Рекомендоване значення: `VOYAGE_MONTHLY_BUDGET_USD / 30` як baseline; підняти при відомому daily-spike (наприклад, batch-reindex ingestion-у).
- `ANTHROPIC_BUDGET_SOFT_USD=3` / `ANTHROPIC_BUDGET_HARD_USD=5` (default `3` / `5`) — **PR-14** Anthropic daily soft/hard budget alert порогів (USD). Background-tick (`ANTHROPIC_BUDGET_CHECK_INTERVAL_MS`, default `300000` = 5 хв) рахує `ai_cost_estimate_usd_total{provider="anthropic"}` delta за поточну UTC-добу. Soft → `Sentry.captureMessage(level="warning")` → n8n WF-22 alert-shipping → Telegram (опційно). Hard → `level="error"` + взводимо in-process throttle-flag `isAnthropicBudgetHardExceeded()` для не-критичних шляхів (batch worker-и можуть самозатягнути горло; AI-роути НЕ зупиняються — це alert, не circuit-breaker). Idempotency: один alert на `(YYYY-MM-DD, threshold)` через Redis `SET NX EX 36h` з in-memory fallback. `0` для будь-якого порога вимикає alert (kill-switch).
- `ANTHROPIC_BUDGET_ALERT_ENABLED=true` (default `true`) — kill-switch для PR-14 budget loop. `false` → scheduler не стартує (counter все одно інкрементується, але алертів не буде).
- `VOYAGE_DAILY_BUDGET_USD_SOFT=1` (default `1`) — **in-process** soft daily cap (USD/day) для Voyage embeddings. На відміну від `VOYAGE_DAILY_BUDGET_USD` (Prometheus side), enforced серверним кодом ([`apps/server/src/modules/ai-memory/voyageBudget.ts`](../../apps/server/src/modules/ai-memory/voyageBudget.ts), PR-38): при перевищенні — idempotent Sentry warning (1× на (day, threshold), `error_signature='voyage-daily-budget-soft'`) і **skip non-critical embeddings** (background ingestion — digest, mono webhook, RAG-prep). User-facing recall лишається critical (alert fire-иться, але виклик пропускається — UX > soft cap). Set `0` щоб вимкнути soft-gate (тоді тільки Prometheus-side `VoyageDailyBudgetSoftBreach`). Лічильник resets at UTC midnight.
- `VOYAGE_DAILY_BUDGET_USD_HARD=5` (default `5`) — **in-process** hard daily cap (USD/day) для Voyage embeddings. Analogous до `ANTHROPIC_BUDGET_HARD_USD` (same `$1/$5` ratio). При перевищенні — Sentry `level="error"` (`error_signature='voyage-daily-budget-hard'`) + взводимо in-process `isVoyageBudgetHardExceeded()` прапор, який `service.ts::remember` читає для **auto-pause ingestion** (skip embed-call ще до `embedBatch`). User-facing recall не паузиться — лише фонова інжестія. Перевірка робиться post-record у [`recordVoyageUsage`](../../apps/server/src/modules/ai-memory/embeddings.ts) (`runVoyageBudgetTick`); idempotent: `≤1` alert на (day, tier) через `alertedTiers`-set. Flag скидається на UTC day-rollover. Set `0` щоб вимкнути hard-gate (тоді лишається тільки soft).
- `VOYAGE_MONTHLY_BUDGET_USD=20` (default `0`) — також використовується **monthly projection alert**: коли `today-spend × днів-у-місяці ≥ monthly-cap`, шлемо Sentry warning (`error_signature='voyage-monthly-budget-projection'`) один раз на (`YYYY-MM`, monthly). Це m-rate-of-burn детектор: якщо одного дня згоріло достатньо, щоб закінчити monthly envelope до кінця місяця — операторне сповіщення раніше ніж hard daily-cap. Set `0` щоб вимкнути projection alert (target/dashboard сторона `VOYAGE_PLAN=usage` лишається активною). Поточна логіка живе у [`voyageBudget.ts::maybeFireMonthlyProjectionAlert`](../../apps/server/src/modules/ai-memory/voyageBudget.ts).

Дивись [`docs/observability/metrics.md` §16 Cost monitoring](../observability/metrics.md#16-cost-monitoring-pr-33--pr-38) для PromQL-запитів і [`docs/observability/dashboards/cost-monitoring.json`](../observability/dashboards/cost-monitoring.json) для імпорту в Grafana.

---

## 23. Telegram alert shipper (O4 / B.1)

> Server-side env, читається у `apps/server/src/routes/internal/alerts.ts` лениво всередині `/api/internal/alerts/send` endpoint-у. Якщо не задано — endpoint повертає `503 telegram_not_configured`; решта `/alerts/*` ендпоінтів продовжує працювати (n8n flow OK).

### `SERGEANT_ALERT_BOT_TOKEN` _(optional, required for `/alerts/send`)_

Telegram bot-token для alert-бота. Той самий env-var, що його використовує OpenClaw broadcast (`apps/server/src/modules/openclaw/write-tools.ts`); єдиний bot обслуговує і операторні алерти, і broadcast-и. Format: `123456:ABC-DEF…`.

Без цього env-var-а:

- `/alerts/post` / `/alerts/ack` / `/alerts/escalate` / `/alerts/pending` — продовжують працювати (DB-only).
- `/alerts/send` (O4 / B.1 dedup-шипер) — повертає `503 { error: "telegram_not_configured" }`.

Виставляти на Railway prod-environment-і. У dev НЕ обовʼязково — n8n WF-и шлють alert-и напряму через `sendMessage`-HTTP-node-и, dedup pipeline увімкнеться лише після того, як n8n WF мігрують на `/api/internal/alerts/send`.

### Dedup behaviour (server-side)

Endpoint `/api/internal/alerts/send` приймає `dedupSignature` (stable hash, e.g. `wf-15:railway-deploy-failed:api`). Якщо в межах вікна (`windowMs`, default `600_000` ms = 10 хв) уже існує row з тим самим `(topic, dedup_signature)` — викликається `editMessageText` із counter-prefix `🔁 N× за 10 хв:\n<original>`. Інакше — фрешевий `sendMessage` + INSERT into `tg_alert_acks`. Fail-open: будь-яка DB/Telegram-помилка логуються `level=warn` через Pino + сесія fallback-ить на `sendMessage` (нове повідомлення замість edit-у). Edit-failure (e.g. `message_not_found`) → response action=`sent_after_edit_failure`.

Реалізація: [`apps/server/src/modules/alerts/telegramShipper.ts`](../../apps/server/src/modules/alerts/telegramShipper.ts) + міграція [`060_tg_alert_acks_dedup_signature.sql`](../../apps/server/src/migrations/060_tg_alert_acks_dedup_signature.sql). Roadmap-контекст: [`docs/launch/tech/telegram-improvements-roadmap.md` §4.2](../launch/tech/telegram-improvements-roadmap.md), [`docs/planning/sprint-roadmap-q2q3-2026.md` §1.2 B.1](../planning/sprint-roadmap-q2q3-2026.md).

---

## 24. `/api/internal/*` HMAC webhook signing (PR-48 follow-up)

> Defence-in-depth поверх `INTERNAL_API_KEY`. Trio змінних читається в [`apps/server/src/http/verifyWebhookSignature.ts`](../../apps/server/src/http/verifyWebhookSignature.ts) і застосовується middleware-ом на `/api/internal/*` ПІСЛЯ bearer-token guard. Same trio має бути виставлений на n8n Railway env — workflow Function-node читає `$env.WEBHOOK_HMAC_SECRET` (template: [`ops/n8n-workflows/_lib/sign-internal-request.js`](../../ops/n8n-workflows/_lib/sign-internal-request.js)).

### `WEBHOOK_HMAC_SECRET` _(optional, recommended for prod)_

32+ байтовий shared-secret. Згенерувати: `openssl rand -hex 32`. Пустий рядок (default) — middleware no-op, тільки bearer guard. Виставлений → перевіряється `X-Signature` = `hex(HMAC-SHA256(secret, "<X-Timestamp>.<rawBody>"))`. Той самий байтовий вміст має бути виставлений на n8n Railway, інакше Function-node-template падає з `WEBHOOK_HMAC_SECRET is not set`. Ротація — атомарно в обох місцях через [`rotate-secrets.md`](../playbooks/rotate-secrets.md) (replay-window 5min робить тимчасовий розфаз нешкідливим).

### `WEBHOOK_HMAC_REQUIRED` _(optional, default `false`)_

Двофазний rollout. `false` (grace, default) — server warn-логує `webhook_hmac_mismatch` + Sentry breadcrumb на mismatch, але пропускає запит. Дозволяє per-workflow міграцію без cross-cutting cut-over-у. `true` — flip після того, як усі 25 `INTERNAL_API_KEY`-using workflows у `manifest.json` показують `hmacSigned: true`; з цього моменту missing/invalid signature → `401 WEBHOOK_HMAC_INVALID`.

### `WEBHOOK_HMAC_TS_TOLERANCE_SEC` _(optional, default `300`)_

Replay-вікно для `X-Timestamp` (UNIX seconds, симетрично навколо `now`). 5min default матчить Stripe/GitHub/Slack webhook signatures. Збільшувати лише за наявністю clock-skew у конкретного n8n воркера (видно у Grafana `reason="timestamp_out_of_window"`); зменшувати — лише з твердим NTP-sync на n8n Railway side.

Full rollout playbook: [`docs/security/api-internal-hmac.md`](../security/api-internal-hmac.md). Audit context: [`docs/security/better-auth-audit-2026-05.md#f5b`](../security/better-auth-audit-2026-05.md).

---

## See also

- [`/.env.example`](../../.env.example) — мінімальний `.env` для `pnpm dev`.
- [`docs/integrations/railway-vercel.md`](./railway-vercel.md) — топологія хостингу + проксі.
- [`docs/agents/onboarding.md`](../agents/onboarding.md) — quickstart для AI-агентів.
- [ADR-0028](../adr/0028-pgvector-ai-memory.md) — pgvector + Voyage AI memory.
- [ADR-0031](../adr/0031-openclaw-v0-telegram-cofounder.md) — OpenClaw v0.
- [ADR-0042](../adr/0042-password-hashing-strategy.md) — password hashing (scrypt у Better Auth, без 72-byte ліміту).
- [`docs/security/hardening/`](../security/hardening/) — карти H5, H6, H9, M1.
