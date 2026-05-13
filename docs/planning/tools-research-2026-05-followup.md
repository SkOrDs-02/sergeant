# Tools research 2026-05 — follow-up: що з відкладеного дійсно гірше / краще

> **Last validated:** 2026-05-09 by @Skords-01 / Devin. **Next review:** 2026-08-07.
> **Status:** Active

> **Контекст:** [`tools-research-2026-05.md`](./tools-research-2026-05.md) (далі — TR-26-05) — основний research-довідник станом на 2026-05-05.
> Цей документ — чесний follow-up через 4 дні: повернення до «відкладеного» / «не рекомендованого», з перевіркою реального стану коду (`grep` по `package.json` і модулях) і зважуванням, де ваше рішення сильніше за альтернативу, а де — це втрачена вартість.
>
> **Формат:** для кожного пункту — **що в TR-26-05 → що в коді сьогодні → чесна оцінка (Hold / Mild miss / Real loss / Reconsider) → рекомендована дія**. Без маркетингових компромісів.

---

## TL;DR

| Tier                                     | Дія                                    | Тулзи                                                                                                                        |
| ---------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 🟢 **Tier 1 — зробити цього тижня**      | Низький effort, прямі реальні втрати   | `Anthropic strict: true`, UptimeRobot                                                                                        |
| 🟡 **Tier 2 — цього кварталу**           | Середній effort, відчутний DX/UX win   | CVA, chart-library, apple-health                                                                                             |
| 🔵 **Tier 3 — reconsider при Stage 12+** | Серйозний рефактор, чекає тригер       | PGlite, CR-SQLite                                                                                                            |
| ⚪ **Hold**                              | Ваше рішення витримало перевірку часом | Sync engines (Electric/PowerSync/Zero/Triplit), Hono, TanStack Router, Next.js, Prisma, tRPC, GraphQL, Million.js, Chromatic |

---

## 1. Sync engines — рішення витримало перевірку часом

TR-26-05 §1 ставить **ElectricSQL** на топ (🔥🔥🔥, L effort, замінює CloudSync). PowerSync / Zero / Triplit згадані як альтернативи. Реальне рішення: лишились на власному CloudSync v2 (Stage 5–10 у [`storage-roadmap.md`](./storage-roadmap.md)).

### Що змінилось у світі з 2026-05-05

