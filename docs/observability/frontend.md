# Frontend-observability — web і mobile

> **Last validated:** 2026-04-28 by @Skords-01. **Next review:** 2026-07-27.
> **Status:** Active

Observability-стек для web- і mobile-клієнтів Sergeant: error tracking,
session replay, Core Web Vitals, product analytics, ErrorBoundary-конвенції.
Серверний observability — [`SLO.md`](./SLO.md), [`runbook.md`](./runbook.md),
[`dashboards.md`](./dashboards.md); тут лише точки з'єднання (§7).

---

## 1. Огляд стеку

| Шар                             | Інструмент                                                 | Env-flag                                      | Статус                                                    |
| ------------------------------- | ---------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------- |
| Web — Sentry (errors + tracing) | `@sentry/react` (lazy `import()`)                          | `VITE_SENTRY_DSN`                             | **Prod-ready**                                            |
| Web — Replay                    | `@sentry/react` `replayIntegration`                        | `VITE_SENTRY_REPLAY_SAMPLE_RATE`              | **Prod-ready** (default session=0, error=1.0)             |
| Web — Core Web Vitals           | `web-vitals` → `POST /api/metrics/web-vitals` → Prometheus | `VITE_WEB_VITALS_ENDPOINT` (`=0` kill-switch) | **Prod-ready** (baseline, SLO не зафіксовано — SLO.md §8) |
| Mobile — Sentry                 | `@sentry/react-native` (planned)                           | `EXPO_PUBLIC_SENTRY_DSN` (зарезервовано)      | **TODO (Phase 10)**                                       |
| Capacitor shell                 | Web Sentry з tag `is_capacitor=true`                       | `VITE_SENTRY_*`                               | **Prod-ready**                                            |
| Server — Sentry                 | `@sentry/node`                                             | `SENTRY_DSN`                                  | **Prod-ready** (детально — інші docs)                     |

---

## 2. Web — Sentry

**Файл:** `apps/web/src/core/observability/sentry.ts`

### Lazy dynamic-import

`initSentry()` завантажує `@sentry/react` через `await import("@sentry/react")`.
~30–40 KB gzip не потрапляє у головний бандл — error tracking не блокує
hydration (правило 2.3 — «Defer Non-Critical Third-Party Libraries»).

### DSN-gating

Без `VITE_SENTRY_DSN` — early return, жодного чанку не підтягується. Локальна
розробка і staging без DSN працюють із zero overhead.

### Env-flags

| Змінна                           | Опис                       | Дефолт                  |
| -------------------------------- | -------------------------- | ----------------------- |
| `VITE_SENTRY_DSN`                | DSN. Без неї — no-op       | —                       |
| `VITE_SENTRY_ENVIRONMENT`        | `environment` tag          | `MODE` / `"production"` |
| `VITE_SENTRY_RELEASE`            | Release tag (source maps)  | —                       |
| `VITE_SENTRY_TRACES_SAMPLE_RATE` | `tracesSampleRate`         | `0.1`                   |
| `VITE_SENTRY_REPLAY_SAMPLE_RATE` | `replaysSessionSampleRate` | `0`                     |

### `beforeSend` — стрип cookies

Видаляє `event.request.cookies` перед відправкою — session-токени не
потрапляють у Sentry (`sentry.ts:53–55`).

### Tags: `platform` і `is_capacitor`

- **`platform`** — `getPlatform()` з `@sergeant/shared` (`"web"` / `"ios"` / `"android"`).
- **`is_capacitor`** — `"true"` / `"false"`.

Тріаж: native-specific баги (safe-area, keyboard resize, cookie/storage)
фільтруються через `is_capacitor:true` (`sentry.ts:61–62`).

### Replay

```
maskAllText: false    — текст видно (для дебагу UX)
blockAllMedia: true   — медіа заблоковані (PII/розмір)
```

- `replaysSessionSampleRate = 0` — повноцінний запис вимкнений.
- `replaysOnErrorSampleRate = 1.0` — **кожна** помилка з replay.
- Prod-дебаг: тимчасово підняти `VITE_SENTRY_REPLAY_SAMPLE_RATE` (наприклад, `0.1`).

---

## 3. Web — Core Web Vitals

**Файл:** `apps/web/src/core/observability/webVitals.ts`

### Метрики

П'ять CWV через `web-vitals` npm (~1 KB gzip):

