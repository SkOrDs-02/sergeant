# Database backup / restore — runbook (PR #049)

> **Last validated:** 2026-05-04 by Devin. **Next review:** 2026-08-02.
> **Status:** Active

> Закриває **docs portion** з [`docs/planning/storage-roadmap.md`](../planning/storage-roadmap.md) Stage 6 PR #049 — концентрує операторські команди для full-restore-from-backup на Railway Postgres + smoke-test schema integrity. Weekly verify CI винесений в окремий PR #049b (потребує `RAILWAY_TOKEN` у GH Secrets + dedicated staging instance).
>
> Цей runbook **доповнює** концептуальні playbook-и
> [`restore-from-backup.md`](../playbooks/restore-from-backup.md) (incident flow) і
> [`test-backup-restore.md`](../playbooks/test-backup-restore.md) (rehearsal cadence) —
> вони описують `що` і `коли`, а тут лежить точне `як` для нашого Railway+pg-сетапу.
> RPO/RTO targets: див. [`docs/security/disaster-recovery.md`](../security/disaster-recovery.md) (RPO ≤ 24h, RTO ≤ 4h для Postgres).

## Що ми бекапимо

Один Railway-провайдений Postgres (`Postgres` service у production project).
Дані: usage analytics, finyk transactions, mono cache, fizruk workouts,
nutrition meals, routine streaks, sync_op_log + sync_audit_log, Better Auth
sessions/accounts. Все, що не лежить у `module_data`-blob-ах, лежить тут.

**Не покривається цим runbook-ом:**

- Локальні SQLite-бази на клієнтах (Web OPFS, Mobile expo-sqlite) — це похідне
  від op-log; повний refresh виконується через `syncV2Pull` після відновлення сервера.
- Файли в Capacitor / RN bundle storage — стандартний restore з App Store / Play backup.
- Secrets (Better Auth, Mono, Stripe…) — окремий шлях через
  [`rotate-secrets.md`](../playbooks/rotate-secrets.md) і
  [`docs/runbooks/encryption-key-rotation.md`](./encryption-key-rotation.md).
- LocalStorage / MMKV blob-и (cloudSync v1 legacy) — drop coordinated через PR #052.

## Які бекапи у нас є

| Шар                                       | Cadence               | Retention       | Hold-time для restore                                      |
| ----------------------------------------- | --------------------- | --------------- | ---------------------------------------------------------- |
| Railway automated PG snapshots            | щодоби (UTC midnight) | 7 днів          | ~5–15 хв на full-restore через Railway dashboard / CLI     |
| Manual `pg_dump`-snapshot перед міграцією | per release           | до 30 днів у S3 | див. § «Pre-migration snapshot» нижче                      |
| WAL streaming / PITR                      | **не налаштовано**    | —               | поза scope-ом цього runbook-у — TODO Stage 6 PR (separate) |

