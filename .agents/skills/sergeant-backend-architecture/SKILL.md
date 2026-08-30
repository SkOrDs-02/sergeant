---
name: sergeant-backend-architecture
description: Use when designing a new Sergeant server module, choosing sync-vs-queue, adding a background job, or judging a proposal to add a service/CQRS layer; UA: архітектура бекенду, новий модуль, фонова черга.
lang: uk
lang-reason: Body is Ukrainian per Hard Rule #15 (internal docs in Ukrainian); the `description:` carries an EN trigger phrase plus the `; UA:` clause so tool-routing stays stable across LLM providers whose attention biases toward English. See `sergeant-writing-skills` § Грамар.
---

# Backend architecture у Sergeant

Sergeant — **Express 5 моноліт** з пласкими модулями, а не мікросервіси. Цей skill існує, бо агенти регулярно приносять сюди generic-архітектуру (Clean/Hexagonal шари, CQRS, Event Sourcing, Temporal, Saga) і починають створювати `domain/`, `use-cases/`, `adapters/` директорії, яких у репо **не існує**. Твоя робота — вписатись у наявну конвенцію, а не принести нову.

## Реальна архітектура (перевір, перш ніж проєктувати)

- **Точка входу:** `apps/server/src/index.ts` → `app.ts` (Express 5).
- **Модулі:** `apps/server/src/modules/<domain>/**` (`finyk`, `nutrition`, `chat`, `mono`, `billing`, `sync`, `push`, `digest`, `ai-memory`, `alerts`, `waitlist`, `webhooks`, …). Кількість модулів дрейфує — перевір `ls apps/server/src/modules/`, не бери з памʼяті. Модуль **плаский**: один файл = один use-case (`analyze-photo.ts`), поряд лежить `analyze-photo.test.ts`. Жодних `domain/` / `use-cases/` / `adapters/` / `infrastructure/` підпапок.
- **Роути:** `apps/server/src/routes/**`, монтуються через `routes/index.ts`. Роут — тонкий: валідація + виклик модуля + серіалізація.
- **Серіалізатори:** `apps/server/src/lib/normalizers/*.ts`.
- **БД:** `pg` Pool (`db.ts`) + `drizzle-orm` поверх того самого пулу (`drizzle.ts`) — **обидва шляхи живі** (див. § Два шляхи до БД). Опційна read-репліка — `dbReplica.ts` (opt-in, лише analytics-style читання).
- **Черги:** `bullmq` + `ioredis` — `apps/server/src/lib/jobs/` (`connection.ts`, `authMail.ts`, `ftuxDrip.ts`) і модульна `modules/ai-memory/ingestQueue.ts`.
- **Логування:** `pino` (`obs/logger.ts`) з redaction-політикою (Hard Rule #21).
- **Схеми:** `zod` — канонічні у `@sergeant/shared/schemas`.

Чого в репо **немає**: Temporal, Event Sourcing, Saga-оркестратора, CQRS read/write моделей, мікросервісів. Не проєктуй під них і не описуй їх як наявні.

## Рішення, які цей skill приймає

### 1. Новий модуль чи розширення наявного?

Новий каталог у `modules/` — лише коли з'являється **власна доменна сутність зі своїм сховищем**. Нова ручка над наявною сутністю — це новий файл у наявному модулі. Ознака помилки: модуль без власних таблиць, який лише перекладає виклики в інший модуль.

### 2. Синхронно чи в чергу?

У чергу (`lib/jobs/` через bullmq), якщо виконується будь-що з:

- робота > ~1 с або залежить від стороннього API з непередбачуваною латентністю (LLM, пошта, транскрипція);
- користувачу не потрібен результат у тій самій відповіді;
- потрібен ретрай без повторного запиту клієнта.

Інакше — синхронно в handler-і. Кожен job **ідемпотентний**: bullmq ретраїть, тож повторне виконання не має дублювати запис (унікальний ключ або upsert).

### 3. Коли модуль треба різати

Hard Rule #18 — `max-lines: 600` для server TS/JS. Ріж по use-case-ах (ще один плаский файл), а не вводом шарів. Якщо різати нема по чому — це сигнал, що модуль тримає дві сутності; тоді дивись `sergeant-monorepo-boundaries`.

## Два шляхи до БД (не плутай)

`drizzle.ts` обгортає **той самий** `pg` Pool, тому в репо співіснують:

- **raw parameterized `pg`** — більшість модулів (`ai-memory`, `logRetention`, …): `pool.query('… WHERE id = $1', [id])`.
- **Drizzle ORM** — waitlist, auth-суміжні таблиці, типізовані читання.

Обидва легітимні; **новий код тримайся стилю сусідніх файлів модуля**. Для аудиту це означає, що перевіряти треба обидві поверхні — SQL-ін'єкція можлива і в raw-рядку, і в `sql``` `-шаблоні. Те саме формулювання є у `sergeant-security-audit` і `sergeant-data-and-migrations`.

## Hard Rules, які тут найчастіше ламають

- **#1** — `bigint` → `number` у серіалізаторі ([Rule #1](../../../docs/04-governance/governance/rules/01-db-types-coerce-bigint-to-number.md)).
- **#3** — форма відповіді, `packages/api-client` і contract-тест рухаються одним PR.
- **#18** — 600 рядків на модуль-файл.
- **#21** — pino redaction на кожній новій поверхні логування.
- **ADR-0078** — межа доби: device-local для особистих сутностей, Kyiv для звітів. Деталі — у `sergeant-server-api`.

## Червоні прапорці в пропозиціях

- «Винесемо в окремий сервіс / додамо Kafka / зробимо CQRS» — на поточній стадії майже завжди ні. Спершу: індекс, черга, кеш.
- «Створимо `domain/` і `use-cases/` для чистоти» — конвенція репо пласка; такий PR розсинхронить усі модулі (перевір актуальну кількість — `ls apps/server/src/modules/`).
- Новий job без ідемпотентності або без ретрай-політики.
- Нова таблиця без міграції в тому ж PR → `sergeant-data-and-migrations`.

## Куди роутити далі

- Роути, серіалізатори, контракт, api-client → `sergeant-server-api`
- SQL-схема, міграції, індекси → `sergeant-data-and-migrations`
- HubChat tool-defs і executor-и → `sergeant-module-ai`
- Розміщення коду між app і package → `sergeant-monorepo-boundaries`
- Деплой, env, health, Coolify → `sergeant-deploy-and-observability`

## Playbooks

- [`docs/00-start/playbooks/add-api-endpoint.md`](../../../docs/00-start/playbooks/add-api-endpoint.md) — handler + route + api-client + тести синхронно.
- [`docs/00-start/playbooks/add-sql-migration.md`](../../../docs/00-start/playbooks/add-sql-migration.md) — коли модулю потрібна схема.
- [`docs/00-start/playbooks/onboard-external-api.md`](../../../docs/00-start/playbooks/onboard-external-api.md) — інтеграція стороннього API (кандидат на чергу).
- Каталог: [`docs/00-start/agents/agent-skills-catalog.md`](../../../docs/00-start/agents/agent-skills-catalog.md).
