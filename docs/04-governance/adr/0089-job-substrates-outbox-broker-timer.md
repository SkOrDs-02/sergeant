# ADR-0089: Субстрати фонових задач — outbox vs broker vs timer

- **Status:** Accepted
- **Date:** 2026-08-28
- **Accepted:** 2026-08-28 (PR-носій злито; обидва борги закриті в ньому, код цитує таблицю субстратів як чинну)
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [ADR-0016](./0016-user-deletion-and-pii-handling.md) §ADR-6.3 — обґрунтування таблиці `gdpr_cleanup_queue` (outbox для зовнішніх cleanup-ів, audit-предикат `completed_at IS NULL AND attempts > 5`)
  - [ADR-0065](./0065-sync-op-log-retention-and-multi-instance-fanout.md) — Postgres замість Redis для координації; single-instance ратифіковано, тригер перегляду у § Compliance
  - [ADR-0074](./0074-hosting-hetzner-coolify.md) — один VPS (Hetzner + Coolify), горизонтальне масштабування поза scope
  - [`apps/server/src/lib/reminders/sweep.ts`](../../../apps/server/src/lib/reminders/sweep.ts) — розгорнутий аргумент «таймер, не BullMQ»
  - [`apps/server/src/modules/mono/enrichmentWorker.ts`](../../../apps/server/src/modules/mono/enrichmentWorker.ts) — обґрунтування polling-outbox
  - [`docs/01-product/launch/tech/ai-memory-activation.md`](../../01-product/launch/tech/ai-memory-activation.md) § Redis startup configuration — Redis у проді ефемерний (`--appendonly no --save ""`)

---

## Context and Problem Statement

В `apps/server` сьогодні працюють **пʼять** механізмів фонових задач, і жоден із них не зʼявився за спільним рішенням — кожен виріс під свою фічу:

1. **BullMQ/Redis-черги** у тому ж процесі сервера: `lib/jobs/authMail.ts`, `lib/jobs/ftuxDrip.ts`, `modules/ai-memory/ingestQueue.ts` (зʼєднання — `lib/jobs/connection.ts`).
2. **Postgres-outbox з in-process poller-ом**: таблиця `mono_ai_enrichment_queue` (міграція 013) + `modules/mono/enrichmentWorker.ts` / `batchEnrichmentWorker.ts`. Enqueue відбувається **всередині** DB-транзакції webhook-а (`modules/mono/webhook.ts`, `BEGIN…COMMIT` разом з upsert-ом транзакції; FK з `ON DELETE CASCADE`).
3. **Postgres-outbox із зовнішнім тригером**: `gdpr_cleanup_queue` (ADR-0016 §ADR-6.3) — batch-обробка через `modules/gdpr/cleanupWorker.ts`, якого досі смикав лише зовнішній виклик; власний poller для неї додається окремою гілкою паралельно з цим ADR (це рішення тут ратифікується, але не імплементується).
4. **In-memory масив**: `lib/mcc/unknownQueue.ts` — буфер unknown-MCC для hourly-batch, із задокументованим single-replica припущенням (`unknownQueue.ts:9-12`).
5. **Шість `setInterval`-шедулерів**: `modules/billing/plataScheduler.ts`, `modules/silpo/syncScheduler.ts`, `modules/webhooks/retentionPoller.ts`, `modules/logRetention/archivePoller.ts`, `lib/reminders/scheduler.ts`, `obs/anthropicBudgetGuard.ts`.

Симптом того, що рішення бракує: аргумент «чому саме цей субстрат» коментарі виводять заново щонайменше **тричі** — `lib/reminders/sweep.ts:15-34` + `nudge.ts:20-37` (таймер-не-BullMQ), `modules/mono/enrichmentWorker.ts:17-24` (polling-outbox), `modules/silpo/syncAll.ts` (n8n-cron-скан). І один із цих виводів **фактично застарів**: `syncAll.ts:16` стверджував, що «жодного BullMQ-воркера в кодовій базі немає» — неправда з моменту появи `authMail`/`ftuxDrip`/`ai-memory-ingest` (виправлено в цьому ж PR). Кожен новий агент чи інженер, що заводить фонову задачу, змушений реконструювати trade-off простір з нуля — і час від часу реконструює його неправильно.

Важливий інфраструктурний факт для будь-якого вибору: Redis у проді **ефемерний** — `--appendonly no --save ""` (див. `ai-memory-activation.md` § Redis startup configuration), тобто рестарт Redis втрачає вміст черг. А деплой — один VPS, одна репліка API (ADR-0074).

## Considered Options