| Метрика | Тип         | Prometheus histogram                           |
| ------- | ----------- | ---------------------------------------------- |
| LCP     | timing (ms) | `web_vitals_duration_ms{metric="LCP",rating}`  |
| INP     | timing (ms) | `web_vitals_duration_ms{metric="INP",rating}`  |
| FCP     | timing (ms) | `web_vitals_duration_ms{metric="FCP",rating}`  |
| TTFB    | timing (ms) | `web_vitals_duration_ms{metric="TTFB",rating}` |
| CLS     | unitless    | `web_vitals_cls{rating}`                       |

`rating`: `"good"` / `"needs-improvement"` / `"poor"` (пороги Google CWV).

### Батч + `navigator.sendBeacon`

Метрики буферизуються (до `MAX_BATCH = 10`) і відправляються:

1. `navigator.sendBeacon` на `visibilitychange=hidden` та `pagehide` —
   єдиний надійний спосіб на unload (`fetch keepalive` ненадійний на mobile
   Safari; синхронний XHR блокує закриття).
2. **Fallback**: `fetch(..., { keepalive: true })`.
3. Мікро-дебаунс: `Promise.resolve().then(flush)`.

### Endpoint

`POST /api/metrics/web-vitals` (`apps/server/src/routes/web-vitals.ts`):

- **Rate limit**: 60 req/min/IP.
- **Відповідь**: завжди `204 No Content` (sendBeacon ігнорує body).
- **Валідація**: Zod (`apps/server/src/modules/observability/web-vitals.ts:36–49`):
  timing — `0..120_000 ms`, CLS — `0..10`.
- **Payload**: `{ metrics: [{ name, value, rating }] }` (1..10 items).
- Невалідні записи логуються з `sample=1%`.

### Kill-switch

`VITE_WEB_VITALS_ENDPOINT=0` — no-op: `web-vitals` chunk не підтягується.

### Серверні метрики

- `web_vitals_duration_ms{metric, rating}` — бакети
  `[50, 100, 250, 500, 800, 1200, 1800, 2500, 4000, 6000, 10000]`
  (`apps/server/src/obs/metrics.ts:286–291`).
- `web_vitals_cls{rating}` — бакети `[0.01, 0.05, 0.1, 0.15, 0.25, 0.5, 1]`
  (`apps/server/src/obs/metrics.ts:296–301`).

PromQL: `sum by (rating) (rate(web_vitals_duration_ms_count{metric="LCP"}[5m]))`
→ readout good / needs-improvement / poor. Детальніше — [SLO.md §8](./SLO.md).

### Capacitor exclusion

`initWebVitals()` робить ранній return для `isCapacitor()` — CWV у Capacitor
WebView є шумом (інший cold-start, JS engine), що отруює RUM-дашборди
(`webVitals.ts:136–138`).

### Бот-spam

Endpoint анонімний. Rate-limiter мітігує масовий spam, але не розподілений
трафік. Якщо стане проблемою — [SLO.md §8](./SLO.md).

---

## 4. Web — `analytics.ts`

**Файл:** `apps/web/src/core/observability/analytics.ts`

Lightweight product analytics sink: **console logger + localStorage ring-buffer**
(`hub_analytics_log_v1`, max 200 подій). `trackEvent(name, payload?)` —
fire-and-forget, ніколи не кидає.

**Event names** визначені в `@sergeant/shared` →
`packages/shared/src/lib/analyticsEvents.ts` → `ANALYTICS_EVENTS` (~50 подій:
onboarding, finyk, FTUX, auth, nudges, hints, hubchat, cloudsync, subscription).
Typo не компілюється.

**Sentry зв'язок**: analytics не емітить breadcrumbs напряму, але
`console.log("[analytics]", event)` потрапляє у Sentry console-breadcrumbs
автоматично.

**Додавання events**:

1. Ключ у `ANALYTICS_EVENTS` (`packages/shared/src/lib/analyticsEvents.ts`).
2. `trackEvent(ANALYTICS_EVENTS.MY_EVENT, { ...payload })`.
3. Payload — plain object **без PII**.

### PostHog-transport

**Файл:** `apps/web/src/core/observability/posthog.ts`

Lazy dynamic `import("posthog-js")` — SDK (~50 KB gzip) не потрапляє у
головний бандл, підтягується з `requestIdleCallback` паралельно з Sentry
(`main.jsx:initPostHog`). Без `VITE_POSTHOG_KEY` — повний no-op: `trackEvent`
продовжує логуватися тільки у `hub_analytics_log_v1`.

Init-конфіг (`posthog.init`):

