# Status-матриця apps і packages

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Active

Одна сторінка — хто живий, хто стабілізується, хто в міграції, хто legacy.
Для кожного пакета: `status`, чим займається, куди копати глибше. Ніяких
приватних деталей реалізації — для цього є per-module docs.

## Легенда статусів

| Status      | Що означає                                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------------- |
| `active`    | Активно розвивається, часті зміни, PR-и йдуть щотижня.                                                |
| `stabilize` | Контракт більш-менш заморожений, правки лише bugfix-и і maintenance. Breaking зміни — через ADR.      |
| `migration` | У процесі переносу з / на іншу форму (наприклад web → RN, JS → TS). Очікується завершення зі строком. |
| `legacy`    | Не видаляємо (ще є залежності), але нових фіч не додаємо. План виведення зафіксовано або TBD.         |

---

## Apps

| Package                  | Path                | Status      | Опис                                                                                                                                                                                                                                                 | Глибше                                                                                                                                                                                  |
| ------------------------ | ------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@sergeant/web`          | `apps/web`          | `active`    | React 18 + Vite 8 PWA — канонічна продакшн-апка (Vercel статика + Railway `/api`). Sync v2 (SQLite-WASM + outbox), billing/pricing UI, observability pageview tracking.                                                                              | [`docs/architecture/platforms.md` §1](platforms.md), [`docs/architecture/frontend-overview.md`](frontend-overview.md), [`docs/tech-debt/frontend.md`](../tech-debt/frontend.md)         |
| `@sergeant/server`       | `apps/server`       | `active`    | Node 20 / TypeScript / Express `/api/v1/*` + `/api/v2/*`, Better Auth, Postgres, Anthropic tool-use, Voyage AI memory. Нові surfaces: billing (Stripe), transcribe (Whisper), waitlist, openclaw (GitHub App), alerts, observability, topic-archive. | [`docs/architecture/api-v1.md`](api-v1.md), [`docs/tech-debt/backend.md`](../tech-debt/backend.md), [`AGENTS.md`](../../AGENTS.md)                                                      |
| `@sergeant/mobile`       | `apps/mobile`       | `active`    | Expo SDK 52 + Expo Router. Usе 4 модулі, native push (APNs/FCM), MMKV-офлайн. Internal dev-client.                                                                                                                                                   | [`docs/mobile/overview.md`](../mobile/overview.md), [`docs/mobile/react-native-migration.md`](../mobile/react-native-migration.md), [`docs/architecture/platforms.md` §2](platforms.md) |
| `@sergeant/mobile-shell` | `apps/mobile-shell` | `stabilize` | Capacitor 7 wrapper навколо `@sergeant/web` для Android / iOS. MVP-release флоу. Далі — лише maintenance, нові фічі уже в `@sergeant/mobile`.                                                                                                        | [`docs/mobile/shell.md`](../mobile/shell.md), [`docs/mobile/capacitor-deep-links.md`](../mobile/capacitor-deep-links.md), [`docs/architecture/platforms.md` §3](platforms.md)           |
| `@sergeant/console`      | `tools/console`     | `active`    | Telegram-бот (grammy + Anthropic) — host для OpenClaw co-founder bot (ADR-0031). ADR-0032 законсолідував legacy `@sergeant_console_bot` (ADR-0027) у OpenClaw; GitHub App-flow авторизація (Hard Rule #20).                                          | [`tools/console/README.md`](../../tools/console/README.md), [`docs/adr/0032-console-consolidated-into-openclaw.md`](../adr/0032-console-consolidated-into-openclaw.md)                  |

---

## Server modules (нові з 2026-04)

Ці модулі живуть у `apps/server/src/modules/` і не мають власного `@sergeant/`-пакета, але є окремими продуктовими поверхнями.

| Module          | Path                                     | Status      | Опис                                                                                                                        | Глибше                                                                                                                                                                                                                                             |
| --------------- | ---------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `billing`       | `apps/server/src/modules/billing/`       | `active`    | Stripe checkout + subscription state. `billing_subscriptions` table (047). `budget.ts` — quota enforcement для AI features. | [`docs/architecture/api-v1.md`](api-v1.md), migration 047                                                                                                                                                                                          |
| `transcribe`    | `apps/server/src/modules/transcribe/`    | `active`    | Audio → text (Whisper). USD-cap per user/day у `ai_usage_daily` (bucket `transcribe:<model>`, fixed by 049).                | [`docs/architecture/data-exchange-storage-audit.md`](data-exchange-storage-audit.md), migration 049                                                                                                                                                |
| `waitlist`      | `apps/server/src/modules/waitlist/`      | `stabilize` | Waitlist sign-up і management. Таблиця `waitlist` (migration 009). Store + types у модулі.                                  | migration 009                                                                                                                                                                                                                                      |
| `openclaw`      | `apps/server/src/modules/openclaw/`      | `active`    | GitHub App-flow авторизація (Hard Rule #20). Tools для OpenClaw co-founder bot: `read_telegram_topic_history`, write-tools. | [`docs/adr/0032-console-consolidated-into-openclaw.md`](../adr/0032-console-consolidated-into-openclaw.md), [`docs/initiatives/stack-pulse-2026-05/pr-06-openclaw-github-app.md`](../initiatives/stack-pulse-2026-05/pr-06-openclaw-github-app.md) |
| `topic-archive` | `apps/server/src/modules/topic-archive/` | `active`    | `tg_topic_archive` — append-only history для Sergeant_ops supergroup topics (048). Backs `read_telegram_topic_history`.     | migration 048                                                                                                                                                                                                                                      |
| `alerts`        | `apps/server/src/modules/alerts/`        | `active`    | CSP report endpoint + web-vitals ingestion для client-side observability.                                                   | [`docs/observability/`](../observability/)                                                                                                                                                                                                         |
| `observability` | `apps/server/src/modules/observability/` | `stabilize` | Server-side observability helpers: prom-client metrics, store wrappers.                                                     | [`docs/observability/metrics.md`](../observability/metrics.md)                                                                                                                                                                                     |

---

## Domain packages

Бізнес-логіка модулів, pure TS без React. Імпортуються і web, і mobile.

| Package                      | Path                        | Status   | Опис                                                                            | Глибше                                                                                                                                   |
| ---------------------------- | --------------------------- | -------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `@sergeant/finyk-domain`     | `packages/finyk-domain`     | `active` | Фінансова логіка (Monobank sync normalizers, бюджети, cashflow, активи, борги). | [`docs/architecture/frontend-overview.md` (Finyk)](frontend-overview.md), [`packages/finyk-domain/src`](../../packages/finyk-domain/src) |
| `@sergeant/fizruk-domain`    | `packages/fizruk-domain`    | `active` | Тренування, програми, прогрес, вимірювання.                                     | [`docs/architecture/frontend-overview.md` (Fizruk)](frontend-overview.md)                                                                |
| `@sergeant/routine-domain`   | `packages/routine-domain`   | `active` | Календар, звички, стріки, хітмеп.                                               | [`docs/architecture/frontend-overview.md` (Routine)](frontend-overview.md)                                                               |
| `@sergeant/nutrition-domain` | `packages/nutrition-domain` | `active` | Фото AI-аналіз нутрієнтів, лог їжі, штрихкоди, плани/покупки/комора/рецепти.    | [`docs/architecture/frontend-overview.md` (Nutrition)](frontend-overview.md)                                                             |

---

## Shared infra

Пакети, які тримають контракт між поверхнями і підлогу під ногами.

| Package                         | Path                                     | Status      | Опис                                                                                                                                                                                                                                 | Глибше                                                                                                                       |
| ------------------------------- | ---------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `@sergeant/shared`              | `packages/shared`                        | `active`    | Спільні Zod-схеми API (`ChatRequestSchema`, `MeResponseSchema` та ін.), типи, утиліти. Sync v2 types (SyncEnginePushSchedulerDeps тощо).                                                                                             | [`packages/shared/src/schemas`](../../packages/shared/src/schemas)                                                           |
| `@sergeant/api-client`          | `packages/api-client`                    | `stabilize` | Типізована обгортка над `/api/v1/*` + `/api/v2/sync/*` для web + mobile. `SyncEnginePushScheduler`, `SyncEngineFlushOnReconnect`. Контракт рівно відповідає `@sergeant/shared` схемам.                                               | [`docs/architecture/api-v1.md`](api-v1.md), [AGENTS.md rule #3](../../AGENTS.md)                                             |
| `@sergeant/design-tokens`       | `packages/design-tokens`                 | `stabilize` | Tailwind preset, кольори, типографія. Єдине джерело брендових токенів для web/mobile.                                                                                                                                                | [`docs/design/brandbook.md`](../design/brandbook.md), [`docs/design/design-system.md`](../design/design-system.md)           |
| `@sergeant/insights`            | `packages/insights`                      | `active`    | Pure-TS движок для weekly-digest / coach-insight (однаковий на сервері і клієнті).                                                                                                                                                   | [`packages/insights/src`](../../packages/insights/src)                                                                       |
| `@sergeant/config`              | `packages/config`                        | `stabilize` | Спільний tsconfig/eslint-base. Апи інгерять через `extends`.                                                                                                                                                                         | [AGENTS.md rule #5](../../AGENTS.md)                                                                                         |
| `@sergeant/db-schema`           | `packages/db-schema`                     | `active`    | Drizzle ORM-схеми (Postgres + SQLite) і shared migration runner для `apps/server`. SQLite-схема включає `sync_op_outbox` + per-domain tables для v2 sync. Зміни схеми завжди в парі з SQL-міграцією у `apps/server/src/migrations/`. | [`packages/db-schema/src`](../../packages/db-schema/src), [AGENTS.md rule #4](../../AGENTS.md)                               |
| `eslint-plugin-sergeant-design` | `packages/eslint-plugin-sergeant-design` | `active`    | Custom ESLint rules (`no-raw-local-storage`, `rq-keys-only-from-factory`, `no-bigint-string`, `no-raw-req-in-pino-log` та ін.).                                                                                                      | [AGENTS.md rules](../../AGENTS.md), [`packages/eslint-plugin-sergeant-design`](../../packages/eslint-plugin-sergeant-design) |

---

## Чому ця сторінка існує

Без central-matrix-у новий інженер мусить шукати по 10+ docs-файлах, що в репо
`active` vs `stabilize`. Ця сторінка — короткий вхід у тему. Реальні деталі
завжди живуть у per-module docs (посилання в колонці «Глибше»), а тут — лише
«хто куди зараз рухається».

Ревалідація — раз у квартал (наступна в заголовку). Якщо статус пакета
змінюється у процесі PR — update цього файла в тому ж PR, не окремо.
