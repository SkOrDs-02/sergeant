# ADR-0009: Hosting split — Railway (API + Postgres) + Vercel (web)

- **Status:** accepted
- **Date:** 2026-04-27
- **Reviewers:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`docs/integrations/railway-vercel.md`](../integrations/railway-vercel.md) — operator-орієнтована how-to для обох платформ.
  - [`docs/architecture/platforms.md`](../architecture/platforms.md) — стан web / native / capacitor-shell поверхонь.
  - [`vercel.json`](../../vercel.json) — `installCommand`, `outputDirectory`, headers, rewrites.
  - [`railway.toml`](../../railway.toml), [`Dockerfile.api`](../../Dockerfile.api) — build-контракт Railway.
  - [`apps/web/middleware.ts`](../../apps/web/middleware.ts) — Edge middleware, що проксіює `/api/*` → Railway.
  - [`apps/server/src/auth.ts`](../../apps/server/src/auth.ts) — CORS + Better Auth origin whitelist (`trustedOrigins`).

---

## 0. TL;DR

Sergeant розгорнутий на **двох різних хостингах**: фронтовий SPA + edge-middleware
на **Vercel**, API + Postgres + cron-ready бекенд на **Railway**. Це свідомий
split, а не історичне наслідування — ADR фіксує чому саме так, які trade-off-и
ми приймаємо і коли треба буде переглянути рішення.

| Платформа | Що хостить                                               | Чому саме вона                                                       |
| --------- | -------------------------------------------------------- | -------------------------------------------------------------------- |
| Vercel    | `apps/web` (Vite SPA) + Edge middleware (`/api/*` proxy) | CDN + preview-деплої для PR-ів; Edge proxy робить cookie same-origin |
| Railway   | `apps/server` (Express) + Postgres сервіс                | Persistent Node-процес, доступ до БД по internal network, cron-safe  |

Single-origin Edge proxy — **ключовий** елемент: без нього Safari ITP блокує
сесійні cookie між vercel.app і railway.app (third-party cookie).

---

## ADR-9.1 — Web: Vercel як CDN + Edge proxy до API

### Status

accepted.

### Context

`apps/web` — це Vite SPA, який збирається у `apps/server/dist/` (див.
[`vercel.json#outputDirectory`](../../vercel.json)). Реалістичні варіанти
хостингу фронту:

1. **Vercel** — CDN з immutable-cache для `/assets/*`, preview-деплої на кожен
   PR, Edge middleware як runtime для проксі. Vite-адаптер вбудований.
2. **Railway static** — можна роздавати статику тим самим Node-сервером, але
   без CDN-фронту; preview-лейн для PR-ів треба власноруч.
3. **Cloudflare Pages** — аналогічний CDN, але Workers runtime не сумісний з
   usual Node-стеком edge-middleware без додаткової адаптації.
4. **GitHub Pages / S3+CloudFront** — без edge-runtime → не можемо робити
   cookie-rewrite проксі.

Ключове обмеження, яке вирішує вибір: **Safari ITP** (Intelligent Tracking
Prevention). Better Auth сесійні cookie (`HttpOnly`, `Secure`, `SameSite=Lax`)
стають «third-party», коли фронт на `sergeant.vercel.app`, а API на
`*.up.railway.app`. Safari такі cookie мовчки не надсилає, логін ламається
для всіх iOS-юзерів (≈50% нашої аудиторії).

Edge middleware на Vercel ([`apps/web/middleware.ts`](../../apps/web/middleware.ts))
переписує `/api/*` запити на `BACKEND_URL` (Railway) зі same-origin point-of-view
браузера — cookie летять, Safari задоволений.

### Decision

**Vercel** хостить `apps/web` + edge-middleware. Фронт робить усі API-запити
до **відносних** шляхів (`/api/*`), Edge middleware проксіює їх на
`${BACKEND_URL}/api/*` (Railway). `VITE_API_BASE_URL` **не використовується** —
пустий або видалений.

### Consequences

**Позитивні:**

- Сесійні cookie same-origin — Safari ITP не блокує.
- Preview-деплой на кожен PR (з окремим immutable-subdomen) — QA може
  перевіряти UI зміни до мерджу.
- CDN caching для `/assets/*` (`public, max-age=31536000, immutable`) —
  повторні візити моментальні.