- `api_host` — з `VITE_POSTHOG_HOST`, дефолт `https://eu.i.posthog.com`.
- `autocapture: false`, `capture_pageview: false` — тільки явні `trackEvent`
  виклики, без зайвих кліків/переходів у шумі.
- `person_profiles: "identified_only"` — анонімні відвідувачі не створюють
  person у PostHog (залишає free-tier event budget для реальних юзерів).
- `sanitize_properties` — фільтрує `$cookies` з payload.

Super-properties, що додаються автоматично: `platform` (`web`/`ios`/`android`)
і `is_capacitor` (boolean) — теж через `@sergeant/shared`.

### Перегляди сторінок

**Файл:** `apps/web/src/core/observability/PageviewTracker.tsx`.

`capture_pageview: false` у `posthog.init` свідомий — PostHog дефолтний
auto-pageview стріляє на будь-яку мутацію URL (включно з query-params) і
записує повний `window.location.href` як `$current_url`. Для Sergeant це
означало б:

1. Magic-link токени (`?token=…`), OAuth-коди (`?code=…&state=…`), PWA-action
   параметри просочувались би у event-props як частина `$current_url`.
2. Кожен клік по filter-у чи відкриття модалки через query-param був би
   окремим `$pageview` — шум у funnels і retention.

Замість цього окремий `<PageviewTracker />` (монтується у `core/App.tsx`
всередині `<BrowserRouter>`) слухає `useLocation().pathname` і явно викликає
`capturePostHogEvent("$pageview", { $current_url, $pathname })` тільки на
зміну pathname. `$current_url` прокидається через `sanitizeUrl()` —
чутливі query-ключі (`token`, `code`, `state`, `access_token`,
`refresh_token`, `magic`, `auth`, `password`, `secret`, `api_key`)
редактуються до `[redacted]`. Без `VITE_POSTHOG_KEY` ефект no-op.

### HubChat-події

**Файл:** `apps/web/src/core/hub/HubChat.tsx`.

Трекаємо факт взаємодії з асистентом, НЕ текст повідомлень. Три події:

| Event                  | Коли                                              | Payload                                                                        |
| ---------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------ |
| `hubchat_message_sent` | Юзер відправив повідомлення (після всіх guard-ів) | `{ length, fromVoice, module? }`                                               |
| `hubchat_tool_invoked` | На кожен `tool_call` із відповіді LLM             | `{ tool, module? }`                                                            |
| `hubchat_error`        | Будь-яка помилка у `send()` catch-блоці           | `{ kind, status? }` де `kind ∈ http \| parse \| aborted \| network \| unknown` |

`length` — кількість символів, не текст; `fromVoice: boolean` — дає розділити
voice vs typed сценарії у funnels; `tool` — канонічне ім'я `ChatAction`
(напр. `add_expense`, `log_workout`). Для `hubchat_error` `status` заповнюється
тільки для `kind=http` (HTTP-код сервера), щоб алерт-и ловили spike-и 5xx
окремо від 4xx.

### CloudSync-події

**Файл:** `apps/web/src/core/cloudSync/hook/useSyncCallbacks.ts` — lifecycle
(start/success/fail). **Файли:** `engine/push.ts`, `engine/initialSync.ts` —
conflict-резолюція.

| Event                    | Коли                                                      | Payload                                        |
| ------------------------ | --------------------------------------------------------- | ---------------------------------------------- |
| `sync_started`           | `onStart` у `makeBoundCallbacks`                          | `{}`                                           |
| `sync_succeeded`         | `onSuccess` — успішний прогін `runExclusive`              | `{ duration_ms }`                              |
| `sync_failed`            | `onError` — після класифікації `toSyncError`              | `{ error_type, retryable, duration_ms }`       |
| `sync_conflict_resolved` | `conflicted.length > 0` у `pushAll` / `initialSync.merge` | `{ kind: "push" \| "initial-merge", modules }` |

`error_type` — категорія з `SyncError["type"]` (`network` / `auth` / `conflict`
/ `validation` / `unknown`). `retryable` — boolean з того самого normalizer-а;
дозволяє відокремити транзієнтні помилки від терміналу (4xx без авто-retry).
`modules` у `sync_conflict_resolved` — лічильник, не імена модулів: кардинальність
у PostHog залишається маленькою, але spike-и LWW-loss детектуються.

### Subscription-події (placeholder-и)

