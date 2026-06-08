# ADR-0065: sync_op_log retention/архівація + multi-instance fan-out (план PR-050)

- **Status:** Proposed <!-- Proposed | Accepted | Deprecated | Superseded by ADR-NNNN -->
- **Date:** 2026-06-07
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`docs/audits/2026-08-XX-sync-engine-roast.md`](../audits/2026-08-XX-sync-engine-roast.md) — DLQ-TTL + transaction-boundary trace
  - [`docs/tech-debt/backend.md`](../tech-debt/backend.md) § "Database & migrations review" (PR-050 backlog)
  - [`docs/planning/storage-roadmap.md`](../planning/storage-roadmap.md) — Stage 5 SSE / Stage 8–9 mobile dual-write
  - [`docs/adr/0047-cloudsync-v1-410-gone.md`](./0047-cloudsync-v1-410-gone.md) — v1 sunset (retry-семантика)
  - [`apps/server/src/modules/sync/syncV2Stream.ts`](../../apps/server/src/modules/sync/syncV2Stream.ts) — in-process fan-out
  - [`packages/db-schema/src/sqlite/syncOpOutboxPurgeStale.ts`](../../packages/db-schema/src/sqlite/syncOpOutboxPurgeStale.ts) — client-side DLQ TTL (already shipped)

---

## Context and Problem Statement

Sync-engine v2 тримає **серверний append-only журнал** `sync_op_log` (Postgres) як
source-of-truth для крос-девайс реплею, плюс **клієнтську чергу** `sync_op_outbox`
(SQLite) для офлайн-push. Два пов'язані пункти боргу зведено в roadmap PR-050 і
повторно зафіксовано в sync-engine-roast аудиті:

1. **Real-time fan-out прив'язаний до одного процесу.** `syncV2Stream.ts` роздає
   applied-ops відкритим SSE-підпискам через **in-process `EventEmitter`**
   (`opLogEmitter`). Це коректно лише поки бекенд — single-instance. Railway-сетап
   Sergeant-а зараз саме такий (один інстанс), тому fan-out тривіальний; але
   горизонтальне масштабування зламає його: підписка на інстансі A не побачить
   push, що прийшов на інстанс B.

2. **`sync_op_log` росте необмежено.** Журнал лише дописується; немає ні
   партиціювання, ні retention/архівації, ні серверного TTL-purge (коментар-намір
   є в `apps/server/src/modules/sync/audit.ts`, але не реалізований). На горизонті
   кварталів таблиця стає найбільшою у БД і тягне вниз `/pull`-курсорні сканування.

Третій, суміжний пункт — **client-side DLQ без TTL** — уже **закрито** окремо
(`purgeStaleTerminalOutbox`, див. Related); ця ADR його не дублює, лише фіксує як
завершену частину тієї ж теми.

**Чому це не «просто додати TTL».** `sync_op_log` — це не кеш, а журнал реплею.
Інший пристрій того ж користувача наздоганяє через `GET /api/v2/sync/pull?since=`
(`WHERE id > cursor … status='applied'`). Якщо видалити applied-ops лише за віком,
пристрій, що був офлайн **довше за retention-вікно**, мовчки пропустить ці ops —
silent data divergence без жодної помилки. Тому будь-який серверний retention
мусить рахуватися з **найповільнішим курсором серед пристроїв користувача**, а не
лише з віком рядка.

## Considered Options

### Вісь A — multi-instance fan-out

1. **In-process `EventEmitter` (статус-кво)** — нуль інфраструктури; працює лише
   single-instance.
2. **Postgres `LISTEN`/`NOTIFY`** — кожен інстанс `LISTEN`-ить канал, push робить
   `NOTIFY`; fan-out через ту саму БД, яка вже є. Без нової інфраструктури.
   Обмеження: payload `NOTIFY` ≤ 8 кБ, тому передаємо `op.id`, а не повний рядок
   (підписки добирають через `/pull` за `id`).
3. **Redis pub/sub** — окремий брокер; вищий throughput, але нова залежність і
   operational surface (ще один сервіс у Railway, ще один SPOF/секрет).

### Вісь B — ріст `sync_op_log`

1. **Do nothing (статус-кво)** — журнал росте; прийнятно поки рядків мало і
   `/pull` p95 у бюджеті.
2. **Retention-purge за курсором** — періодично видаляти applied-ops, які
   `id < min(cursor усіх живих пристроїв користувача)` **і** старші за hard-floor
   (напр. 90 днів); пристрої, чий курсор відстав за hard-floor, форсяться на повний
   re-sync (bootstrap pull). Без зміни форми таблиці.