1. **Уніфікувати все на BullMQ** — одна черга для всього. Відпадає: enqueue не буває атомарним із доменним записом у Postgres (webhook-транзакція не може включати Redis), а ефемерний Redis робить брокер найменш довговічним субстратом у стеку.
2. **Уніфікувати все на Postgres-чергах** — outbox для всього. Відпадає: для дискретних задач без DB-звʼязку (лист після реєстрації) це зайва таблиця, міграція і poller там, де BullMQ дає retry/backoff/delay з коробки; а періодичні скани в чергу взагалі не мапляться.
3. **Таблиця вибору за формою роботи** (обрано) — ратифікувати фактичний поділ, який уже склався і вже має письмові обґрунтування в коді, і зафіксувати критерій вибору для нових задач.
4. **Нічого не робити** — trade-off простір і далі перевиводиться в коментарях, дрейфує (див. `syncAll.ts:16`) і не має single source of truth.

## Decision

Субстрат фонової задачі вибирається за **формою роботи**, ключове питання — перший стовпець:

| Питання про задачу                                                                                                    | Субстрат                                                            | Чинні приклади                                                                                      |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Enqueue мусить бути **атомарним із доменним записом** у Postgres (задача не має права загубитись, якщо запис пройшов) | **Postgres-outbox** (+ in-process poller, `FOR UPDATE SKIP LOCKED`) | `mono_ai_enrichment_queue` (enqueue у webhook-транзакції), `gdpr_cleanup_queue` (ADR-0016 §ADR-6.3) |
| **Дискретна retryable-одиниця** без звʼязку з DB-транзакцією, І втрата на рестарті Redis **прийнятна**                | **BullMQ** (Redis)                                                  | `auth-mail`, `ai-memory-ingest`; `ftux-drip` Day 0 (Day 1/3 — див. Відкрите питання)                |
| **Періодичний ідемпотентний скан**, дедуп якого вже живе у Postgres (`INSERT … ON CONFLICT` / claim-рядок)            | **In-process timer** (`setInterval` / self-scheduling `setTimeout`) | reminder sweep (`sweep.ts:15-34`), retention-poller-и, `plataScheduler`, silpo `syncAll` (n8n-cron) |

Логіка та сама, що вже записана у `sweep.ts`: **черга не додає гарантії, якої ще немає**. Якщо гарантію доставки дає Postgres (outbox-рядок або дедуп-INSERT), брокер — зайва точка відмови; якщо гарантія потрібна, а DB-звʼязку немає — брокер доречний; якщо робота — скан, а не задача, то чергою вона не є взагалі.

Фактичний поділ, що склався, **ратифікується як правильний**: mono-enrichment на outbox (атомарність із webhook-ом), `gdpr_cleanup_queue` як таблиця з ADR-0016 (поллер до неї — правильне доповнення, їде окремою гілкою), reminder sweep на хвилинному таймері з дедупом у `push_reminder_log`.

### Зафіксовані борги (стан на 2026-08-28)

1. **plataScheduler double-charge** — `chargeDuePlataSubscriptions` не мав жодного lock-у (`plataScheduler.ts:78-119` до правки): два одночасні прогони списали б ту саму підписку двічі. Дефект був сплячим лише тому, що `PLATA_ENABLED=false` (`env/env.ts:~424`). **Виправлено в цьому PR**: claim через `FOR UPDATE OF s SKIP LOCKED` + charge/UPDATE у одній транзакції (дзеркало `gdpr/cleanupWorker.ts::claimBatch`).

   **Оновлення 2026-09-01 (`docs/90-work/planning/specs/archive/plata-recurring.md`):** цей приклад більше не чинний — `plataScheduler.ts` і самокероване списування видалені, Plata перейшла на нативні monobank `subscription/*`. Звірка (`plataSync.ts`) читає стан, а не рухає гроші, тож claim-транзакція описана вище їй не потрібна (read-only, ідемпотентна за побудовою). Рядок таблиці §Decision («періодичний ідемпотентний скан → in-process timer») лишається чинним для нового поллера, лише приклад-посилання застарів.

2. **Mono-enrichment: застряглі `processing`-row-и** — `PICK_BATCH_SQL` вибирав лише `pending|failed`, тож row, що лишився у `processing` після kill процесу (failure mode був названий у коментарі self-scheduling loop-у), висів вічно; reaper-а не було. **Виправлено в цьому PR**: PICK підбирає також `processing`-row-и, старші за stale-поріг (15 хв; 4 × `MCC_BATCH_INTERVAL_MS` при увімкненому hourly-буфері), `attempts` при цьому не втрачаються.
3. **`unknownQueue` втрачає вміст на деплої** — свідоме single-replica/in-memory припущення (`unknownQueue.ts:9-12`); втрачені item-и тепер повертає stale-reaper (борг №2), тож ціна — лише затримка. Припущення лишається боргом: при 2+ репліках буфер треба переносити у Redis/DB.
4. **FTUX-drip Day 1/Day 3 на ефемерному Redis** — відкрите питання нижче.

### Відкрите питання: субстрат FTUX-drip Day 1/Day 3

Delayed-job-и на 24/72 години (`ftuxDrip.ts:16,22-24`) лежать у BullMQ поверх Redis із `--appendonly no --save ""` — **durability-чутлива задача на найменш довговічному субстраті стеку**: будь-який рестарт Redis у 72-годинному вікні мовчки зʼїдає лист. Опції:

- **(а)** Увімкнути Redis AOF (`--appendonly yes`) на Coolify — інфраструктурна дія власника поза репо; лишає задачу на BullMQ, але робить увесь Redis повільнішим/дисковішим заради однієї черги, і рестарт контейнера без volume все одно втрачає стан.
- **(б)** Перенести Day 1/Day 3 з delayed-job-ів на DB-рядок (дата надсилання у Postgres), який підмітає вже наявний хвилинний таймер reminder-sweep — за таблицею вище це і є «періодичний скан із дедупом у Postgres».

**Рекомендація** (не рішення): (б) — вона узгоджена з таблицею цього ADR і з прецедентом `nudge.ts` (D8 теж вимагав BullMQ, а зійшлись на sweep). Рішення за founder-ом; **станом на цей ADR founder-рішення не існує**, задача лишається на BullMQ.

## Rationale

- Три незалежні письмові виводи в коді (`sweep.ts`, `enrichmentWorker.ts`, `syncAll.ts`) зійшлись на одному критерії — форма роботи + де живе гарантія. ADR лише піднімає його з коментарів у governance, щоб четвертого виводу не було.
- Атомарність enqueue-у з доменним записом фізично недосяжна для брокера (Redis не учасник Postgres-транзакції) — тому перший рядок таблиці не має альтернатив.
- Ефемерність прод-Redis — виміряний факт конфігурації, а не думка; він і робить «втрата прийнятна» обовʼязковою умовою для BullMQ-рядка.
- Single-instance (ADR-0074) робить in-process таймери достатніми; таблиця свідомо не заводить зовнішній шедулер «на виріст» (той самий принцип, що в ADR-0065: жодної інфраструктури проти неіснуючого multi-instance).

## Consequences

### Positive

- Новій фоновій задачі більше не треба реконструювати trade-off: один погляд у таблицю.
- Podвійне списання Plata неможливе навіть при перетині tick-ів / другій інстанції; enrichment-row-и більше не застрягають у `processing` назавжди.
- Стейл-коментар `syncAll.ts:16` виправлено; доки (`runbook.md` `/health/workers`, `03-services-and-toolstack.md`) приведені до фактичного стану.

### Negative

- Пʼять механізмів лишаються пʼятьма — ADR ратифікує різноманіття, а не скорочує його; уніфікація була б окремим (і, за цим ADR, необґрунтованим) проєктом.
- FTUX-drip Day 1/Day 3 досі на ефемерному Redis, поки founder не вирішить відкрите питання.

### Neutral

- Жодних змін API-контрактів чи міграцій; reaper обійшовся наявними колонками міграції 013 (`updated_at`).
- `gdpr_cleanup_queue`-поллер їде паралельною гілкою і цим ADR лише ратифікується.

## Compliance

- **Тригер перегляду — той самий, що в ADR-0065 § Compliance:** backend виходить за межі single-instance (Coolify horizontal scale / другий VPS). Тоді переглянути: in-memory `unknownQueue` (борг №3), «worker у тому ж процесі» для BullMQ, і всі `setInterval`-шедулери без Postgres-claim-у.
- Нова фонова задача у PR — reviewer звіряє вибір субстрату з таблицею цього ADR; відхилення — з письмовим обґрунтуванням у PR-описі.
- Claim-патерн для конкурентних споживачів однієї таблиці — `FOR UPDATE SKIP LOCKED` у одній транзакції з обробкою (`gdpr/cleanupWorker.ts::claimBatch`, `plataScheduler.ts`, `PICK_BATCH_SQL`).
- Регресійні тести цього PR: `plataScheduler.test.ts` (claim у `BEGIN…COMMIT`, `FOR UPDATE OF s SKIP LOCKED`, ROLLBACK-шлях), `enrichmentWorker.test.ts` (reaper-гілка PICK, stale-поріг за замовчуванням і при hourly-буфері).

## Links

- [`apps/server/src/lib/reminders/nudge.ts`](../../../apps/server/src/lib/reminders/nudge.ts) — прецедент «спека вимагала BullMQ, обрали sweep» + застереження про застарілу підставу «Redis немає»
- [`apps/server/src/lib/jobs/ftuxDrip.ts`](../../../apps/server/src/lib/jobs/ftuxDrip.ts) — delayed Day 1/Day 3 (відкрите питання)
- [`apps/server/src/lib/mcc/unknownQueue.ts`](../../../apps/server/src/lib/mcc/unknownQueue.ts) — single-replica припущення
- [`apps/server/src/modules/silpo/syncAll.ts`](../../../apps/server/src/modules/silpo/syncAll.ts) — виправлений коментар про BullMQ-воркери
- [`docs/03-operations/observability/runbook.md`](../../03-operations/observability/runbook.md) § `/health/workers` — реальний payload (без `backgroundQueue`)