Білінг ще не підключений, але канонічні імена вже зафіксовані в
`ANALYTICS_EVENTS` (`SUBSCRIPTION_STARTED`, `SUBSCRIPTION_CANCELED`,
`SUBSCRIPTION_RENEWED`) — щоб у момент підключення Stripe/IAP не винаходити
нові імена і не розвалити PostHog-funnel-и між першим і другим релізом.
Очікувані payload-и (для майбутнього implementor-а):

```ts
trackEvent(ANALYTICS_EVENTS.SUBSCRIPTION_STARTED, {
  plan: "monthly" | "yearly",
  source: "paywall" | "deeplink" | "cta",
  price_cents: number,
  currency: string, // ISO-4217, "UAH" / "USD" / …
});
trackEvent(ANALYTICS_EVENTS.SUBSCRIPTION_CANCELED, {
  plan: string,
  reason: "user" | "billing" | "expired",
});
trackEvent(ANALYTICS_EVENTS.SUBSCRIPTION_RENEWED, {
  plan: string,
  period: number, // кількість успішних renewal-ів
});
```

Revenue-аналітика (MRR/ARR у PostHog) рахується через super-property
`$revenue` на `subscription_started` / `subscription_renewed` — окремий
task коли білінг оживе.

### Identify / reset

`AuthContext` слухає `user?.id` і викликає:

- `identifyPostHogUser(userId, traits)` — при переході у `authenticated`.
- `resetPostHog()` — при переході `authenticated → unauthenticated`.

Виклики fire-and-forget; події, що прилетіли до завершення init,
буферизуються (до 100) і flush-ляться після завантаження SDK. Buffer
відкидається, якщо `VITE_POSTHOG_KEY` не виставлений.

#### Person traits

`buildIdentifyTraits(user)` (`apps/web/src/core/observability/identifyTraits.ts`)
збирає person properties для `identify` payload-у:

| Trait         | Джерело                                                        | Формат                 | Примітки                                                                                                            |
| ------------- | -------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `vibe`        | `getVibePicks()` (localStorage `hub_onboarding_vibes_v1`)      | `DashboardModuleId[]`  | Опускається, якщо vibe-picks порожні або `localStorage` недоступний. Сегментуємо ретеншн і funnel-и за вкладкою.    |
| `plan`        | константа `"free"`                                             | `"free" \| "pro"`      | До запуску підписок (Stripe / LiqPay) завжди `"free"`. `identifyTraits.ts` — єдине місце, де треба підставити tier. |
| `locale`      | `navigator.language`                                           | string ≤ 16 chars      | Узгоджено з `Locale` schema у `packages/shared/src/schemas/api.ts`. Опускається, якщо `navigator` недоступний.      |
| `signup_date` | `user.createdAt` з `/api/v1/me` (Better Auth `user.createdAt`) | `YYYY-MM-DD` у **UTC** | Лише дата, без часу — без зайвого PII. Опускається, якщо `createdAt` = null або зіпсована.                          |

Контракт навмисно **толерантний**: будь-яке з джерел може мовчазно
відмовитись (Capacitor cold-start без localStorage, SSR-середовище без
`navigator`, legacy-юзери з `createdAt = null`) — `identify` все одно
виконається з тими трейтами, що доступні. Це краще, ніж ламати
identify повністю або перетирати раніше встановлений person property
порожнім значенням.

### ENV

```bash
# Без ключа — PostHog SDK не підтягується.
VITE_POSTHOG_KEY=phc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# EU Cloud за замовчуванням. US: https://us.i.posthog.com
VITE_POSTHOG_HOST=https://eu.i.posthog.com
```

### PII-guardrails

Payload для `trackEvent` уже має бути без PII (див. `ANALYTICS_EVENTS`
JSDoc). PostHog-distinctId — `user.id` (UUID Better Auth), ніколи не email
і не bearer-токен. `sanitize_properties` додатково страхує від `$cookies`,
якщо autocapture у майбутньому увімкнуть.

### Release annotations (GitHub Actions → PostHog API)

**Файл:** `scripts/ci/posthog-release-annotation.mjs`,
**Workflow:** `.github/workflows/posthog-release-annotation.yml`.

