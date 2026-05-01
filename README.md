# Sergeant

[![CI](https://github.com/Skords-01/Sergeant/actions/workflows/ci.yml/badge.svg)](https://github.com/Skords-01/Sergeant/actions/workflows/ci.yml)
![Node 20](https://img.shields.io/badge/node-20.x-brightgreen)
![pnpm 9](https://img.shields.io/badge/pnpm-9.15.1-orange)
![TypeScript 6](https://img.shields.io/badge/TypeScript-6-blue)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

> **Last validated:** 2026-05-01 by @devin-ai. **Next review:** 2026-07-30.
> **Status:** Active

Персональна платформа-хаб із модулями: **ФІНІК** (фінанси), **ФІЗРУК** (спорт), **Рутина** (календар, звички, план) та **Харчування** (лог їжі, AI-аналіз фото, рецепти). PWA — встановлюється на телефон, працює офлайн. Акаунти та хмарна синхронізація між пристроями через Better Auth + PostgreSQL.

## Модулі

| Модуль     | Опис                                                                                                                                      | Статус |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| ФІНІК      | Особисті фінанси, синхронізація з Monobank, бюджети, борги, активи, тренди витрат, ручне додавання                                        | Готово |
| ФІЗРУК     | Тренування (активне, таймер відпочинку), програми тренувань, прогрес, виміри, фото тіла, щоденник самопочуття                             | Готово |
| Рутина     | Hub-календар, звички зі стріками, хітмеп, статистика, лідери/аутсайдери, деталізація, ремайндери                                          | Готово |
| Харчування | Фото → AI-аналіз макросів, лог їжі, сканер штрихкодів (OFF + USDA + UPCitemdb), денний план, список покупок, комора, рецепти, трекер води | Готово |

## Hub-ядро (спільні фічі)

- **Авторизація**: реєстрація/вхід email+пароль (Better Auth), сесійні cookie, хмарна синхронізація між пристроями
- **Глобальний пошук** (`HubSearch`) — пошук по транзакціях, тренуваннях, їжі та звичках
- **Онбординг** (`OnboardingWizard`) — покроковий wizard для нових користувачів
- **Щотижневий дайджест** (`WeeklyDigestCard`, `useWeeklyDigest`) — AI-зведення тижня по всіх модулях
- **AI-порада дня** (`AssistantAdviceCard`, `useCoachInsight`, `/api/coach`) — короткі персональні поради на основі даних модулів
- **Рекомендаційний рушій** (`TodayFocusCard`, `recommendationEngine`) — крос-модульні підказки без AI API
- **Адаптивний bento** (`adaptiveSort`, `HubDashboard`) — м'яко піднімає в топ 1 модуль за контекстом (час доби × активний сигнал); ручний порядок зберігається, можна вимкнути в Налаштуваннях → Дашборд → «Адаптивний порядок»
- **Голосовий ввід** (`VoiceMicButton`, `speechParsers`, `useSpeech`) — Web Speech API в Харчуванні, Фізруку та Фінікові
- **AI-чат** (`HubChat`) — модульний чат з контекстом усіх даних, розбитий на `hubChatContext` / `hubChatActions` / `hubChatUtils` / `hubChatSpeech`
- **PWA shortcuts** — 3 ярлики на головному екрані (нова витрата, почати тренування, додати їжу)
- **Web Push** (`PushNotificationToggle`, `usePushNotifications`, `/api/push/*`) — реальні push-підписки через VAPID (нагадування про звички, тренування, бюджет)
- **Hub-налаштування** (`HubSettingsPage` + `core/settings/*`) — розбита на секції: General, Finyk, Fizruk, Routine, Notifications, AIDigest
- **Hub-звіти** (`HubReports`) — зведені звіти по всіх модулях
- **Індикатор синхронізації** (`useSyncStatus` у `UserMenuButton` / `OfflineBanner`) — стан хмарної синхронізації в шапці
- **Офлайн-черга** (`useCloudSync`) — синхронізація з чергою при відновленні з'єднання
- **Щоденні AI-квоти** (`apps/server/src/modules/chat/aiQuota.ts`, таблиця `ai_usage_daily`) — ліміт викликів AI per-user / per-IP

## Структура

Це **pnpm + Turborepo monorepo** (Node 20, TypeScript). Повний матрикс
живих/legacy пакетів — у [`docs/architecture/apps-status-matrix.md`](docs/architecture/apps-status-matrix.md);
правила і конвенції редагування — в [`AGENTS.md`](AGENTS.md).

```
apps/
├── web/                         # @sergeant/web — Vite + React 18 SPA (PWA, канонічна продакшн-апка)
│   ├── src/core/                # Hub-shell: auth/, hub/ (HubChat, HubDashboard, HubReports, HubSearch,
│   │                            #   HubSettingsPage, HubBackupPanel), insights/ (CoachInsightCard,
│   │                            #   WeeklyDigestCard, useCoachInsight, useWeeklyDigest), onboarding/,
│   │                            #   observability/, settings/, cloudSync/, lib/ (hubChatActions, …)
│   ├── src/modules/             # finyk/ fizruk/ routine/ nutrition/ — кожен має pages/components/hooks/lib/domain
│   ├── src/shared/              # UI-кіт + спільні хуки/утиліти (cn, date, storage, …)
│   ├── src/sw.ts                # Service Worker (офлайн-кеш, Web Push)
│   ├── src/main.jsx             # Точка входу
│   └── middleware.ts            # Vercel Edge Middleware: проксіює /api/* на BACKEND_URL (Railway)
├── server/                      # @sergeant/server — Node 20 + Express + PostgreSQL + Better Auth
│   ├── src/index.ts             # Entrypoint (pnpm start; SERVER_MODE=replit для unified-режиму)
│   ├── src/app.ts               # createApp({ servesFrontend, distPath, trustProxy }) — Express factory
│   ├── src/config.ts            # Конфіг рантайм-режиму (порт, SPA-static, trust proxy)
│   ├── src/auth.ts              # Better Auth (спільний pg pool з db.ts)
│   ├── src/db.ts                # PostgreSQL pool, ensureSchema(), SQL-міграції з migrations/
│   ├── src/migrations/          # 001_noop.sql … 021_governance_audit.sql (sequential, no gaps)
│   ├── src/routes/              # Express-роутери: auth, me, sync, chat, coach, push, banks, barcode,
│   │                            #   nutrition, weekly-digest, food-search, web-vitals, transcribe, waitlist,
│   │                            #   mono-webhook, health, frontend
│   ├── src/modules/             # Бізнес-логіка по доменах: chat/ (toolDefs/, chat.ts, aiQuota.ts),
│   │                            #   mono/, nutrition/, push/, sync/, digest/, transcribe/, waitlist/,
│   │                            #   observability/
│   ├── src/http/                # Спільний HTTP-шар (helmet, errorHandler, requireSession, rateLimit)
│   └── src/obs/, src/email/, src/env/, src/lib/, src/push/, src/test/
├── mobile/                      # @sergeant/mobile — Expo SDK 52 + Expo Router + RN 0.76 (internal dev-client)
├── mobile-shell/                # @sergeant/mobile-shell — Capacitor 7 wrapper навколо @sergeant/web
└── console/                     # @sergeant/console — Telegram bot (grammy + Anthropic), internal ops/marketing

packages/
├── shared/                      # @sergeant/shared — Zod-схеми API, типи, утиліти
├── api-client/                  # @sergeant/api-client — типізована обгортка над /api/v1/*
├── design-tokens/               # @sergeant/design-tokens — Tailwind preset, кольори, типографія
├── insights/                    # @sergeant/insights — pure-TS engine для weekly-digest / coach-insight
├── config/                      # @sergeant/config — спільні tsconfig/eslint бази
├── finyk-domain/                # @sergeant/finyk-domain — Mono normalizers, бюджети, активи, борги
├── fizruk-domain/               # @sergeant/fizruk-domain — тренування, програми, прогрес
├── routine-domain/              # @sergeant/routine-domain — звички, стріки, хітмеп
├── nutrition-domain/            # @sergeant/nutrition-domain — макроси, плани, рецепти, штрихкоди
└── eslint-plugin-sergeant-design/  # Custom ESLint rules (no-raw-local-storage, rq-keys-only-from-factory, …)

docs/                            # ADR, playbooks, architecture, design, observability — див. docs/README.md
scripts/                         # Скрипти CI/lint (check-imports, lint-migrations, generate-licenses, …)
```

Огляд стеку фронтенду: [docs/architecture/frontend-overview.md](docs/architecture/frontend-overview.md). Roadmap dev-стека: [docs/planning/dev-stack-roadmap.md](docs/planning/dev-stack-roadmap.md).

**Деплой:** фронт Vercel + API/PostgreSQL на Railway — покроково [docs/integrations/railway-vercel.md](docs/integrations/railway-vercel.md). Локальна БД: `pnpm db:up` (Docker Compose).

> **New contributor?** See [CONTRIBUTING.md](CONTRIBUTING.md) for a 5-minute quickstart.

## HubChat (AI-чат)

**Архітектура:** клієнт [`apps/web/src/core/hub/HubChat.tsx`](apps/web/src/core/hub/HubChat.tsx) + [`apps/web/src/core/lib/hubChatActions.ts`](apps/web/src/core/lib/hubChatActions.ts) (виконавець tool-calls) ↔ сервер [`apps/server/src/modules/chat/`](apps/server/src/modules/chat) (Anthropic tool-use, Claude Sonnet 4.6). Tool definitions розбиті по доменах у [`apps/server/src/modules/chat/toolDefs/`](apps/server/src/modules/chat/toolDefs) (`finyk.ts`, `fizruk.ts`, `nutrition.ts`, `routine.ts`, `crossModule.ts`, `memory.ts`, `utility.ts`). Користувач керує всіма 4 модулями голосом або текстом без переходу в UI.

**Інструменти (65):**

| Категорія        | Tools                                                                                                                                                                                                                                                                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Фінік (17)       | `create_transaction`, `delete_transaction`, `change_category`, `find_transaction`, `batch_categorize`, `hide_transaction`, `split_transaction`, `recurring_expense`, `create_debt`, `mark_debt_paid`, `create_receivable`, `set_budget_limit`, `update_budget`, `set_monthly_plan`, `add_asset`, `import_monobank_range`, `export_report` |
| Фізрук (11)      | `plan_workout`, `start_workout`, `finish_workout`, `log_set`, `add_program_day`, `log_measurement`, `log_wellbeing`, `log_weight`, `suggest_workout`, `copy_workout`, `compare_progress`                                                                                                                                                  |
| Рутина (11)      | `create_habit`, `edit_habit`, `mark_habit_done`, `complete_habit_for_date`, `create_reminder`, `archive_habit`, `pause_habit`, `set_habit_schedule`, `reorder_habits`, `habit_stats`, `add_calendar_event`                                                                                                                                |
| Харчування (9)   | `log_meal`, `log_water`, `add_recipe`, `add_to_shopping_list`, `consume_from_pantry`, `set_daily_plan`, `suggest_meal`, `copy_meal_from_date`, `plan_meals_for_day`                                                                                                                                                                       |
| Cross-module (9) | `morning_briefing`, `weekly_summary`, `set_goal`, `spending_trend`, `weight_chart`, `category_breakdown`, `detect_anomalies`, `habit_trend`, `compare_weeks`                                                                                                                                                                              |
| Memory (3)       | `remember`, `forget`, `my_profile`                                                                                                                                                                                                                                                                                                        |
| Utility (5)      | `calculate_1rm`, `convert_units`, `save_note`, `list_notes`, `export_module_data`                                                                                                                                                                                                                                                         |

**Приклади промптів:**

- "Видали транзакцію m_abc123" → `delete_transaction`
- "Постав ліміт на кафе 3000 грн" → `update_budget { scope:'limit', ... }`
- "Створи ціль 'Відпустка' на 30 000 грн, вже зібрано 5000" → `update_budget { scope:'goal', ... }`
- "Закрий борг оренди" → `mark_debt_paid`
- "Додай актив депозит Приват 100 000 грн" → `add_asset`
- "Оновити монобанк з 1 травня до сьогодні" → `import_monobank_range`
- "Почни тренування" / "Заверши тренування" → `start_workout` / `finish_workout`
- "Запиши заміри: вага 78.5, талія 82" → `log_measurement`
- "В понеділок груди/трицепс: жим 4×8 80 кг, розводка 3×12" → `add_program_day`
- "Самопочуття: вага 78, сон 7.5 год, енергія 4/5" → `log_wellbeing`
- "Нагадай про розминку о 8:00" → `create_reminder`
- "Познач 'Пити воду' виконаною на 10 червня" → `complete_habit_for_date`
- "Заархівуй звичку ..." → `archive_habit`
- "Додай у календар 'Лікар' 1 липня о 9:30" → `add_calendar_event`
- "Збережи рецепт 'Овочевий суп', інгредієнти ..." → `add_recipe`
- "Додай у список покупок молоко 2 л" → `add_to_shopping_list`
- "Використав яйця з комори" → `consume_from_pantry`
- "Постав щоденний план: 2200 ккал, білок 150 г, вода 2.5 л" → `set_daily_plan`
- "Запиши вагу 77.3" → `log_weight`

**Квоти:** кожен виклик `/api/chat` (перший крок та tool-result-продовження) інкрементує `aiQuota` через `requireAiQuota()`-middleware. Ліміти — `AI_DAILY_USER_LIMIT` / `AI_DAILY_ANON_LIMIT`.

**Тести:** [`apps/web/src/core/lib/hubChatActions.test.ts`](apps/web/src/core/lib/hubChatActions.test.ts) + `hubChatActionsExtended.test.ts` (клієнтські обробники, localStorage mutations), [`apps/server/src/modules/chat/chat.test.ts`](apps/server/src/modules/chat/chat.test.ts) (tool-parsing з мок-Anthropic).

## PWA

Hub — повноцінний Progressive Web App:

- **Встановлення**: на Android/iOS браузер запропонує «Додати на головний екран» або натисніть іконку в адресному рядку. Install banner з'являється після 2+ сесій і 30 секунд взаємодії.
- **Офлайн**: Service Worker кешує статику та shell — базовий інтерфейс доступний без мережі. Дані модулів зберігаються в localStorage.
- **Оновлення**: при виході нової версії SW автоматично оновлюється у фоні; з'являється банер «нова версія».
- **Shortcuts**: 3 ярлики на головному екрані — «Нова витрата», «Почати тренування», «Додати їжу» (deep-link через `?module=X&action=Y`).
- **Web Push**: VAPID + `usePushNotifications` реєструє пристрій через **`POST /api/push/register`** (у клієнті це уніфікований шлях до `/api/v1/push/register`), знімає — **`POST /api/push/unregister`**; сервер розсилає нагадування (звички, тренування, бюджет) через `web-push`, SW показує нотифікації у фоні з діями (deep-link). Застарілі **`POST`/`DELETE /api/push/subscribe`** лишаються лише як proxy для старих клієнтів до повного rollout.

## Запуск

```bash
pnpm install --frozen-lockfile
pnpm db:up      # PostgreSQL у Docker Compose (опційно — для локальної БД)
pnpm dev        # Vite (web) + Express (server) одночасно через `turbo run dev --parallel`
                # web → http://localhost:5173, server → http://localhost:3000 (web проксує /api → 3000)
```

Альтернативно — два окремі процеси у різних терміналах:

```bash
pnpm dev:server # тільки Express API (apps/server/src/index.ts, порт 3000)
pnpm dev:web    # тільки Vite dev server (фронт, порт 5173)
```

`pnpm start` — продакшн-режим API (потребує `pnpm build` спочатку): `pnpm --filter @sergeant/server start` запускає скомпільований entry-файл в `apps/server/dist-server/` (білд-артефакт, gitignored).

На Replit: `pnpm start:replit` — єдиний unified-процес (фронт + API, порт 5000) через `SERVER_MODE=replit`.

## Змінні середовища

| Змінна                     | Обов'язково | Опис                                                                                                                                              |
| -------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`             | Так (авто)  | PostgreSQL connection string — авто-надається Replit; для Railway/Vercel задати вручну                                                            |
| `BETTER_AUTH_SECRET`       | Так         | Секрет шифрування сесій Better Auth (32+ символи) — задати вручну як secret                                                                       |
| `BETTER_AUTH_URL`          | Ні          | Базова URL сервера для Better Auth (авто-визначається з `REPLIT_DEV_DOMAIN` або в Railway — з хоста)                                              |
| `ANTHROPIC_API_KEY`        | Так         | Ключ Anthropic (чат, аналіз фото, рецепти, дайджест, денні підказки, AI-порада)                                                                   |
| `VAPID_PUBLIC_KEY`         | Для push    | Публічний VAPID-ключ для Web Push. Генерація: `node -e "const wp=require('web-push');console.log(wp.generateVAPIDKeys())"`                        |
| `VAPID_PRIVATE_KEY`        | Для push    | Приватний VAPID-ключ (пара до `VAPID_PUBLIC_KEY`)                                                                                                 |
| `VAPID_EMAIL`              | Для push    | `mailto:you@example.com` — контакт для push-серверів                                                                                              |
| `API_SECRET`               | Для push    | Внутрішній секрет для `POST /api/push/send` (щоб не було довільних розсилок)                                                                      |
| `AI_DAILY_USER_LIMIT`      | Ні          | Ліміт AI-викликів на залогіненого користувача (за замовч. 120). Перевіряється через `apps/server/src/modules/chat/aiQuota.ts` і `ai_usage_daily`  |
| `AI_DAILY_ANON_LIMIT`      | Ні          | Ліміт AI-викликів для анонімного IP (за замовч. 40)                                                                                               |
| `AI_QUOTA_DISABLED`        | Ні          | `1` — повністю вимкнути перевірки квот (напр., для локального dev)                                                                                |
| `ALLOWED_ORIGINS`          | Ні          | Додаткові CORS origin через кому (локальне та preview вже дозволені)                                                                              |
| `VITE_API_BASE_URL`        | Ні          | Базовий URL API **без** завершального `/` (краще не використовувати на Vercel у проді; див. `BACKEND_URL` + `middleware.ts`)                      |
| `VITE_API_PROXY_TARGET`    | Ні          | Тільки для `vite dev`: куди проксувати `/api/*` (типово `http://127.0.0.1:3000`)                                                                  |
| `VITE_NUTRITION_API_TOKEN` | Ні          | Токен Nutritionix для прямих запитів з фронту                                                                                                     |
| `USDA_FDC_API_KEY`         | Ні          | Ключ USDA FoodData Central для barcode-fallback (безкоштовний на [api.data.gov](https://api.data.gov/signup)); без ключа — `DEMO_KEY` (40 req/hr) |
| `PORT`                     | Ні          | Порт Express-сервера (типово `3000`)                                                                                                              |
| `GOOGLE_CLIENT_ID`         | Ні          | Google OAuth client ID — вмикає «Увійти через Google». Redirect URI: `<BETTER_AUTH_URL>/api/auth/callback/google`                                 |
| `GOOGLE_CLIENT_SECRET`     | Ні          | Google OAuth client secret (пара до `GOOGLE_CLIENT_ID`)                                                                                           |
| `RESEND_API_KEY`           | Ні          | Resend API-ключ для транзакційних листів (скидання пароля, верифікація email). Без нього листи не відправляються                                  |
| `RESEND_FROM`              | Ні          | Адреса відправника для Resend (має бути з верифікованого домену)                                                                                  |
| `GROQ_API_KEY`             | Ні          | Groq API-ключ для Whisper (голосова транскрипція в `/api/transcribe`). Без ключа — fallback на Web Speech API                                     |
| `BACKEND_URL`              | Для Vercel  | URL Railway-API — Edge Middleware проксує `/api/*` через нього. Без нього OAuth і cookie-сесії не працюють на Vercel                              |
| `SENTRY_DSN`               | Ні          | Sentry DSN для бекенду (Node.js error tracking)                                                                                                   |
| `VITE_SENTRY_DSN`          | Ні          | Sentry DSN для фронтенду (React error tracking, потрапляє у бандл)                                                                                |
| `VITE_POSTHOG_KEY`         | Ні          | PostHog project API key (`phc_…`) — product analytics. Без ключа трекінг лише в локальному ring-buffer                                            |
| `AI_QUOTA_TOOL_COST`       | Ні          | Вартість одного tool-use виклику в одиницях квоти (за замовч. 3)                                                                                  |
| `AI_QUOTA_TOOL_LIMITS`     | Ні          | JSON-об'єкт per-tool лімітів (напр. `{"change_category":30}`). Tools поза списком — `AI_QUOTA_TOOL_DEFAULT_LIMIT`                                 |

> Повний перелік змінних з поясненнями — у [`.env.example`](.env.example). На Replit `DATABASE_URL` надається автоматично при підключенні бази даних. `BETTER_AUTH_SECRET` задається вручну через Secrets.

> Важливо: токени типу `VITE_*` потрапляють у клієнтський бандл — не використовуй їх як повноцінний захист.

## Авторизація та синхронізація

- **Better Auth** — email/password реєстрація/вхід на `/api/auth/*`, сесійні cookie (30 днів, daily refresh).
- **PostgreSQL** (`module_data` table) — JSON blobs per user per module з версійним трекінгом (LWW conflict resolution).
- **Sync endpoints**: `POST /api/sync/push`, `POST /api/sync/pull`, `POST /api/sync/push-all`, `POST /api/sync/pull-all`.
- **useCloudSync**: авто-push при змінах localStorage (debounce 5с) + 2-хв інтервал; офлайн-черга з replay при reconnect.
- **Міграційний UX**: при першому вході з наявними локальними даними — пропонує завантажити або пропустити.
- Auth є опціональною — застосунок повністю працює без входу, але вхід додає хмарний бекап і синхронізацію.

## API на Railway (ліміт Vercel Hobby: ≤12 functions)

Якщо Vercel відмовляє в деплої через кількість serverless-функцій, можна винести **весь** Hub API в один контейнер:

1. У Railway: новий сервіс з цього репозиторію, білд через [`Dockerfile.api`](Dockerfile.api) (див. [`railway.toml`](railway.toml)).
2. У змінних сервісу Railway задати секрети: `ANTHROPIC_API_KEY`, `DATABASE_URL`, `BETTER_AUTH_SECRET`, для Web Push — `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`, `API_SECRET`; опційно `NUTRITION_API_TOKEN`, `USDA_FDC_API_KEY`, `ALLOWED_ORIGINS`.
3. У **Vercel** (Environment Variables для Production/Preview): `BACKEND_URL` = публічний URL Railway (HTTPS).
4. **Не використовуй `VITE_API_BASE_URL` у проді на Vercel**: веб має ходити на `/api/*` (same-origin), а Edge Middleware у [`apps/web/middleware.ts`](apps/web/middleware.ts) проксіює запити на `BACKEND_URL` — це критично для Safari (ITP) та cookie-сесій.
5. Каталог API — у [`apps/server/src/`](apps/server/src/), у корені репо немає `api/`, тож Vercel Hobby не створює десятки serverless-функцій.

Локально: `pnpm dev:server` (Express, порт 3000). Фронт `pnpm dev:web`: запити йдуть на `/api/*` і проксуються на `VITE_API_PROXY_TARGET`.

## Деплой

Vercel — автоматично при пуші в `main`. У [`vercel.json`](vercel.json): rewrite на `index.html` для SPA, без перехоплення `/api/*`. API — на **Railway** ([`Dockerfile.api`](Dockerfile.api)). На **Replit**: `pnpm start:replit` запускає той самий `apps/server/src/index.ts` з `SERVER_MODE=replit` як unified-сервер (фронт + API, порт 5000). Дані модулів у **localStorage**; PostgreSQL — для auth, cloud sync та сервісних таблиць (квоти, push devices, mono webhooks).
