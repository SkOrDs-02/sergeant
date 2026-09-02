# ADR-0065: sync_op_log retention/архівація + multi-instance fan-out (план PR-050)

- **Status:** Accepted
- **Date:** 2026-06-07
- **Accepted:** 2026-06-07 (PR-носій злито; план чинний: `syncV2Stream.ts` і `backend.md` посилаються на нього як на рішення, клієнтський TTL у коді)
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`docs/90-work/audits/2026-08-XX-sync-engine-roast.md`](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/audits/archive/2026-08-XX-sync-engine-roast.md) — DLQ-TTL + transaction-boundary trace
  - [`docs/90-work/tech-debt/backend.md`](../../90-work/tech-debt/backend.md) § "Database & migrations review" (PR-050 backlog)
  - [`docs/90-work/planning/storage-roadmap.md`](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/planning/archive/storage-roadmap.md) — Stage 5 SSE / Stage 8–9 mobile dual-write
  - [`docs/04-governance/adr/0047-cloudsync-v1-410-gone.md`](./0047-cloudsync-v1-410-gone.md) — v1 sunset (retry-семантика)
  - [`apps/server/src/modules/sync/syncV2Stream.ts`](../../../apps/server/src/modules/sync/syncV2Stream.ts) — in-process fan-out
  - [`packages/db-schema/src/sqlite/syncOpOutboxPurgeStale.ts`](../../../packages/db-schema/src/sqlite/syncOpOutboxPurgeStale.ts) — client-side DLQ TTL (already shipped)

---

## Context and Problem Statement

Sync-engine v2 тримає **серверний append-only журнал** `sync_op_log` (Postgres) як
source-of-truth для крос-девайс реплею, плюс **клієнтську чергу** `sync_op_outbox`
(SQLite) для офлайн-push. Два пов'язані пункти боргу зведено в roadmap PR-050 і
повторно зафіксовано в sync-engine-roast аудиті:

1. **Real-time fan-out прив'язаний до одного процесу.** `syncV2Stream.ts` роздає
   applied-ops відкритим SSE-підпискам через **in-process `EventEmitter`**
   (`opLogEmitter`). Це коректно лише поки бекенд — single-instance. Бекенд Sergeant-а
   зараз на **одному Hetzner/Coolify інстансі** ([ADR-0074](./0074-hosting-hetzner-coolify.md)),
   тому fan-out тривіальний; але горизонтальне масштабування зламає його: підписка на інстансі A не побачить
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
   operational surface (ще один сервіс у stack, ще один SPOF/секрет).

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
   якої немає в керованому Coolify-Postgres за замовчуванням.

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

- **Тригер реалізації** (будь-що з): backend виходить за межі single-instance
  (Coolify horizontal scale / другий VPS)
  (горизонтальне масштабування) АБО `/pull` p95 / розмір `sync_op_log`
  перетинає бюджет (приклад-орієнтир: > ~10 млн рядків або вимірна регресія
  `/pull` p95). Owner: `@Skords-01`.
- Будь-яка майбутня partition-міграція проходить **Hard Rule #4** (послідовна
  нумерація, two-phase для DROP) + `pnpm lint:migrations`.
- Cursor-safety інваріант retention-задачі мусить мати regression-тест
  (офлайн-девайс за hard-floor не втрачає ops) до merge реалізації.

## Links

- [`apps/server/src/modules/sync/syncV2Stream.ts`](../../../apps/server/src/modules/sync/syncV2Stream.ts) — `opLogEmitter` (TODO → ця ADR)
- [`apps/server/src/modules/sync/audit.ts`](../../../apps/server/src/modules/sync/audit.ts) — нереалізований retention-намір
- [`docs/90-work/tech-debt/backend.md`](../../90-work/tech-debt/backend.md) — PR-050 беклог
- [`docs/90-work/audits/2026-08-XX-sync-engine-roast.md`](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/audits/archive/2026-08-XX-sync-engine-roast.md) — джерело findings

## Addendum (2026-08-04, pre-beta schema-debt audit)

