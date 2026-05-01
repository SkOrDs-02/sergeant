# ADR-0013: DB migrations conventions — sequential, forward-only, two-phase DROP

- **Status:** accepted
- **Date:** 2026-04-27
- **Reviewers:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`apps/server/src/migrations/`](../../apps/server/src/migrations/) — `001_noop.sql` … `021_governance_audit.sql`.
  - [`apps/server/build.mjs`](../../apps/server/build.mjs) — копіює міграції у `dist/` при білді.
  - [`docs/playbooks/add-sql-migration.md`](../playbooks/add-sql-migration.md) — authoring how-to.
  - [`docs/playbooks/pre-merge-migration-checklist.md`](../playbooks/pre-merge-migration-checklist.md) — review-чек-лист.
  - [`AGENTS.md`](../../AGENTS.md) §4 — hard rule "sequential, no gaps, two-phase DROP".
  - ADR-0009 — Railway pre-deploy hook.
  - ADR-0014 — bigint→number policy (пов'язана з `BIGINT` column-тип конвенціями).

---

## 0. TL;DR

`apps/server/src/migrations/` — **sequential, forward-only, application-deployed**
SQL-міграції. Пра́вила:

1. **Numbering**: `NNN_<short_snake_case>.sql` (001-… без пропусків).
2. **Idempotent**: кожна міграція може бути проведена кілька разів (`IF NOT EXISTS`,
   `pg_catalog`-guard-и для CHECK).
3. **Forward-only у проді**: Railway pre-deploy запускає міграції перед стартом
   нового контейнера. `down.sql` — **локальний інструмент для dev-rollback**,
   production його не виконує.
4. **Two-phase DROP**: колонка/таблиця видаляється **окремим релізом** після
   того, як код перестав нею користуватися.
5. **Tests are first-class**: `__tests__/rollback-sanity.test.ts` плюс
   integration-тести модулів ловлять schema-drift.

---

## ADR-13.1 — Sequential numbering без пропусків

### Status

accepted.

### Context

Популярні альтернативи для ID-нейммінгу міграцій:

| Стратегія               | Плюс                            | Мінус                                                   |
| ----------------------- | ------------------------------- | ------------------------------------------------------- |
| Sequential `NNN_*.sql`  | Порядок очевидний, простий sort | Merge conflicts якщо два PR одночасно додають `009_*`   |
| Timestamp `YYYYMMDDhh*` | Зникають merge-конфлікти        | Порядок у директорії нечитабельний, дебаг важчий        |
| UUID / slug             | Ніколи не колідують             | Немає природного порядку, треба окрема таблиця-metadata |

### Decision

**Sequential `NNN_<short_snake_case_desc>.sql`**, починаючи з `001_noop.sql`.
Поточний range — 001 до 021 (див.
[`apps/server/src/migrations/`](../../apps/server/src/migrations/)).
Реальний runner — [`apps/server/migrate.mjs`](../../apps/server/migrate.mjs) (Railway pre-deploy, читає
`fs.readdirSync().sort()`).

Правила:

- Номер — `NNN` (zero-padded до 3 цифр).
- Desc — snake_case, ≤ 5 слів.
- Run order — лексикографічний сорт (Postgres pg-migrate реалізація у
  [`apps/server/migrate.mjs`](../../apps/server/migrate.mjs) читає `fs.readdirSync().sort()`).

### Consequences

**Позитивні:**

- Merge-conflict на міграції = чіткий сигнал: "хтось інший теж додав `009_*` —
  координуйся". Це **feature**, не bug: примушує говорити про semantic
  конфлікт до merge.
- Порядок очевидний — `ls` показує timeline.
- Легко з одного погляду побачити, що у проді: `SELECT version FROM migrations ORDER BY 1`.

**Негативні:**

- Merge-конфлікт потребує rebase і переномерації. Мітігуємо:
  - Перед відкриттям PR з міграцією — `git fetch && git log main -- apps/server/src/migrations/`,
  - Pre-merge-checklist (плейбук) нагадує перевірити numbering.

### Alternatives considered

- **Timestamp-нумерація.** Розглядалось у [#704](https://github.com/Skords-01/Sergeant/issues/704);
  відкинуто, бо візуальна послідовність важливіша за merge-зручність для
  single-maintainer темпу.
- **Гібрид (sequential + slug).** Зайва складність.

### Exit criteria

Переглядається, якщо команда виросте до ≥ 3 активних БД-розробників з паралельними
міграціями на тиждень — тоді timestamp. Поки — sequential.

---

## ADR-13.2 — Idempotent migrations через `IF NOT EXISTS` і `pg_catalog`

### Status

accepted.

### Context

Міграція може бути перервана на середині (контейнер крешнувся, Railway timeout),
і наступний запуск має доробити до завершення без помилки "already exists".
Також: у dev-інструментах (rollback-sanity тести) ми програємо міграції двічі.

### Decision

- `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `ALTER TABLE …
ADD COLUMN IF NOT EXISTS`.
- CHECK constraints: гуардити через `pg_catalog.pg_constraint` lookup, бо
  `ADD CONSTRAINT IF NOT EXISTS` не підтримується Postgres < 16 (див.
  `005_backend_hardening.sql`).
- Для CREATE POLICY / CREATE TRIGGER — `DO $$ BEGIN … EXCEPTION WHEN duplicate_object THEN NULL; END $$;`.

### Consequences

**Позитивні:**

- Partial failure recover-иться автоматично на наступному deploy.
- Повторний `pnpm db:migrate` у dev не падає.

**Негативні:**

- `IF NOT EXISTS` маскує accidental double-insert (хтось вручну створив index
  з іншим визначенням). Вирішуємо через migration-tests: перевіряємо, що після
  міграції схема відповідає очікуваній (snapshot `pg_dump --schema-only`).

### Exit criteria

n/a (operational rule).

---

## ADR-13.3 — Forward-only у проді, `down.sql` тільки для dev

### Status

accepted.

### Context

Два підходи до rollback:

1. **Symmetric up/down** (Rails, Knex) — кожна міграція має reverse. Звучить
   добре, але у проді rarely використовується (DROP COLUMN на 100M рядках —
   небезпечно; rollback часто неможливий без DATA LOSS).
2. **Forward-only** (Supabase, PostgREST) — `down.sql` не існує у проді; fix
   = нова forward-міграція з корекцією.

### Decision

Production — **forward-only**. Якщо щось пішло не так (поломана колонка, помилкова
DROP), пишеться нова міграція `NNN+1_fix_<desc>.sql`, яка корегує. Ніколи не
запускаємо `down.sql` проти продакшн-БД.

`*.down.sql` — **опційний dev-інструмент**. Приклад: `008_mono_integration.down.sql`
існує для того, щоб локально скинути monobank-тест-state без re-clone DB.

Pre-deploy команда на Railway — `pnpm --filter @sergeant/server db:migrate` (без
`db:migrate:down` flag-а).

### Consequences

**Позитивні:**

- Продакшн БД ніколи не губить дані через rollback-помилку.
- Розробка швидша: не треба писати reverse-логіку для кожної міграції (тільки
  для тих, які критичні для dev — наприклад, monobank test-state).
- Migration-history — append-only linear timeline.

**Негативні:**

- "Швидкий" rollback у проді неможливий — тільки forward-fix. На practice це
  < 15 хв (написати migration, merge, Railway auto-deploy).
- Dev-rollback (`*.down.sql`) не guarantee-ний — не кожна міграція має.

### Alternatives considered

- **Symmetric up/down.** Відкинуто через проблему data-loss при real-prod
  rollback (описано вище).
- **DB-snapshot + restore як rollback.** Railway Postgres має pg_dump snapshots
  (раз у день). Emergency-варіант, але не замінює forward-only як primary
  стратегію. Документувати у runbook.

### Exit criteria

n/a.

---

## ADR-13.4 — Two-phase DROP / rename для zero-downtime

### Status

accepted.

### Context

Railway pre-deploy запускає міграції **перед стартом нового контейнера**. На
невеликий (секунди) проміжок старий контейнер ще serve-ить traffic, а схема
вже змінилася. Якщо нова схема remove-ить колонку, яку старий код ще пише →
`column "amount" does not exist` краш.

Приклад з AGENTS.md §4:

```sql
-- Фаза 1: NNN_add_new_amount.sql (deployed first; old code unaffected)
ALTER TABLE transactions ADD COLUMN amount_minor BIGINT;
UPDATE transactions SET amount_minor = (amount * 100)::BIGINT;
-- Код оновлюється, пише в ОБИДВІ колонки, читає з new.

-- Фаза 2: (N+M)_drop_old_amount.sql (deployed ONLY after phase 1 is live)
ALTER TABLE transactions DROP COLUMN amount;
```

### Decision

Будь-яка **видалення чи перейменування** колонки / таблиці / constraint
виконується у **два окремі PR-и** з **окремими production-деплоями**:

1. **PR 1 (add + double-write):** додаємо нову структуру, код пише в обидві,
   читає з нової. Deploy, чекаємо `main` stable (мін. 1 день).
2. **PR 2 (drop):** видаляємо стару структуру. Deploy.

Виняток — **повністю nullable legacy-колонка, яку код НЕ пише і НЕ читає
вже** (підтвердити grep): можна drop-нути в один PR з ALLOW_DROP escape-hatch:

```sql
-- ALLOW_DROP: column unused since PR #NNN (due: YYYY-MM-DD)
ALTER TABLE foo DROP COLUMN bar;
```

`due:` ≈ 30 днів — нагадування, що якщо щось відкотили, escape-hatch треба
зняти.

### Consequences

**Позитивні:**

- Zero-downtime deploy — старий код не падає у проміжку між міграцією та
  рестартом.
- Rollback (до попередньої версії app) працює, бо схема ще містить стару
  колонку протягом Phase 1.

**Негативні:**

- 2x PR-и й 2x деплоі на drop = більше координаційного overhead.
- "Double-write" period може створити data inconsistency (`amount` і
  `amount_minor` розходяться). Мітігуємо: код пише одночасно з однієї
  logic-функції (single source of truth у application, не 2 різні шляхи).

### Exit criteria

n/a (operational rule, enforced by `pre-merge-migration-checklist.md`).

---

## ADR-13.5 — Migration tests і drift detection

### Status

accepted.

### Context

Зламати схему — тривіально: `ADD COLUMN NOT NULL` без `DEFAULT` на non-empty
таблиці → deploy fail. Відловлюємо на CI, не в проді.

### Decision

Тестовий stack:

1. **`rollback-sanity.test.ts`** — перевіряє, що для кожного `NNN_*.sql` або
   існує `*.down.sql`, або явно документовано, що rollback не передбачений
   (escape-hatch коментар у migration-файлі).
2. **Testcontainers integration-тести для модулів** — кожен `apps/server/src/modules/*`
   тест підіймає чистий Postgres, прогоняє **всі** міграції, потім тестує
   handler. Якщо міграція ламає схему, тест падає на setup-етапі.
3. **Snapshot-тести responses** (AGENTS.md hard rule #3) — якщо serializer
   змінився (bigint-coercion, нове поле), snapshot diff show-ить це одразу.
4. **Drift detection (TBD):** `pg_dump --schema-only` з Railway prod → diff
   проти CI-збуданої схеми → алерт, якщо вони розходяться (manual hotfix?
   tool що обійшов pre-deploy?). Поки що не реалізовано — окреме TODO.

### Consequences

**Позитивні:**

- CI ловить більшість schema-проблем до merge.
- Rollback-sanity тест — дешевий sanity для double-write інтенції.

**Негативні:**

- Testcontainers додає ~30s до тестів apps/server — прийнятно.
- Drift detection поки відсутній; теоретично можна "забути" закомітити
  міграцію, яка fix-ить щось, прогнану вручну.

### Exit criteria

Drift detection тул додатковий → буде окремий ADR або просто follow-up issue.

---

## ADR-13.6 — Де і коли запускаються міграції

### Status

accepted.

### Context

Два patterns:

1. **Pre-deploy hook** — міграції запускаються перед стартом нового контейнера
   (Railway release phase, Heroku release phase).
2. **Startup-time** — API сам мігрує при boot-і.

### Decision

- **Production (Railway):** pre-deploy hook (`pnpm --filter @sergeant/server db:migrate`).
  Контейнер з новою версією коду **не стартує**, якщо міграції не пройшли → safe
  failure mode (старий код продовжує обслуговувати з старою схемою).
- **Local dev:** `pnpm db:migrate` manual runnable; `pnpm dev` НЕ мігрує
  автоматично.
- **Tests:** Testcontainers setup-хелпер прогоняє всі міграції перед кожним
  fixture.
- **Capacitor shell / Expo:** не застосовується — клієнти не мають DB.

### Consequences

**Позитивні:**

- Чітке розмежування ролей: міграція = окремий step з чіткою failure
  semantics.
- Старий код не бачить наполовину-мігровану схему (pre-deploy = atomic з погляду
  traffic).

**Негативні:**

- Long migrations (>5 хв) блокують deploy. Для critical змін — робимо
  online-safe (два PR-и, CONCURRENTLY для index-ів, тощо).

### Exit criteria

n/a.

---

## Open questions

1. **Drift detection.** Tool + alert — коли бекенд запущений на схемі, яка
   відрізняється від `NNN_*.sql` історії (напр. ручний `ALTER` через psql).
2. **Long-running index build.** `CREATE INDEX CONCURRENTLY` — required для
   > 1M rows, але він не працює у транзакції. Міграція-runner має detect-ити
   > `CONCURRENTLY` і запускати окремим statement. Поки не було потреби;
   > додамо при першій такій міграції.
3. **Data-migration стратегія.** DDL + DML у одному файлі vs окремо. Поки ок
   у одному (`002_ai_usage_daily.sql` і `004_*.sql`), але якщо DML стане важким
   (hours) — можливо окремий "data migration"-таск, не міграція.

---

## Implementation tracker

| Arte-fact                                         | Статус |
| ------------------------------------------------- | ------ |
| Sequential `NNN_*.sql` convention                 | live   |
| Idempotent patterns (`IF NOT EXISTS`, pg_catalog) | live   |
| Forward-only production deploy                    | live   |
| Two-phase DROP rule у AGENTS.md §4                | live   |
| `rollback-sanity.test.ts`                         | live   |
| Testcontainers у module-тестах                    | live   |
| `pre-merge-migration-checklist.md` playbook       | live   |
| Drift detection                                   | TBD    |
| `CONCURRENTLY` index support у migrator           | TBD    |