- **ElectricSQL рестартанули.** Нова версія (`@electric-sql/client`, «new Electric») — це **read-only sync через Shapes**, write іде через звичайний HTTP API. Це вже **не** той ElectricSQL, який описаний у TR-26-05 §1 (там описана старіша bidirectional-модель — її більше немає). Якби CloudSync переписали під ElectricSQL весною 2026 — зараз переписували б удруге. **Рішення витримало.**
- **PowerSync** — досі найближчий аналог: bidirectional sync, op-log queue, LWW. Self-host є (AGPL), але SDK ергономічніше з керованою бекенд-частиною. Чесна альтернатива, яка б реально зекономила ~3 місяці інженерних годин (масштаб PR-ів #050–#070r). Втратили б: контроль над serialization форматом, можливість per-module roll-out (Stage 8 quartet), власну телеметрію `<m>.sqlite.dualwrite.parity`. **На 1 юзер × 3 девайси PowerSync — overpay. На 10k юзерів × 3 девайси — чесний reconsider.**
- **Zero (Rocicorp).** Server-authoritative з оптимістичними мутаціями в IndexedDB. Принципово інша модель — **не local-first** у вашому розумінні (сервер бачить кожен write одразу, в т.ч. через перевірку RLS). Для Sergeant з offline-у спортзалу/метро (див. ADR-0011 §Context) це регрес.
- **Triplit.** Занадто молодий (2024), власна DSL, замінив би і Drizzle, і CloudSync. Ризик-профіль не той.
- **CR-SQLite (vlcn-io).** **Не згаданий** у TR-26-05 — це miss дослідження. SQLite extension з CRDT-таблицями. Дав би row-level merge без власного оп-логу. Ціна — нативний модуль (не просто WASM); web потребує кастомного build sqlite3.wasm з extension-ом. Reconsider при Stage 12+, якщо власний writer почне зашиватись на op-log compaction.

### Оцінка

**⚪ Hold.** Ваше рішення сильніше за будь-який реально доступний варіант. ElectricSQL pivot — додаткове підтвердження. PowerSync — чесний reconsider при scale (10k юзерів). CR-SQLite — третій бекап-варіант, додати у TR-26-05 наступного review-циклу.

### Рекомендована дія

- Додати CR-SQLite у TR-26-05 як §1.1 при наступному оновленні (2026-08-03).
- Лишити trigger у [`storage-roadmap.md`](./storage-roadmap.md) Stage 12+ для re-evaluation: «якщо MAU > 5k OR op-log compaction logic перевищує 500 рядків — reconsider PowerSync / CR-SQLite».

---

## 2. Real losses — те, що НЕ адопчено і де це реально втрачена вартість

Перевірив код проти TR-26-05. Ось що **не впроваджено**, з рангом «чесної оцінки»:

| Тулза                                         | TR-26-05 §    | Effort  | Реальний стан                                                                                                       | Чесна оцінка                                                                                                                                                                                                                        |
| --------------------------------------------- | ------------- | ------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Anthropic `strict: true`**                  | §9, S, 🔥🔥   | години  | `grep "strict:\s*true" apps/server/src/modules/chat/` — 0 матчів                                                    | 🟢 **Real loss.** Найбільший unforced error.                                                                                                                                                                                        |
| **UptimeRobot / Better Stack**                | §10, XS, 🔥🔥 | 5 хв    | Згадане в `dev-stack-roadmap.md`, не сконфігуроване. `/health` готовий.                                             | 🟢 **Real loss.** Soromno.                                                                                                                                                                                                          |
| **CVA**                                       | §2, S, 🔥🔥   | 1–2 дні | Не в `package.json` (жоден workspace).                                                                              | 🟡 **Mild miss.** Без неї — ручні conditional class strings у Button/Badge/Card.                                                                                                                                                    |
| **react-email**                               | §3, S, 🔥🔥   | дні     | Не в `package.json`. У вас є Resend SDK (`apps/server/`), шаблони — імовірно raw HTML.                              | 🟡 **Modest miss.** Окуповується від 4-го листа.                                                                                                                                                                                    |
| **Chart library (Recharts / Nivo / ECharts)** | §8, S–M, 🔥🔥 | дні     | Жодної chart-ліби в `package.json`.                                                                                 | 🟡 **Real loss, якщо у вас немає власної SVG-візуалізації.** Потребує додаткової перевірки `apps/web/src/shared/charts/` — якщо там нуль, це серйозно.                                                                              |
| **apple-health (Expo)**                       | §7, M, 🔥🔥🔥 | тижні   | Не в `apps/mobile/package.json`.                                                                                    | 🟡 **Killer-feature miss за помірну ціну.** Fizruk без HealthKit = ручний ввід кожного воркаута; iOS-юзери звикли до синхронного перегляду в інших додатках.                                                                        |
| **PostHog Feature Flags**                     | §11, S, 🔥🔥  | години  | ✅ Адопчено (`apps/web/src/core/lib/featureFlags.ts`, `apps/mobile/src/core/lib/featureFlags.ts`, тести і wrapper). | ✅ **Done.** Не follow-up, фіксую факт.                                                                                                                                                                                             |
| **TanStack Router**                           | §6, L         | тижні   | React Router залишається.                                                                                           | ⚪ **Hold.** Правильно відклали — XL рефактор без тригера. Reconsider при наступному великому routing-redesign.                                                                                                                     |
| **Hono**                                      | §12, XL       | місяці  | Express + helmet залишається.                                                                                       | ⚪ **Hold.** Express не є боттлнеком; замінювати без триґера — overengineering.                                                                                                                                                     |
| **pg-boss**                                   | §5, M         | тижні   | У вас **BullMQ + ioredis** (`apps/server/package.json`).                                                            | 🔵 **Mild miss за схему «менше інфри».** pg-boss дав би одну менше залежність (drop Redis для job-queue). Якщо Redis ще для чогось треба (rate-limit, cache) — ок; інакше pg-boss був би чистіший. Перевірити, для чого ще Redis.   |
| **SQLocal / PGlite**                          | §15, M        | тижні   | Лишається `sqlite-wasm` + OPFS-SAH.                                                                                 | 🔵 **Tier 3 reconsider при Stage 12+.** PGlite — Postgres у WASM (250kb) — буквально та сама схема, що на сервері. Позбулися б дуального Drizzle (`packages/db-schema/src/sqlite/` + `pg/`). Зараз торкатись мід-Stage 10 — суїцид. |
| **Devcontainer**                              | §17           | дні     | Немає `.devcontainer/`. `bootstrap.mjs` + Dockerfile є.                                                             | ⚪ **Optional.** Нагода для нових девів, не критично.                                                                                                                                                                               |
| **fishery + faker**                           | §13           | дні     | Не в deps. У вас Testcontainers + MSW.                                                                              | ⚪ **Marginal.**                                                                                                                                                                                                                    |

### Ранг для Tier 1–3 списку

#### Tier 1 (зробити цього тижня)

1. **Anthropic `strict: true`** на existing tool definitions у `apps/server/src/modules/chat/`. Це години, не дні. Знімає клас bug-ів `#261 "Unknown action"` (коли `max_tokens` обрізає JSON) — він явно згаданий у TR-26-05 §9 як активний irritant.
2. **UptimeRobot** на `/health` + `/healthz` (free tier, 50 monitors, 5-min interval). Алерт у Telegram через `tools/openclaw`-bot або через webhook.

#### Tier 2 (цього кварталу)

3. **CVA** на Button / Badge / Card як стартова точка. Інкрементально на нових/рефакторених компонентах. Mention в TR-26-05 §2 уже є, треба «just do it».
4. **Chart library** — спочатку перевірити, чи є щось у `apps/web/src/shared/charts/` або `apps/web/src/core/charts/`. Якщо є власне — лишити; якщо немає — Recharts (25k ⭐, найпопулярніший в React-екосистемі, добре працює з SSR-stub).
5. **apple-health** — за наявністю iOS-build піпelaйну (Expo prebuild + EAS). Permissions UI + основні quantity types (steps, heart rate, calories, weight, workouts) → Fizruk. Сценарій: «I track my workouts in Apple Watch; Sergeant побачить їх автоматично».

#### Tier 3 (reconsider при Stage 12+)

6. **PGlite** замість sqlite-wasm — уніфікація схеми (одна Drizzle-конфігурація на Pg + WASM Pg).
7. **CR-SQLite** — якщо CloudSync writer почне зашиватись на op-log compaction.

---

## 3. «🚫 НЕ рекомендую» з TR-26-05 — рішення правильні

Розділ TR-26-05 «Що НЕ рекомендую» (тaблиця в кінці): **усі 7 правильно відкинуті**.

| Тулза          | Чи правильно | Коментар                                                                                                                                                                                      |
| -------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **tRPC**       | ✅           | Ваш zod-to-openapi pipeline (`scripts/api/generate-openapi.mjs`) дає end-to-end типізацію + працює з не-TS клієнтами (Telegram bot, мобільні нативні модулі). tRPC замкнув би API на TS-only. |
| **GraphQL**    | ✅           | Однозначно overkill для single-client SPA + один backend.                                                                                                                                     |
| **Lerna**      | ✅           | Dead, Turborepo вже є.                                                                                                                                                                        |
| **Next.js**    | ✅           | SPA-архітектура з окремим API — свідомий вибір (ADR-0011 local-first). Next.js поверне server-first.                                                                                          |
| **Prisma**     | ✅           | Drizzle глибше інтегрований; multi-DB (Pg + SQLite) — Prisma слабший.                                                                                                                         |
| **Million.js** | ✅           | React Compiler (React 19) це закриє системно.                                                                                                                                                 |
| **Chromatic**  | ✅           | Argos = same job, без $149/міс.                                                                                                                                                               |

### Що б я підсилив у «🚫 НЕ рекомендую» секції TR-26-05

- **Drizzle Kit migrations** як заміна `apps/server/src/migrations/NNN_*.sql` — НЕ робити. Ваші ручні SQL-файли + `apps/server/migrate.mjs` дають точний control над `CREATE EXTENSION vector` (міграція 025), two-phase DROP (rule #4 у `AGENTS.md`), partition-routines (`module_data`). Drizzle Kit за-абстрагує це на свою шкоду.
- **Biome** як заміна ESLint+Prettier — не зараз. Ваш ESLint ecosystem (eslint-plugin-sergeant-design + 14 кастомних `lint:*` скриптів у `package.json`) надто глибокий, Biome ще не покриває все.
- **Bun runtime** для Express — Node 20 + pnpm 9 = production-stable. Bun ще rough на edge cases (нативні addons, Node test runner compat). Reconsider при Node 24.

---

## 4. Доповнення з awesome-selfhosted (не з TR-26-05)

Те, що **взагалі не оглянуто** у TR-26-05, але дотичне:

### LLM observability

- **Langfuse** ([langfuse.com](https://langfuse.com)) — observability для LLM-викликів. Трасування Anthropic tool-calls, токени, латенсі, eval-и tool-handler-ів. Прямо лягає на `apps/server/src/modules/chat/` і `apps/web/src/core/lib/chatActions/`. Замінює сирі логи в Sentry для AI-частини. Self-hostable. **🟡 Tier 2 — серйозний reconsider.** Без нього ви сліпі по cost / latency / quality regressions у HubChat.
- **LiteLLM** — proxy перед Anthropic / Voyage / локальними моделями. Дає budget guardrails, fallback (Anthropic ↔ OpenAI), кешування. **⚪ Optional.** Корисно якщо колись захочете мульти-provider.

### Storage / медіа

- **MinIO / Garage / SeaweedFS** — S3-сумісний об'єктний стор. Логічний дім для аудіо в `transcribe`, фото меню/штрих-кодів у `nutrition`, експортів `digest` / `topic-archive`, бекапів Postgres. Поки Railway volumes / inline base64 / Resend attachments — ок, але масштабом 10k юзерів треба буде. **🔵 Tier 3.**

### Marketing / launch

- **Listmonk** — self-hosted email-маркетинг. Окремо від Resend (transactional). Корисно для FTUX drip + launch announcement + waitlist outreach. **🟡 Tier 2 при підході до launch.**

### Backups

- **Restic + Backrest** (UI) — щоденні шифровані бекапи Postgres → S3/MinIO/B2. Backrest дає cron + WebUI. **🟡 Перед запуском billing-модуля.** Зараз Railway автоматично робить snapshots, але explicit off-platform backup треба для DR.
- **pgBackRest** — спеціалізовано під Postgres, PITR, дельта-бекапи. Reconsider при > 10GB БД.

---

## 5. Methodology

Аналіз робився на знімку репо `2026-05-09 17:31 +0300` (commit `8df1db6f`) — після ландінгу Stage 10 PR #2279 / #2280.

Перевірочні команди (відтворювано):

```bash
# Чи є CVA у будь-якому workspace
grep -rn '"cva"\|class-variance-authority' --include=package.json

# Чи прописано Anthropic strict: true у chat module
grep -rn 'strict:\s*true\|"strict":\s*true' apps/server/src/modules/chat/

# Які uptime-провайдери реально сконфігуровані (а не тільки в планах)
grep -rln 'UptimeRobot\|Better Stack\|uptime-kuma' apps/ ops/

# Чи є chart-ліба
grep -E 'recharts|nivo|apexcharts|echarts|"victory"|chart\.js|"d3"' \
  --include=package.json -rn

# Чи є HealthKit на mobile
grep -rln 'apple-health\|HealthKit\|expo-health' apps/mobile/

# Чи фактично адопчено PostHog Feature Flags (не просто SDK)
grep -rln 'featureFlag\|isFeatureEnabled\|getFeatureFlag' apps/
```

Результати:

- **Адопчено:** PostHog Feature Flags (`apps/web/src/core/lib/featureFlags.ts`, `apps/mobile/src/core/lib/featureFlags.ts` + тести).
- **Не адопчено:** CVA, react-email, pg-boss, TanStack Router, Hono, SQLocal/PGlite, Devcontainer, fishery+faker, apple-health, chart-library, Anthropic `strict: true`, UptimeRobot.
- **У `tools/openclaw` / `apps/server`:** BullMQ + ioredis (Redis-залежність — рішення проти pg-boss).

---

## 6. Що далі

- **Q3 2026 review (заплановано 2026-08-07).** До того часу: підтвердити Tier 1 (strict + UptimeRobot), почати Tier 2 (CVA, chart, apple-health).
- **Storage Stage 12+ trigger.** Якщо реалізуються критерії з § 1 (MAU > 5k OR op-log compaction > 500 рядків) — re-evaluation PowerSync / CR-SQLite / PGlite як пакета.
- **TR-26-05 update.** Додати CR-SQLite (§1.1), оновити ElectricSQL опис (нова read-only-Shapes-модель), додати § «🚫 НЕ рекомендую» з: Drizzle Kit migrations, Biome, Bun runtime.

---

## 7. Cross-links

- [`tools-research-2026-05.md`](./tools-research-2026-05.md) — основний research-довідник, який цей документ доповнює.
- [`dev-stack-roadmap.md`](./dev-stack-roadmap.md) — живий журнал стеку, де адопчені тулзи фіксуються.
- [`storage-roadmap.md`](./storage-roadmap.md) — roadmap до Stage 14, тут же зафіксовано рішення проти ElectricSQL/PowerSync.
- [`docs/adr/0011-local-first-storage.md`](../adr/0011-local-first-storage.md) — фундамент, чому sync-engines з server-authoritative моделлю не вписуються.
- [`docs/initiatives/archive/_0004-server-observability.md`](../initiatives/archive/_0004-server-observability.md) — Uptime Kuma / UptimeRobot згадка з лютого.