- SPA fallback через `rewrites` у `vercel.json` — глибокі лінки (`/finyk/tx/123`)
  не 404-ять.

**Негативні:**

- Додатковий hop: browser → Vercel Edge → Railway → Postgres. Latency зросла
  на ~30–80 ms p95 (Київ → Frankfurt edge → Frankfurt Railway). Прийнятно
  для persоnal-PWA, але на SLO (`< 1s p95`, див.
  [`docs/observability/SLO.md`](../observability/SLO.md#2-http-latency-slo-p95--1s-non-ai))
  це з'їдає частину бюджету.
- `BACKEND_URL` має бути встановлений у Vercel env (Production + Preview),
  інакше middleware падає з 502 на всі API-запити.
- Edge middleware обмежений Web API (без Node `fs`/`net`), тому проксі мусить
  бути stateless fetch-wrapper-ом. Це вже so — будь-яка server-side логіка
  мусить лишатись на Railway.

**Нейтральні:**

- `outputDirectory: "../server/dist"` — нестандартний шлях, задокументований у
  [`vercel.json`](../../vercel.json) і
  [`docs/architecture/platforms.md`](../architecture/platforms.md#1-web--pwa--appsweb). Vite бандл
  навмисно кладеться у server-пакет, щоб Capacitor-shell і Railway-бекенд
  читали з одного місця.

### Alternatives considered

- **Single origin на Railway (static + API).** Втрачаємо preview-деплої на PR,
  CDN для статики, і треба вручну конфігурувати cache headers. Виграємо 1 hop
  latency. На MVP preview-деплої важливіші; у Phase 2 переглянемо.
- **`VITE_API_BASE_URL=https://api.railway.app` напряму з браузера.** Ламає
  Safari ITP (див. Context). Відкинуто.
- **CORS `credentials: include` + `SameSite=None; Partitioned`.** Partitioned
  cookies (CHIPS) підтримуються Chrome, але Safari 17+ ITP їх все одно
  трактує як third-party. Не надійно.
- **Cloudflare Pages + Workers як proxy.** Робочий варіант, але Vercel вже
  інтегрований (preview-деплої, GitHub checks). Мігрувати без причини —
  витрата часу. Повертаємось до цього, якщо Vercel ціна стане проблемою.

### Exit criteria

Рішення переглядається, якщо:

- Vercel pricing на preview-деплоях стане > \$100/міс (поки — free tier).
- Edge middleware latency (p95 Frankfurt) перевищить 100ms стабільно.
- Safari/браузери релізнуть загальнодоступне рішення для cross-site cookies
  (CHIPS + Safari parity), що усуне потребу в проксі.

---

## ADR-9.2 — API: Railway як persistent Node + Postgres

### Status

accepted.

### Context

`apps/server` — Express 4 + `pg` + Better Auth. Вимоги до хостингу:

1. **Persistent process** — open HTTP connections (SSE для `/api/chat` stream),
   Better Auth session-cache у пам'яті, Prometheus `/metrics` endpoint
   (in-process counters).
2. **Long-running AI requests** — Anthropic streaming до 30s (див. SLO § 5 у
   [`docs/observability/SLO.md`](../observability/SLO.md#5-ai-anthropic-slo-970-)).
3. **Postgres** — міграції, pool `pg.Pool`, `NOTIFY`-тригери для plan-cache
   invalidation (ADR-0001 §1.3), `Testcontainers` для тестів.
4. **Background-friendly** — cron для Monobank-backfill (планується як
   `apps/server/src/modules/mono/<backfillCron>.ts` — placeholder/proposed
   шлях; на момент написання ADR реалізації ще немає, це описує майбутню
   потребу). Наразі крони — in-process scheduled tasks (див.
   `apps/server/src/lib/cron/`), не external cron-service.
5. **Dockerfile-based deploy** — [`Dockerfile.api`](../../Dockerfile.api) уже є,
   pre-deploy команда для міграцій передбачена.

Варіанти:

1. **Railway** — persistent container, `DATABASE_URL` reference до внутрішнього
   Postgres-сервісу без public exposure, pre-deploy command для `pnpm db:migrate`,
   логи/метрики у standard stdout (Pino JSON).
2. **Fly.io** — technically рівноцінний, але ми не маємо там інфраструктури,
   мігрувати без причини — витрата часу.
3. **Render / Heroku** — schemas / pricing менш вигідні для low-traffic
   persistent-сервіса.
4. **Serverless (Vercel Functions / AWS Lambda)** — cold-start + 30s AI-stream
   = timeout risk. `pg.Pool` mis-match з lambda-lifecycle (pool per request =
   open-connections storm на БД). Better Auth session store не переживає
   lambda-restart. Відкинуто для API.
5. **Self-hosted VPS (Hetzner/DO)** — дешево, але потрібен ops: systemd, TLS,
   log-shipping, бекап БД, автоматичний redeploy на push. Для single-maintainer
   — занадто багато operational overhead.

### Decision

**Railway** хостить `apps/server` (Dockerfile-based, `Dockerfile.api`) + Postgres
сервіс того ж проекту. `DATABASE_URL` — reference до внутрішнього Postgres,
трафік по internal network (без public exposure БД). Pre-deploy
`pnpm --filter @sergeant/server db:migrate` запускає міграції перед стартом
нового контейнера.

### Consequences

**Позитивні:**

- Persistent process — Better Auth in-memory session cache, SSE streams, Pino
  ALS-контекст (`requestId/userId/module`) працюють без workaround-ів.
- Internal Postgres networking — `DATABASE_URL` не виходить у публічний інтернет;
  Railway robot-юзер бачить з'єднання лише по `Postgres.DATABASE_URL` reference
  variable.
- Pre-deploy міграції — гарантує що нова версія стартує проти актуальної схеми
  (critical для two-phase DROP, див. ADR-0013).
- Prometheus `/metrics` endpoint — просто additional route, scrape працює без
  додаткової інфраструктури.

**Негативні:**

- Single-region (за замовчуванням Frankfurt для Railway EU). Київські юзери
  мають ~25–40 ms RTT; американські — 100–150 ms. Для global-scale потрібен
  би був multi-region deploy, якого у Railway немає out-of-the-box. Для
  персонального PWA — прийнятно.
- Railway scaling — vertical (більша машина), horizontal scaling потребує
  shared session-cache (не in-memory) і stateless-підходу до NOTIFY-тригерів.
  Відкрите питання на Phase 2+ (див. Open questions).
- Ціна — Railway Developer план \$5/міс + usage. На MVP-traffic — \~\$10–20/міс.
  Якщо traffic виросте на 100x, доведеться рахувати economics.

**Нейтральні:**

- `SERVER_MODE=railway` (або автодефолт) відрізняється від `SERVER_MODE=replit`
  (legacy) тим, що відсутній Replit-specific bootstrap. Runbook у
  [`docs/observability/runbook.md`](../observability/runbook.md) assume-ує
  Railway.

### Alternatives considered

- **Fly.io як технічно рівноцінний.** Так, міграція можлива за 1–2 дні, але не
  приносить функціональної різниці. Повертаємось, якщо Railway почне деградувати.
- **Managed Postgres окремо (Neon/Supabase/RDS).** Neon має branching, але наші
  міграції — plain SQL + сsequential numbering (ADR-0013), branching ми не
  використовуємо. Supabase — overkill, бо RLS ми не використовуємо
  (ADR-0012). RDS — ops overhead. Railway Postgres — simplest виконує job.
- **Serverless API.** Відкинуто через SSE/stream timeout ризики і
  `pg.Pool`-lifecycle mis-match (див. Context).

### Exit criteria

Рішення переглядається, якщо:

- Потрібен horizontal scaling (> 1 instance) — тоді ADR про shared session store
  (Redis? Postgres-backed?) і NOTIFY fan-out стратегію.
- Railway впровадить hard-limit на AI-stream duration < 30s (поки його немає).
- Multi-region latency стане бізнес-вимогою — перегляд хостингу цілком.

---

## ADR-9.3 — Edge proxy як cookie-boundary, не як security-boundary

### Status

accepted.

### Context

Edge middleware (`apps/web/middleware.ts`) бере `/api/*` запит від браузера і
надсилає його на `${BACKEND_URL}/api/*`. Питання: наскільки ми довіряємо цьому
прошарку як security-межі?

### Decision

Edge proxy — **boundary для cookie-same-origin трюку**, **не** security-межа.
Кожен запит, який доходить до Railway, проходить `requireAuth` middleware на
сервері — перевірка Better Auth session незалежна від того, як запит дійшов.
Edge не фільтрує payload, не додає auth, не робить rate-limit (rate-limit живе
в Express-middleware на Railway, див.
[`apps/server/src/http/rateLimit.ts`](../../apps/server/src/http/rateLimit.ts)).

### Consequences

**Позитивні:**

- Edge-код мінімальний → менше поверхні атаки на самому edge.
- Якщо edge-проксі компрометується або Vercel тимчасово падає, Railway API все
  одно можна викликати напряму (diagnostic / emergency bypass через
  `curl https://api.railway.app/api/v1/...` з bearer).
- Немає дубляжу auth-логіки edge vs server.

**Негативні:**

- Rate-limit треба робити на Railway, що означає зайвий хоп до DoS-фільтра. Для
  MVP-traffic прийнятно; на Phase 2+ можна розглянути Vercel Firewall / Cloudflare
  перед Vercel.
- `X-Forwarded-For` / `X-Real-IP` приходять від Vercel — сервер мусить довіряти
  `trust proxy` тільки до Vercel IP-діапазонів (інакше spoof).

### Exit criteria

Переглядаємо, якщо:

- Зафіксовано DoS-атаку, яка доходить до Railway і саатурує `pg.Pool` — тоді
  edge rate-limit стає обов'язковим.
- Vercel Firewall отримає програмовну політику, яку зручніше тримати на edge,
  ніж на сервері.

---

## ADR-9.4 — Environment variable boundary: `VITE_*` ніколи не містить секрети

### Status

accepted.

### Context

Vite вбудовує `VITE_*` змінні у клієнтський бандл під час build. Це означає,
що будь-який `VITE_*`, що заданий на Vercel, **потрапляє у JS, який завантажує
браузер**. Секрети (API keys, session secrets, DB URL) тут НЕ можна.

### Decision

- Vercel — тільки `VITE_*` (публічні) + `BACKEND_URL` (used лише в edge
  middleware, не в клієнтському бандлі).
- Railway — усі секрети (`BETTER_AUTH_SECRET`, `ANTHROPIC_API_KEY`,
  `DATABASE_URL`, `VAPID_PRIVATE_KEY`, `MONO_WEBHOOK_SECRET`, etc.).
- Enforcement: у `.env.example` коментар явно описує boundary
  ([`Скопіюйте цей файл...`](../../.env.example) preamble).

### Consequences

**Позитивні:**

- Неможливо випадково witlinkувати секрет у фронт (code-review + ESLint-plugin
  відловлюють `import.meta.env.SECRET_*` спроби).
- Rotation секретів — одна платформа (Railway), один набір env-змінних.

**Негативні:**

- Деякі публічні ідентифікатори (Sentry DSN, PostHog key) з функціонального
  боку безпечно виставити у фронт — треба пам'ятати, що вони мають бути
  `VITE_*` prefixed.

### Exit criteria

n/a (operational rule).

---

## Open questions

1. **Multi-instance на Railway.** Зараз один контейнер. Коли переходимо на ≥ 2,
   потрібен ADR про shared session store (Redis? Postgres `sessions` table
   з TTL?) і як скейлити NOTIFY-тригери (кожен інстанс підписаний окремо —
   broadcast працює, але треба дубляж-guard).
2. **Edge rate-limit.** Якщо буде DoS — додаємо Vercel Firewall / Cloudflare
   в фронт, пишемо окремий ADR про rate-limit topology (edge → server).
3. **Region expansion.** Поки один регіон (Frankfurt). US/APAC юзери отримують
   +100ms p50; чи робимо multi-region Postgres (read replica) — окремий ADR,
   якщо такі юзери з'являться.
4. **Preview environments для API.** Зараз preview-деплоями користується лише
   фронт; API на Railway — одна інстанція. Для складних міграцій було б зручно
   мати per-PR API+DB — відкрите питання economics.

---

## Implementation tracker

| Arte-fact                                                                       | Статус |
| ------------------------------------------------------------------------------- | ------ |
| [`vercel.json`](../../vercel.json) + `BACKEND_URL` env                          | live   |
| [`apps/web/middleware.ts`](../../apps/web/middleware.ts) proxy                  | live   |
| [`railway.toml`](../../railway.toml) + [`Dockerfile.api`](../../Dockerfile.api) | live   |
| Pre-deploy `db:migrate` на Railway                                              | live   |
| `SERVER_MODE=railway` autodetect                                                | live   |
| Multi-instance / shared session store                                           | TBD    |
