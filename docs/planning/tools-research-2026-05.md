# Sergeant — готові рішення, ліби та тулзи

> **Last validated:** 2026-05-13 by Devin. **Next review:** 2026-08-11.
> **Status:** Active

Дослідження GitHub + мережі. Фокус: що реально додасть цінності Sergeant на поточному стеку, а не вже є в [`dev-stack-roadmap.md`](./dev-stack-roadmap.md).

---

## Огляд: що вже є і працює

Sergeant має дуже зрілий стек. Топ-15 ROI вже закриті: Sentry, Knip, strict TS, Testcontainers, MSW, Playwright, PostHog, Pino, size-limit, Renovate, Storybook, Stryker, Argos, OpenTelemetry, Drizzle. Нижче — тулзи/ліби, яких **ще немає** і які б реально допомогли.

---

## 🔴 Високий ROI — варто розглянути найближчим часом

### 1. **ElectricSQL** — local-first sync замість кастомного CloudSync

|                   |                                                                                                                                                                                                                |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Що це**         | Sync-engine від Postgres до клієнтського SQLite (або PGlite) через HTTP streaming. CRDT/LWW конфлікт-резолюшн з коробки.                                                                                       |
| **Чому Sergeant** | Fizruk і Routine вже local-first з LWW через кастомний CloudSync. ElectricSQL дає те саме, але production-grade, з partial sync (shapes), offline queue, та cross-tab coherence — без підтримки власного коду. |
| **Effort**        | M–L (міграція існуючого CloudSync). Можна почати з одного модуля (наприклад Routine).                                                                                                                          |
| **Альтернативи**  | **PowerSync** (аналог, більш enterprise), **Zero** (від Rocicorp, IndexedDB-based), **Triplit** (full-stack DB з вбудованим sync)                                                                              |
| **Посилання**     | [electric-sql.com](https://electric-sql.com), [github.com/electric-sql](https://github.com/electric-sql/electric) (~8k ⭐)                                                                                     |

### 2. **CVA (Class Variance Authority)** — type-safe компонентні варіанти

|                   |                                                                                                                                                                                                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Що це**         | Бібліотека для визначення варіантів CSS-класів з повною TS-типізацією. Ідеальний компаньон для Tailwind.                                                                                                                                                                      |
| **Чому Sergeant** | `dev-stack-roadmap.md` вже згадує cva як рекомендацію. У Sergeant вже є `design-tokens` + Tailwind + `clsx`/`tailwind-merge`. CVA дасть єдиний API для Button/Badge/Card variants замість ручних conditional class strings. Зменшить boolean-prop explosion у UI-компонентах. |
| **Effort**        | S (1–2 дні, інкрементально на нових/рефакторених компонентах)                                                                                                                                                                                                                 |
| **Посилання**     | [cva.style](https://cva.style/docs), npm: `cva`                                                                                                                                                                                                                               |

### 3. **react-email** — email-шаблони як React-компоненти

|                   |                                                                                                                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Що це**         | Бібліотека для створення email-шаблонів у React з превью, hot-reload, і рендерингом у HTML. Від тієї ж команди, що Resend.                                                                                                |
| **Чому Sergeant** | Sergeant вже використовує Resend для email (verification, password reset). `react-email` дозволить писати email-шаблони як React TSX з Tailwind, тестувати локально з превью-сервером, і тримати їх в репо поруч з кодом. |
| **Effort**        | S (4–8 год на базовий setup + міграцію існуючих шаблонів)                                                                                                                                                                 |
| **Посилання**     | [react.email](https://react.email), npm: `react-email`                                                                                                                                                                    |

### 4. **Paraglide.js** або **Lingui** — i18n з type-safety

|                   |                                                                                                                                                                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Що це**         | **Paraglide.js** — compile-time i18n з нульовим runtime overhead + Vite plugin. **Lingui** — mature i18n з React-компонентами, ICU MessageFormat, AI-context для перекладів.                                                       |
| **Чому Sergeant** | Sergeant поки моноязичний (uk/en мікс у коді). Якщо планується будь-яка локалізація — краще закласти інфраструктуру зараз. Paraglide дає 0 KB runtime і typesafe ключі. Lingui — більш mature, підтримує plurals/gender з коробки. |
| **Effort**        | M (1 тиждень на baseline setup, потім інкрементальна міграція)                                                                                                                                                                     |
| **Рекомендація**  | Paraglide якщо Vite SPA, Lingui якщо також mobile/server. Обидва мають Vite-plugin.                                                                                                                                                |
| **Посилання**     | [inlang.com/paraglide](https://inlang.com/m/gerre34r/library-inlang-paraglideJs), [lingui.dev](https://lingui.dev)                                                                                                                 |

### 5. **pg-boss** — PostgreSQL-native job queue

|                   |                                                                                                                                                                                                                |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Що це**         | Job queue побудований на PostgreSQL SKIP LOCKED. Cron jobs, retries, priorities, deadlines. Не потребує Redis.                                                                                                 |
| **Чому Sergeant** | Sergeant вже використовує BullMQ + Redis. Якщо Redis — лише для черг (не для кешу), pg-boss дозволить прибрати Redis зовсім, бо queue живе в тому ж Postgres. Менше інфраструктури = менше витрат + менше ops. |
| **Effort**        | M (міграція з BullMQ, але API схожий)                                                                                                                                                                          |
| **Коли**          | Якщо Redis не використовується для іншого (кеш, sessions). Якщо використовується — ігнорувати.                                                                                                                 |
| **Альтернатива**  | **DataQueue** — новіший, TypeScript-first, підтримує і PG, і Redis як бекенд                                                                                                                                   |
| **Посилання**     | [github.com/timgit/pg-boss](https://github.com/timgit/pg-boss) (3.4k ⭐)                                                                                                                                       |

### 6. **TanStack Router** — type-safe routing (на перспективу)

|                   |                                                                                                                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Що це**         | Роутер від TanStack з повною типізацією search params, path params, і loader data. File-based routing через Vite plugin.                                                                      |
| **Чому Sergeant** | Sergeant зараз на `react-router-dom` v7. TanStack Router дає значно кращий DX для SPA: типізовані search params (фільтри транзакцій, дати в URL), devtools, і кращу інтеграцію з React Query. |
| **Effort**        | L (поступова міграція, не для завтра)                                                                                                                                                         |
| **Коли**          | При великому рефакторі або React 19 міграції.                                                                                                                                                 |
| **Посилання**     | [tanstack.com/router](https://tanstack.com/router/latest) (~1.2M weekly downloads, ↑120% YoY)                                                                                                 |

---

## 🟡 Середній ROI — корисно, коли дійде черга

### 7. **apple-health** (Expo plugin) — HealthKit інтеграція

|                   |                                                                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Що це**         | Expo-native біндінги для Apple HealthKit. 70+ quantity types (кроки, пульс, калорії), 40+ category types, 80+ workout types. React hooks (`useHealthKitQuery`, `useHealthKitSubscription`). |
| **Чому Sergeant** | Fizruk (фітнес) + Nutrition — пряма інтеграція з HealthKit дозволить синхронізувати воркаути, кроки, калорії, вагу, без ручного введення. Killer feature для мобільного додатку.            |
| **Effort**        | M (інтеграція + UI для permissions + data mapping)                                                                                                                                          |
| **Посилання**     | [github.com/EvanBacon/apple-health](https://github.com/EvanBacon/apple-health) (від мейнтейнера Expo)                                                                                       |

### 8. **Recharts** або **Nivo** — data visualization

|                   |                                                                                                                                                                                                                                                          |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Що це**         | **Recharts** — найпопулярніша React charting library (побудована на D3). **Nivo** — альтернатива з більш сучасним API і SSR-підтримкою.                                                                                                                  |
| **Чому Sergeant** | Finyk (фінанси), Fizruk (прогрес), Nutrition (макроси), Routine (стріки) — всі модулі потребують графіків: лінійні тренди витрат, bar charts для макросів, heatmap для стріків. Якщо ще немає чартів — варто закласти одну лібу одразу для всіх модулів. |
| **Альтернативи**  | **ApexCharts** (14k ⭐, zero deps, React wrapper), **ECharts** (від Apache, найпотужніший, але складніший API)                                                                                                                                           |
| **Effort**        | S per chart, M для design-system інтеграції                                                                                                                                                                                                              |
| **Посилання**     | [recharts.org](https://recharts.org) (25k ⭐), [nivo.rocks](https://nivo.rocks) (13k ⭐)                                                                                                                                                                 |

### 9. **Anthropic structured outputs** — strict tool use для HubChat

|                   |                                                                                                                                                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Що це**         | Нова фіча Claude API: `strict: true` на tool definitions гарантує валідний JSON Schema output через grammar-constrained sampling. Також `output_config.format` для structured JSON responses.                                       |
| **Чому Sergeant** | HubChat вже використовує Anthropic tool use. `strict: true` усуне проблему з #261 "Unknown action" (коли `max_tokens` обрізає JSON). Гарантовано валідний tool call → менше error handling, менше retries, надійніший AI assistant. |
| **Effort**        | S (додати `strict: true` до існуючих tool definitions)                                                                                                                                                                              |
| **Посилання**     | [docs.anthropic.com/structured-outputs](https://docs.anthropic.com/en/docs/build-with-claude/structured-outputs)                                                                                                                    |

### 10. **UptimeRobot** або **Better Stack** — uptime monitoring

|                   |                                                                                                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Що це**         | Зовнішній uptime ping на `/health` endpoint. Алерти в Telegram/Slack/email при даунтаймі.                                                                                     |
| **Чому Sergeant** | Вже в `dev-stack-roadmap.md` як pending. `/health` і `/healthz` ендпоінти готові. Налаштування — 5 хвилин. Це найдешевший і найшвидший спосіб дізнатись про outage до юзерів. |
| **Effort**        | XS (5 хв)                                                                                                                                                                     |
| **Посилання**     | [uptimerobot.com](https://uptimerobot.com) (free: 50 monitors, 5-min interval), [betterstack.com](https://betterstack.com) (free tier)                                        |

### 11. **PostHog Feature Flags** — вже є PostHog, увімкнути flags

|                   |                                                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Що це**         | PostHog має вбудований feature flag сервіс. Якщо PostHog вже інтегрований — flags доступні без додаткового сервісу.                                                                        |
| **Чому Sergeant** | Вже є `posthog-js` в проді. Feature flags дозволять: A/B тести, gradual rollout нових фіч, kill switch для AI, per-user фічі (premium тощо). Без додаткових залежностей чи інфраструктури. |
| **Effort**        | S (PostHog SDK вже є, треба лише конфігурувати flags в PostHog UI)                                                                                                                         |
| **Альтернативи**  | **Unleash** (self-hosted, OSS, 13k ⭐), **GrowthBook** (OSS, stats-heavy)                                                                                                                  |
| **Посилання**     | [posthog.com/docs/feature-flags](https://posthog.com/docs/feature-flags/installation/react)                                                                                                |

### 12. **Hono** — заміна Express (на перспективу)

|                   |                                                                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Що це**         | Ultrafast TypeScript-first web framework. 10x швидший за Express, 78% менший бандл, edge-ready.                                                                           |
| **Чому Sergeant** | Express — legacy framework без вбудованої типізації. Hono дає: typed routes, middleware, валідацію через zod з коробки, RPC-client (аналог tRPC). Але це L-size міграція. |
| **Effort**        | L–XL (повна заміна Express, не для Q3 2026)                                                                                                                               |
| **Коли**          | При великому рефакторі бекенду або якщо Express стане bottleneck.                                                                                                         |
| **Посилання**     | [hono.dev](https://hono.dev) (22k ⭐), npm: `hono`                                                                                                                        |

---

## 🟢 Nice-to-have — покращення DX та якості

### 13. **fishery** + **@faker-js/faker** — test data factories

|                   |                                                                                                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Що це**         | **fishery** — TypeScript test data factory library (аналог FactoryBot). **faker** — генератор реалістичних рандомних даних.                                                                                              |
| **Чому Sergeant** | Вже в `dev-stack-roadmap.md` як pending. Зараз тести використовують inline mock data. Factories + faker дозволять: менше copy-paste в тестах, рандомізовані дані для edge cases, shared factories між web/server/mobile. |
| **Effort**        | S (2–4 год на setup + міграція тестів інкрементально)                                                                                                                                                                    |
| **Посилання**     | [github.com/thoughtbot/fishery](https://github.com/thoughtbot/fishery) (770 ⭐), [@faker-js/faker](https://fakerjs.dev) (13k ⭐)                                                                                         |

### 14. **dependency-cruiser** — enforce module boundaries

|                   |                                                                                                                                                                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Що це**         | Статичний аналізатор залежностей. Визначає правила: "finyk не імпортує fizruk", "packages/_ не імпортують apps/_". Генерує SVG-діаграми залежностей.                                                                              |
| **Чому Sergeant** | Монорепо з 11 пакетами і 5 апами. Без enforce-ингу module boundaries — спагеті-імпорти неминучі. В AGENTS.md вже є `domain-package-isolation` як кандидат на ESLint rule, але dependency-cruiser це вирішує краще і більш гнучко. |
| **Effort**        | S (2–4 год на базову конфігурацію + CI інтеграція)                                                                                                                                                                                |
| **Посилання**     | [github.com/sverweij/dependency-cruiser](https://github.com/sverweij/dependency-cruiser) (5.5k ⭐)                                                                                                                                |

### 15. **SQLocal** або **PGlite** — краща SQLite WASM інтеграція

|                   |                                                                                                                                                                                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Що це**         | **SQLocal** — простий API для SQLite WASM з OPFS persistence, cross-tab sync, Drizzle/Kysely інтеграція. **PGlite** — повний Postgres в WASM браузера.                                                                                                          |
| **Чому Sergeant** | Sergeant вже використовує `@sqlite.org/sqlite-wasm`. SQLocal додає: Web Worker автоматично (не блокує main thread), OPFS persistence (швидше за IndexedDB), reactive query subscriptions. PGlite цікавіший якщо хочеться один SQL-діалект на клієнті і сервері. |
| **Effort**        | M (заміна SQLite WASM wrapper-а)                                                                                                                                                                                                                                |
| **Посилання**     | [sqlocal.dev](https://sqlocal.dev) (720 ⭐), [pglite.dev](https://pglite.dev) (~10k ⭐)                                                                                                                                                                         |

### 16. **grammy plugins** — розширення Telegram-бота

|                   |                                                                                                                                                                                                                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Що це**         | grammy має екосистему офіційних плагінів: `@grammyjs/commands` (command routing + "did you mean?" + i18n), `@grammyjs/conversations` (stateful multi-step flows), `@grammyjs/menu` (inline menus), `@grammyjs/hydrate` (API result hydration), `@grammyjs/auto-retry` (rate limit handling). |
| **Чому Sergeant** | `tools/openclaw` — Telegram bot на grammy + Anthropic. Плагіни дозволять: красивіше command menu, interactive inline menus для ops, auto-retry для rate limits, conversations для multi-step flows (наприклад, створення бюджету через чат).                                                 |
| **Effort**        | S per plugin                                                                                                                                                                                                                                                                                 |
| **Посилання**     | [grammy.dev/plugins](https://grammy.dev/plugins/)                                                                                                                                                                                                                                            |

### 17. **Devcontainer** — reproducible dev environment

|                   |                                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Що це**         | VS Code Dev Container / GitHub Codespaces configuration. `code .` → повне середовище з Node, pnpm, Postgres, усіма extensions.                         |
| **Чому Sergeant** | Вже в `dev-stack-roadmap.md` як pending. Для solo-dev менш критично, але безцінне якщо з'явиться другий розробник або AI-агенти працюватимуть частіше. |
| **Effort**        | S–M (4–8 год)                                                                                                                                          |
| **Посилання**     | [containers.dev](https://containers.dev)                                                                                                               |

### 18. **Vectra** або рідний `pgvector-node` — покращення RAG pipeline

|                   |                                                                                                                                                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Що це**         | **Vectra** — production-grade RAG SDK для Node.js (chunking, embedding, retrieval, reranking, conversation memory). **pgvector-node** — офіційний Node.js клієнт для pgvector.                                                                                           |
| **Чому Sergeant** | HubChat вже має AI Memory з pgvector (міграція 025). Vectra може покращити retrieval quality: HyDE (hypothetical document embeddings), multi-query, reranking, evaluation harness. `pgvector-node` — більш lightweight, просто типізований клієнт для vector operations. |
| **Effort**        | M (інтеграція з існуючим AI Memory модулем)                                                                                                                                                                                                                              |
| **Посилання**     | [github.com/RogerNi/vectra-js](https://github.com/RogerNi/vectra-js), [github.com/pgvector/pgvector-node](https://github.com/pgvector/pgvector-node) (430 ⭐)                                                                                                            |

---

## 📊 Зведена таблиця пріоритетів

| #   | Інструмент           | Категорія        | ROI    | Effort | Залежності               |
| --- | -------------------- | ---------------- | ------ | ------ | ------------------------ |
| 1   | ElectricSQL          | local-first sync | 🔥🔥🔥 | L      | Замінює CloudSync        |
| 2   | CVA                  | UI/DX            | 🔥🔥   | S      | design-tokens + Tailwind |
| 3   | react-email          | email            | 🔥🔥   | S      | Resend вже є             |
| 4   | Paraglide/Lingui     | i18n             | 🔥🔥   | M      | Vite plugin              |
| 5   | pg-boss              | backend/infra    | 🔥🔥   | M      | Замінює BullMQ+Redis     |
| 6   | TanStack Router      | routing          | 🔥🔥   | L      | React Query вже є        |
| 7   | apple-health         | mobile/fitness   | 🔥🔥🔥 | M      | Expo 52                  |
| 8   | Recharts/Nivo        | data viz         | 🔥🔥   | S–M    | React                    |
| 9   | Anthropic strict     | AI/reliability   | 🔥🔥   | S      | Claude API               |
| 10  | UptimeRobot          | monitoring       | 🔥🔥   | XS     | `/health` готовий        |
| 11  | PostHog Flags        | feature flags    | 🔥🔥   | S      | PostHog вже є            |
| 12  | Hono                 | backend          | 🔥     | XL     | Замінює Express          |
| 13  | fishery + faker      | testing          | 🔥     | S      | Vitest                   |
| 14  | dependency-cruiser   | DX/quality       | 🔥     | S      | CI                       |
| 15  | SQLocal/PGlite       | local storage    | 🔥     | M      | Замінює sqlite-wasm      |
| 16  | grammy plugins       | telegram bot     | 🔥     | S      | grammy вже є             |
| 17  | Devcontainer         | DX/onboarding    | 🔥     | S–M    | Docker                   |
| 18  | Vectra/pgvector-node | AI/RAG           | 🔥     | M      | pgvector вже є           |

---

## 💡 Quick wins (зробити за день)

1. **UptimeRobot** на `/health` — 5 хвилин, безкоштовно
2. **PostHog Feature Flags** — SDK вже інтегрований
3. **Anthropic `strict: true`** — додати до tool definitions
4. **CVA** — почати з Button / Badge / Card
5. **fishery + faker** — першу factory для найчастішого тесту

---

## 🚫 Що НЕ рекомендую

| Тулза      | Чому ні                                                                            |
| ---------- | ---------------------------------------------------------------------------------- |
| tRPC       | Вже є zod-to-openapi flow + api-client. Переписувати ~30 endpoints не виправдано   |
| GraphQL    | Overkill для single-client SPA. REST + OpenAPI types — достатньо                   |
| Lerna      | Dead project, Turborepo вже є                                                      |
| Next.js    | Sergeant — SPA з окремим API. Міграція на Next.js = переписати все                 |
| Prisma     | Drizzle вже інтегрований і працює. Prisma тяжчий, менш гнучкий для raw SQL         |
| Million.js | Передчасна оптимізація. React Compiler (React 19) вирішить це системно             |
| Chromatic  | Argos вже покриває visual regression. Chromatic = $149/міс без додаткової цінності |