3. **Нативне range-партиціювання** (`PARTITION BY RANGE (created_at)` помісячно) +
   `DROP PARTITION` для архівації — O(1) видалення старих вікон, кращі плани на
   часових діапазонах. Вимагає перестворення таблиці (Hard Rule #4 two-phase) або
   `pg_partman`.
4. **`pg_partman`-екстеншн** — автоматизує (2)/(3), але додає extension-залежність,
   якої немає в керованому Railway-Postgres за замовчуванням.

## Decision

**Відкласти важку реалізацію до реального тригера (нижче); зафіксувати цільову
архітектуру зараз, щоб TODO в коді й беклог посилалися на конкретний план.**

Коли тригер спрацює:

- **Fan-out → Postgres `LISTEN`/`NOTIFY`** (Вісь A, опція 2). Перевага над Redis:
  жодної нової інфраструктури/секрета; БД уже на гарячому шляху push-у. Передаємо
  `op.id` у `NOTIFY`-payload; SSE-хендлер добирає рядок звичайним шляхом. Redis
  переглянути лише якщо `NOTIFY`-throughput стане вузьким місцем (малоймовірно для
  поточного масштабу).
- **Ріст журналу → retention-purge за курсором (Вісь B, опція 2) як перший крок;**
  нативне партиціювання (опція 3) — лише якщо одного retention замало для
  `/pull`-планів. Retention-задача:
  - видаляє `status='applied'` ops, де `id < min(cursor)` по всіх пристроях юзера
    **і** `created_at < now() - RETENTION_HARD_FLOOR`;
  - **ніколи** не видаляє ops, новіших за найповільніший курсор (інакше офлайн-девайс
    пропустить їх) — це інваріант, який має пінитися тестом;
  - застарілі пристрої (курсор старший за hard-floor) детектуються і отримують
    `410 Gone`-стиль сигнал на повний bootstrap re-sync (узгоджено з механікою
    ADR-0047).

**Зараз (поза тригером)** реалізовано лише клієнтську частину — `purgeStaleTerminalOutbox`
(terminal DLQ-рядки старші за вікно; безпечно, бо термінальні рядки нікому не
потрібні для реплею). Серверний retention/партиціювання та `LISTEN/NOTIFY`
**не** реалізуються в цій ADR — це план, не імплементація.

## Rationale

- **`LISTEN/NOTIFY` > Redis** для нашого масштабу: вартість додаткового сервісу й
  секрета не виправдана, поки один Postgres легко тримає fan-out. Рішення оборотне —
  міграція на Redis пізніше локальна для `syncV2Stream.ts`.
- **Retention-за-курсором > наївний TTL**: єдиний варіант, що не ламає офлайн-девайси
  (див. Context). TTL-за-віком прийнятний лише для client DLQ, де немає других
  читачів — тому його вже й зроблено там, а не на сервері.
- **Партиціювання відкладено**: перестворення гарячої таблиці — ризик (Hard Rule #4
  two-phase), а виграш матеріальний лише на десятках млн рядків / multi-instance
  write-contention, чого зараз немає. Передчасне партиціювання — operational
  складність без виграшу.

## Consequences

### Positive

- Код-TODO (`syncV2Stream.ts`) і беклог (`backend.md` PR-050) тепер показують на
  конкретне рішення замість розмитого «колись».
- Зафіксовано cursor-safety інваріант — наступний реалізатор не зробить
  data-loss-помилку наївним TTL.
- Жодного передчасного коду/інфраструктури проти неіснуючого multi-instance деплою.

### Negative

- `sync_op_log` продовжує рости до тригера (прийнятно: моніториться, single-instance,
  обсяги малі).
- Multi-instance деплой **заблокований** до реалізації fan-out — задокументований,
  свідомий gate.

### Neutral

- Без зміни поточного API-контракту `/api/v2/sync/*` чи форми op-log payload.
- Client DLQ TTL (вже в коді) працює незалежно від цього плану.

## Compliance

- **Тригер реалізації** (будь-що з): Railway виходить за межі single-instance
  (горизонтальне масштабування) АБО `/pull` p95 / розмір `sync_op_log`
  перетинає бюджет (приклад-орієнтир: > ~10 млн рядків або вимірна регресія
  `/pull` p95). Owner: `@Skords-01`.
- Будь-яка майбутня partition-міграція проходить **Hard Rule #4** (послідовна
  нумерація, two-phase для DROP) + `pnpm lint:migrations`.
- Cursor-safety інваріант retention-задачі мусить мати regression-тест
  (офлайн-девайс за hard-floor не втрачає ops) до merge реалізації.

## Links

- [`apps/server/src/modules/sync/syncV2Stream.ts`](../../apps/server/src/modules/sync/syncV2Stream.ts) — `opLogEmitter` (TODO → ця ADR)
- [`apps/server/src/modules/sync/audit.ts`](../../apps/server/src/modules/sync/audit.ts) — нереалізований retention-намір
- [`docs/tech-debt/backend.md`](../tech-debt/backend.md) — PR-050 беклог
- [`docs/audits/2026-08-XX-sync-engine-roast.md`](../audits/2026-08-XX-sync-engine-roast.md) — джерело findings