Задача: реалізувати схему партиціювання ЗАРАЗ, поки `sync_op_log` порожня
(pre-beta wipe) — на позір ідеальний момент, бо `CREATE TABLE ... PARTITION
BY` на порожній таблиці не несе жодного з ризиків "перестворення гарячої
таблиці", які ця ADR наводить як причину відкладення (§ "Партиціювання
відкладено").

**Рішення міграційного аудиту: НЕ реалізовувати native-партиціювання
зараз.** Причина — не операційна (порожня таблиця знімає саме той ризик),
а структурна, і вона переживає wipe:

- Postgres вимагає, щоб **кожен** unique/PK-констрейнт партиційованої
  таблиці включав колонку партиціювання. `sync_op_log` має
  `UNIQUE (user_id, idempotency_key)` — це LOAD-BEARING backstop проти
  конкурентного дубль-інсерту (два запити з одним ідемпотентним ключем,
  що проходять `SELECT`-перевірку одночасно в `syncV2.ts` до того, як
  жоден не закомітився: другий INSERT сьогодні падає з 23505 і транзакція
  апаратно відкочується).
- Партиціювання по `server_ts` (найближчий кандидат на "created_at")
  змусило б розширити той UNIQUE до
  `(user_id, idempotency_key, server_ts)`. **Виправлення (CodeRabbit
  PR #627 review):** попередня версія цього абзацу стверджувала, що
  `server_ts` "унікальний для кожного рядка за побудовою (`DEFAULT NOW()`
  при вставці)" — це невірно. `NOW()` повертає час старту ТРАНЗАКЦІЇ, а не
  моменту виконання конкретного `INSERT`, тож два конкурентні `INSERT`-и
  можуть отримати як однаковий, так і різний `server_ts` — жодної гарантії
  унікальності `DEFAULT NOW()` не дає. Реальна проблема глибша: розширений
  констрейнт ніколи не спрацює як backstop НЕЗАЛЕЖНО від того, збігаються
  timestamps чи ні — щойно `server_ts` стає частиною UNIQUE-кортежа, два
  рядки з ОДНАКОВИМ `(user_id, idempotency_key)` можуть співіснувати за
  РІЗНИХ timestamps (а якщо вони до того ж збіглись — тим більше). Обидва
  конкурентні INSERT-и проходять, і apply-шлях виконується ДВІЧІ для
  одного ідемпотентного ключа. Це не гіпотетичний edge-case: це рівно
  сценарій, який ідемпотентність мала гарантувати (client retry, що
  обжинає у гонку з first-attempt).
- Це фундаментальне обмеження native declarative partitioning у Postgres
  (з v10), не деталь SQL — обійти його можна лише винесенням
  ідемпотентність-контролю в окрему, НЕпартиційовану таблицю
  (`sync_op_idempotency(user_id, idempotency_key) UNIQUE`, перевірена в
  тій самій транзакції), що є окремим, більш ризикованим архітектурним
  рішенням, а не "просто додати партицію".

Тому: партиціювання (Вісь B, опція 3) лишається відкладеним рівно з тієї ж
причини, що й раніше — ризик, лише зміщений з "перестворення гарячої
таблиці" на "постійне ослаблення idempotency-backstop-у для кожного
майбутнього рядка". Порожність таблиці на момент міграції прибирає
ПЕРШИЙ ризик, але не другий. Retention-purge за курсором (Вісь B, опція 2) лишається так само нереалізованою — це прикладний job з
крос-девайс cursor-tracking (`min(cursor)` по всіх пристроях юзера), не
DDL, тож "реалізувати схему зараз, поки таблиця порожня" тут не
застосовний аргумент: логіка job-у не залежить від того, скільки рядків
у таблиці зараз.

Жодних схемних змін до `sync_op_log` цим аудитом не внесено.
Fan-out (`LISTEN`/`NOTIFY`) і retention-purge лишаються майбутньою
роботою за тим самим тригером, що й раніше (§ Compliance вище).