> **Reality-check.** Сьогодні єдиний staffed backup channel — Railway daily
> snapshots. Мінімально валідовано: ручний рестор у staging-проект ≤ 1 раз на
> місяць. Weekly verify CI (PR #049b) формалізує цю цикадру.

## 1. Pre-migration snapshot (recommended перед кожним release)

Виконати **перед** `pnpm db:migrate` у release-pipeline-і (Railway pre-deploy
не робить цього автоматично).

```bash
# 1. Дізнатись DATABASE_PUBLIC_URL із Railway (Variables tab → Postgres service).
export PGURL='postgresql://postgres:<pass>@<host>.railway.app:5432/railway'

# 2. Зняти кастом-format dump (стискається + дозволяє selective restore).
ts=$(date -u +%Y%m%dT%H%M%SZ)
pg_dump --format=custom --no-owner --no-privileges \
  --file="sergeant-prod-${ts}.dump" "$PGURL"

# 3. Перевірити, що dump читається (швидкий TOC list).
pg_restore --list "sergeant-prod-${ts}.dump" | head -40
```

**Куди класти.** В нашому setup-і — на operator-овий ноут + S3-bucket
`sergeant-db-backups` (Backblaze B2, ENV-doc у
[`disaster-recovery.md`](../security/disaster-recovery.md)). Файли **never**
комітяться в git (там можуть бути PII).

**Що НЕ робити:**

- Не вживати `--format=plain` для production-розмірів — restore буде в десятки разів повільніший.
- Не зберігати unencrypted dump у локальному `~/Downloads`-і довше ніж restore-window — тільки в bucket із KMS-encrypted-at-rest.

## 2. Restore — full database (incident path)

> **Передумова.** Спершу пройди § «Freeze the blast radius» з
> [`restore-from-backup.md`](../playbooks/restore-from-backup.md) — зупини
> webhook-инжестори, поставив web-серви в read-only / maintenance mode.

### 2.1. Через Railway dashboard (швидкий шлях, ≤ 15 хв)

1. Railway dashboard → `Postgres` service → **Backups** tab.
2. Обрати найновіший snapshot, що передує incident-window-ові.
3. **Restore to a new database** (не overwrite — це безповоротно знищить current state, який ти ще можеш потім forensically переглянути).
4. Дочекатись `Healthy` стану нового PG-сервісу (~5 хв).
5. Налаштувати ENV у web/api сервісах: тимчасово підкласти `DATABASE_URL` нового сервісу.
6. Прогнати `pnpm db:migrate` — перевіряє, що `schema_migrations` сходиться з кодовою версією; якщо ні, restore-point був **до** некоторої необхідної міграції — див. § 5.
7. Прогнати smoke-tests із § 4.
8. Якщо все ОК — переключити web/api на нову БД (Railway Variables → linked service).

### 2.2. Через локальний `pg_restore` (slower, але повний контроль)

Корисно, коли треба **selective** restore (наприклад, відновити тільки
`mono_connection` без перезапису `sync_op_log`).

```bash
# Проти нової / staging-БД (НЕ проти production!):
export PGURL_TARGET='postgresql://postgres:<pass>@<staging-host>:5432/railway'

# Full restore.
pg_restore --no-owner --no-privileges --clean --if-exists \
  --dbname="$PGURL_TARGET" "sergeant-prod-20260504T000000Z.dump"

# Selective restore — тільки одна таблиця + її залежності:
pg_restore --no-owner --no-privileges --table=mono_connection \
  --dbname="$PGURL_TARGET" "sergeant-prod-20260504T000000Z.dump"
```

**Прапорці й чому:**

- `--no-owner --no-privileges` — Railway-провайдений `postgres`-юзер не має суперюзерських прав на створення інших ролей; ці прапорці гарантують, що restore не падає на `ALTER TABLE … OWNER TO …`.
- `--clean --if-exists` — drop-then-recreate об'єкти; **використовуй тільки на staging / новій БД**, ніколи на live.

## 3. Restore — selective row-level (sync-aware)

Для наших sync-tables (`sync_op_log`, `routine_entries`, `nutrition_meals`,
`finyk_*`, `fizruk_*` …) **поверне дані лише до точки бекапу** — клієнти за
op-log контрактом потім реплеять локальні writes уперед при першому
`syncV2Push`. Тому row-level restore безпечний _тільки_ для таблиць **без**
зустрічного клієнтського запису:

| Таблиця                                                     | Safe для row-level restore? | Чому                                                                                                                                         |
| ----------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `mono_connection`, `mono_token_*`                           | ✅                          | Server-only writes; клієнти лише читають.                                                                                                    |
| `sync_audit_log`                                            | ✅                          | Append-only; old rows не змінюються.                                                                                                         |
| `sync_op_log`                                               | ⚠️                          | Можна, але після restore переконайся, що `sync_op_cursor` (клієнт) скине `last_seen_op_id` до `MAX(id)` — інакше клієнт не отримає нові ops. |
| `routine_entries`, `nutrition_meals`, `finyk_*`, `fizruk_*` | ❌                          | Per-row sync — restore ламає LWW. Тільки full-DB restore + клієнти переграють op-log.                                                        |
| `users`, `accounts`, `session`                              | ⚠️                          | Better Auth — restore може invalidate активні сесії; готуй "logout-everyone" комунікацію.                                                    |

## 4. Smoke-test schema integrity

Виконати після **будь-якого** restore (full або selective). Усі команди
працюють у `psql "$PGURL_TARGET"`.

### 4.1. Migration ledger

Наш ledger — `schema_migrations(name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ)`,
де `name` = ім'я файлу в `apps/server/src/migrations/` (`NNN_description.sql`).

```sql
-- Очікуваний стан: повний список застосованих міграцій, lexicographic-monotonic.
SELECT name, applied_at FROM schema_migrations ORDER BY name;

-- Sanity: усі очікувані `NNN_*.sql` присутні (порівняти з `ls apps/server/src/migrations/`).
SELECT COUNT(*) AS migrations_count, MAX(name) AS max_name
  FROM schema_migrations;
```

Якщо знайдеться gap (наприклад `036_*` присутній, але `035_*` відсутній) —
restore-point був **між** двома міграціями, які ми скинули непослідовно.
Прогнати `MIGRATE_DATABASE_URL=$PGURL_TARGET pnpm db:migrate` проти цієї БД
**із того ж commit-у**, який ми деплоїли в момент snapshot-у — runner
ідемпотентний (skip-ить уже застосовані).

### 4.2. Critical tables — row-count sanity

Better Auth таблиці зараз `"user"` / `account` / `session` (singular,
quoted — `user` зарезервоване в PG).

```sql
SELECT
  (SELECT COUNT(*) FROM "user")             AS users,
  (SELECT COUNT(*) FROM account)            AS accounts,
  (SELECT COUNT(*) FROM session)            AS sessions,
  (SELECT COUNT(*) FROM mono_connection)    AS mono_conn,
  (SELECT COUNT(*) FROM mono_transaction)   AS mono_tx,
  (SELECT COUNT(*) FROM sync_op_log)        AS op_log,
  (SELECT COUNT(*) FROM routine_entries)    AS routine,
  (SELECT COUNT(*) FROM nutrition_meals)    AS meals,
  (SELECT COUNT(*) FROM fizruk_workouts)    AS workouts,
  (SELECT COUNT(*) FROM finyk_hidden_transactions) AS finyk_hidden_tx;
```

**Пороги для тривоги** (на 2026-05): `users` ≥ 10; `op_log` ≥ 5_000;
`mono_conn` — orderly до денних користувачів. Якщо drop > 50% — restore-point
застарілий, шукаємо новіший snapshot.

### 4.3. CRDT-інваріанти (PR #043 / PR-A / PR-B)

```sql
-- Tombstoned rows (deleted_at != NULL) для основних per-row tables.
-- Кожен ряд тут має лишатися tombstoned після restore — НЕ воскрешатися
-- з op_log replay-ом (G-set CRDT invariant).
SELECT
  'nutrition_meals'      AS tab, COUNT(*) AS tombstoned FROM nutrition_meals     WHERE deleted_at IS NOT NULL
UNION ALL SELECT 'routine_entries',          COUNT(*) FROM routine_entries          WHERE deleted_at IS NOT NULL
UNION ALL SELECT 'fizruk_workouts',          COUNT(*) FROM fizruk_workouts          WHERE deleted_at IS NOT NULL
UNION ALL SELECT 'finyk_hidden_transactions', COUNT(*) FROM finyk_hidden_transactions WHERE deleted_at IS NOT NULL;
```

### 4.4. Sync op-log monotonic

```sql
-- server_ts має бути monotonic (PR #027 invariant).
SELECT id, server_ts FROM sync_op_log
  ORDER BY id DESC LIMIT 5;

-- Жодного row із server_ts > NOW() (clock-skew після restore).
SELECT COUNT(*) FROM sync_op_log WHERE server_ts > NOW();
```

### 4.5. Foreign-key integrity

```sql
-- Швидкий orphan-check на 4 ключових FK-парах.
-- Better Auth `account.userId` → `"user".id`; sync-таблиці → `user_id`.
  SELECT 'account orphan',          COUNT(*) FROM account a            LEFT JOIN "user" u ON u.id = a."userId" WHERE u.id IS NULL
UNION ALL SELECT 'session orphan',          COUNT(*) FROM session s            LEFT JOIN "user" u ON u.id = s."userId" WHERE u.id IS NULL
UNION ALL SELECT 'sync_op_log orphan',      COUNT(*) FROM sync_op_log s        LEFT JOIN "user" u ON u.id = s.user_id   WHERE u.id IS NULL
UNION ALL SELECT 'routine_entries orphan',  COUNT(*) FROM routine_entries r    LEFT JOIN "user" u ON u.id = r.user_id   WHERE u.id IS NULL
UNION ALL SELECT 'mono_transaction orphan', COUNT(*) FROM mono_transaction t   LEFT JOIN "user" u ON u.id = t.user_id      WHERE u.id IS NULL;
```

Усі COUNT мають бути `0`. Будь-який ненульовий — restore-point був корумпований; шукаємо інший snapshot.

## 5. Migration-skew після restore

**Сценарій.** Restore-point з вечора 2026-05-04, але код зараз на коммиті, в якому застосовано міграцію `040_*`, доданий 2026-05-05 ранком.

**Порядок дій:**

1. **Не** перемикати prod-traffic на нову БД ще.
2. Build server-image із commit-у, який був deployed _у момент snapshot-у_ (`git checkout <sha>`).
3. На цьому commit-і прогнати `MIGRATE_DATABASE_URL=$PGURL_TARGET pnpm db:migrate` — приведе ledger у стан snapshot-моменту.
4. Тепер ступінчасто accelerate-ити вперед: `git checkout <next-sha>; pnpm db:migrate; …` — або, якщо migrations [00X..0NN] commutative, разом останнім commit-ом.
5. Прогнати § 4 smoke-test знову.

**Чому не один-большой-jump:** деякі наші міграції — **two-phase** (rule #4 з [AGENTS.md](../../AGENTS.md)). Якщо stride через них одним стрибком, є ризик пропустити Phase-1-window data-backfill, який код у обохfase-ах очікує.

## 6. Validation (rehearsal — PR #049b weekly CI)

GitHub Action [`weekly-verify-backup-restore.yml`](../../.github/workflows/weekly-verify-backup-restore.yml)
_(планується в PR #049b)_ робить:

1. Pull найновішого Railway dump через CLI (потребує `RAILWAY_TOKEN` у GH Secrets).
2. Restore у тимчасовий ephemeral pg-instance (testcontainers / Railway temp service).
3. Прогнати § 4 smoke-test.
4. Failures → PagerDuty / Sentry alert.

До моменту landing-у PR #049b, виконуємо це **вручну** раз на місяць —
[`test-backup-restore.md`](../playbooks/test-backup-restore.md).

## 7. Escalation

- Restore не вдається через corruption у dump-і → перейти на попередній денний snapshot; повідомити Skords-01 у Telegram + [postmortem.md](../playbooks/write-postmortem.md).
- Усі 7 Railway-snapshot-ів corrupted → catastrophic event; перейти на manual reconstitute з op-log реплеїв клієнтських БД (best-effort, ≤ 24h data loss expected).
- pgvector extension не доступний на restore-target → див. note у [AGENTS.md](../../AGENTS.md) hard-rule #4 — restore-image має бути `pgvector/pgvector:pg16`, не stock `postgres:16-alpine`.

## Related

- Process flow: [`restore-from-backup.md`](../playbooks/restore-from-backup.md), [`test-backup-restore.md`](../playbooks/test-backup-restore.md)
- RPO / RTO: [`disaster-recovery.md`](../security/disaster-recovery.md)
- Migration conventions: [`docs/adr/0013-db-migrations-conventions.md`](../adr/0013-db-migrations-conventions.md)
- Encryption key rotation (different surface): [`encryption-key-rotation.md`](./encryption-key-rotation.md)
- Skill: `sergeant-data-and-migrations`, `sergeant-deploy-and-observability`