Кожен merge у `main` триггерить production deploy (Vercel + Railway). У
той самий момент GitHub Actions постить release annotation у PostHog
([REST API](https://posthog.com/docs/data/annotations)) — анотація
відмалюється вертикальною лінією поверх **усіх** PostHog-дашбордів (DAU,
funnel, retention, paywall, error-rate, CWV insights). Сенс — миттєва
кореляція «дроп DAU о 14:30» ⇄ «релізний реф abc1234, commit
`feat(web): …`» без ходіння у GitHub.

**Тригер:** `push` у `main` + `workflow_dispatch` (ручна анотація з
`dry_run` опцією).

**Payload, що шлеться:**

```json
POST {POSTHOG_HOST}/api/projects/{POSTHOG_PROJECT_ID}/annotations/
Authorization: Bearer {POSTHOG_PERSONAL_API_KEY}
Content-Type: application/json

{
  "content": "Release abc1234 (main): feat(web): … [run #12345]",
  "scope": "project",
  "date_marker": "2026-04-27T17:00:00.000Z"
}
```

`content`-рядок будується з `GITHUB_SHA` (короткий 7-ch), `GITHUB_REF_NAME`,
першого рядка commit-message (`head_commit.message` з push event payload)
і `GITHUB_RUN_ID`. Обрізається до 400 символів з ellipsis, щоб не впертись
у server-side ліміти.

**Repo secrets (`Settings → Secrets and variables → Actions`):**

| Секрет                     | Опис                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------- |
| `POSTHOG_PERSONAL_API_KEY` | **Personal API key**, не публічний `phc_*` project key. Доступний у `phx_…` префіксі. |
| `POSTHOG_PROJECT_ID`       | Числовий project id з URL у PostHog UI (`/project/<id>/…`).                           |
| `POSTHOG_HOST`             | Опційно. Дефолт `https://eu.posthog.com`. Для US: `https://us.posthog.com`.           |

Якщо `POSTHOG_PERSONAL_API_KEY` або `POSTHOG_PROJECT_ID` не виставлені
(форки, нові середовища) — скрипт логує warning і виходить з exit 0
(graceful no-op), workflow не червонітиме.

**Як отримати Personal API key:** PostHog UI → user menu → _Personal API
keys_ → Create. Мінімальний scope: `annotation:write` + `project:read`.

**Локальний smoke (без секретів):**

```bash
POSTHOG_DRY_RUN=1 \
POSTHOG_PERSONAL_API_KEY=phx_test \
POSTHOG_PROJECT_ID=42 \
GITHUB_SHA=abcdef0123 GITHUB_REF_NAME=main GITHUB_RUN_ID=999 \
node scripts/ci/posthog-release-annotation.mjs
```

`POSTHOG_DRY_RUN=1` лише логує payload, без HTTP-виклику.

**Як шукати анотацію в UI:** PostHog → будь-який insight з time-axis →
вертикальна лінія з підписом `Release abc1234 …`. Або
`Project → Annotations` → таблиця всіх анотацій + фільтр по scope/dates.

---

## 5. Mobile — статус Sentry

### Поточний стан

- **DSN accessor** є: `apps/mobile/src/lib/observability/env.ts` →
  `getSentryDsn()` читає `process.env.EXPO_PUBLIC_SENTRY_DSN`.
- **`@sentry/react-native` не встановлений.** ErrorBoundary і
  ModuleErrorBoundary використовують `console.error`.
- `TODO(phase-10)` в `ModuleErrorBoundary.tsx:74`.

### План (Phase 10+)

1. Встановити `@sentry/react-native`.
2. `EXPO_PUBLIC_SENTRY_DSN` зарезервовано. Expo babel-preset інлайнить
   `process.env.EXPO_PUBLIC_*` у runtime bundle at build time.
3. Замінити `console.error` → `Sentry.captureException` в ErrorBoundary /
   ModuleErrorBoundary.
4. `Sentry.init()` з DSN gating (аналогічно web).

### Чому `env.ts` окремий модуль

Для `jest.mock("@/lib/observability/env")` — тестування обох гілок (DSN-set /
DSN-absent) в одному файлі (`env.ts:1–6`).

---

## 6. Capacitor-shell

**Директорія:** `apps/mobile-shell/`

Web Sentry працює з тегом `is_capacitor=true` (`sentry.ts:62`) — всі
browser-errors з Capacitor WebView маркуються.

**Native-specific класи багів** (фільтр `is_capacitor:true`):

- **Safe-area insets** — notch / Dynamic Island.
- **Keyboard resize** — різна поведінка `resize` залежно від
  `android:windowSoftInputMode`.
- **Cookie / third-party storage** — обмежений доступ; `SameSite=None` може
  не працювати.
- **Deep-link cold-start buffer** — URL доступний після ініціалізації
  Capacitor bridge.

Фільтрація в Sentry:

```
is_capacitor:true     — Capacitor-специфічні помилки
platform:ios          — iOS WebView
platform:android      — Android WebView
```

---

## 7. Зв’язок із серверним боком

### Перехресне посилання: web-помилка → server-log

Web-клієнт включає `requestId` у API-помилках
(`apps/web/src/shared/lib/apiErrorFormat.ts`). Якщо `requestId` присутній —
шукайте у серверних логах (Pino) для кореляції.

> **TODO**: додати `x-request-id` header у fetch-клієнт — наразі `requestId`
> є тільки у відповідях сервера, не як outgoing header.

### Sentry-події не з’єднані

Web і server Sentry events **не зв'язані** через distributed tracing (різні
DSN/проєкти). Дебаг-flow:

1. Web Sentry event → `requestId` з breadcrumbs / error message.
2. Шукати `requestId` у серверних логах або server Sentry.

---

## 8. Довідник env-flag-ів

### Web (`apps/web`)

| Змінна                           | Призначення                 | Дефолт                  |
| -------------------------------- | --------------------------- | ----------------------- |
| `VITE_SENTRY_DSN`                | Sentry DSN; без неї — no-op | —                       |
| `VITE_SENTRY_ENVIRONMENT`        | environment tag             | `MODE` / `"production"` |
| `VITE_SENTRY_RELEASE`            | release (source maps)       | —                       |
| `VITE_SENTRY_TRACES_SAMPLE_RATE` | tracing sample rate         | `0.1`                   |
| `VITE_SENTRY_REPLAY_SAMPLE_RATE` | session replay sample rate  | `0`                     |
| `VITE_WEB_VITALS_ENDPOINT`       | kill-switch: `"0"` = no-op  | увімкнено               |

### Mobile (`apps/mobile`) — заплановано

| Змінна                   | Призначення                  | Дефолт |
| ------------------------ | ---------------------------- | ------ |
| `EXPO_PUBLIC_SENTRY_DSN` | Mobile Sentry DSN (Phase 10) | —      |

### Server (для повноти; детально в інших docs)

| Змінна                      | Призначення                 |
| --------------------------- | --------------------------- |
| `SENTRY_DSN`                | Server Sentry DSN           |
| `SENTRY_ENVIRONMENT`        | environment tag             |
| `SENTRY_RELEASE`            | release                     |
| `SENTRY_TRACES_SAMPLE_RATE` | tracing sample rate         |
| `METRICS_TOKEN`             | Bearer token для `/metrics` |
| `LOG_LEVEL`                 | Pino log level              |
| `LOG_PRETTY`                | Pino pretty-print (dev)     |

---

## 9. Конвенції ErrorBoundary

### Web — `ErrorBoundary`

**Файл:** `apps/web/src/core/ErrorBoundary.tsx`

Кореневий boundary. **Lazy bridge** до `captureException` з
`./observability/sentry.ts` — no-op поки SDK не завантажений, тому
ErrorBoundary в критичному шляху без витягування Sentry у головний бандл.

- `componentDidCatch` → `captureException(error, { contexts: { react: { componentStack } } })`.
- `fallback`: `ReactNode` або render-prop `({error, resetError}) => ReactNode`.
  Без prop — `null`.

### Web — `ModuleErrorBoundary`

**Файл:** `apps/web/src/core/ModuleErrorBoundary.tsx`

Ізолює падіння lazy-модуля від решти хабу:

- **"Спробувати ще"** — `retryRev++` як React `key` → force remount піддерева.
- **"До вибору модуля"** — `onBackToHub` callback.

Обгортайте кожен lazy-loaded модуль (Фінік, Фізрук, Рутина, Нутриція), щоб
краш одного не зносив навігацію.

### Mobile — `ErrorBoundary`

**Файл:** `apps/mobile/src/core/ErrorBoundary.tsx`

Порт web boundary. `console.error` + `captureError` (fallback на `console.error`
до Phase 10). Default fallback: `Card` + `Button` (`"Щось пішло не так"` /
`"Перезавантажити"`), reset + `router.replace("/")`. NativeWind semantic tokens.

### Mobile — `ModuleErrorBoundary`

**Файл:** `apps/mobile/src/core/ModuleErrorBoundary.tsx`

Порт web `ModuleErrorBoundary`. Додатковий prop `moduleName?: string` —
контекстуалізує заголовок (`"Модуль {moduleName} не вдалося завантажити"`).
Телеметрія: `console.error` (TODO Phase 10). `retryRev` key — ідентично web.
