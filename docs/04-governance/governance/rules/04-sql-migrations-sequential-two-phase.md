# Rule 4 — SQL migrations: sequential, no gaps, two-phase for DROP

> **Category:** `blocker-invariant`
> **Severity:** `blocker`
> **Last touched:** 2026-08-31 by @Skords-01. **Next review:** 2027-03-24.
> **Status:** Active

> Per-rule canonical body for Hard Rule #4. Compact summary lives in [`AGENTS.md § Hard rules`](../../../../AGENTS.md#hard-rules-do-not-break) (rendered as a table). The machine-readable registry lives in [`docs/04-governance/governance/hard-rules.json`](../hard-rules.json). The 3-way sync (AGENTS.md ↔ JSON ↔ this file) is enforced by `pnpm lint:hard-rules-registry`.

## Scope

- `apps/server/src/migrations/**`

## Enforced by

- **ci** — pnpm lint:migrations

## Why / What is enforced

Files in `apps/server/src/migrations/` use the pattern `NNN_description.sql` (currently 001–127, sequential, no gaps; єдиний історичний дубль — `091`, див. § «Перейменування вже застосованої міграції»). Pre-deploy: Coolify `pre_deployment_command = node dist-server/migrate.js` (compiled from `apps/server/migrate.mjs`; requires `MIGRATE_DATABASE_URL`), per [ADR-0074](../../adr/0074-hosting-hetzner-coolify.md) — раніше це був Railway `[deploy].preDeployCommand`. Локально — `pnpm db:migrate`. The build step copies them via `apps/server/build.mjs` (fixed in [#704](https://github.com/Skords-01/Sergeant/issues/704)).

> **Local Postgres image:** `docker-compose.yml` uses `pgvector/pgvector:pg17`, not stock `postgres:17-alpine`. Migration `025_ai_memories_pgvector.sql` runs `CREATE EXTENSION IF NOT EXISTS vector;` and the alpine image does not ship the extension — `pnpm db:up` would fail at migrate-time. CI workflows (`ci.yml`, `extended-e2e.yml`, `db-backup-verify.yml`) already pin the same image.

- **Adding a column:** single file `NNN_add_foo.sql`. Make it `NULL`-able or `DEFAULT`-ed so old code keeps working.
- **Renaming/removing a column:** **two phases**, deployed **separately**:

```sql
-- Phase 1: NNN_add_new_amount.sql (deployed first; old code unaffected)
ALTER TABLE transactions ADD COLUMN amount_minor BIGINT;
UPDATE transactions SET amount_minor = (amount * 100)::BIGINT;
-- Code is updated to write BOTH columns and read the new one.

-- Phase 2: (N+M)_drop_old_amount.sql (deployed only after phase 1 is live)
ALTER TABLE transactions DROP COLUMN amount;
```

Never drop a column in the same release as the code that stops writing to it — Railway pre-deploy migrates before the new app starts, so the old version (briefly serving traffic) will crash.

A `down.sql` companion (e.g. `008_mono_integration.down.sql`) is for local rollbacks. Production never runs `down.sql`, but the file is still required: it documents how to revert the schema during incident recovery or local development.

### `TWO-PHASE-DROP` header gate

Any new `*.up.sql` migration that contains `DROP TABLE` or `ALTER TABLE … DROP COLUMN` must carry a machine-validated comment header on a single line:

```sql
-- TWO-PHASE-DROP: introduced YYYY-MM-DD as deprecation; safe to drop after YYYY-MM-DD
```

`pnpm lint:migrations` parses the two dates and enforces:

- both dates are real `YYYY-MM-DD` calendar dates (`2026-02-30` is rejected);
- `safe to drop after − introduced ≥ 14` days (the soak window of Phase 1);
- `safe to drop after ≤ today` on the CI run (so a Phase 2 PR cannot land before its own deadline).

`DROP INDEX` and `DROP FUNCTION` are allowed without a header because they are re-creatable from the migration body. `DROP` statements inside `*.down.sql` files are governed by the empty-`.down.sql` rule below, not by this header.

The legacy escape hatch `-- ALLOW_DROP: <reason>` still passes the lint for backward-compat with pre-existing migrations on `main`, but new migrations should use `TWO-PHASE-DROP:` so the deprecation timeline is machine-verifiable.

Authoring walkthrough + failure-mode catalog: [`docs/03-operations/runbooks/operations-runbook.md § 8.2`](../../../03-operations/runbooks/operations-runbook.md#82-two-phase-drop-authoring).

### Empty `.down.sql` is a lint error

`pnpm lint:migrations` rejects any **new or modified** `.down.sql` file whose body is empty — only blank lines, single-line `--` comments, or the plop-generated `-- TODO: write your DOWN (rollback) migration here` placeholder count as "empty". Pre-existing empty rollbacks in the tree are not retroactively flagged; the gate only fires on files the PR touches.

If rollback is genuinely impossible (irreversible data backfill, `DROP TABLE` of an obsolete schema, etc.) add one escape-hatch comment with the same shape as `ALLOW_DROP:`:

```sql
-- NO_ROLLBACK: <reason> (due: YYYY-MM-DD)
```

A reason after the colon is mandatory — the linter rejects bare `-- NO_ROLLBACK:` lines.

### Перейменування вже застосованої міграції = повторне виконання

Раннер ([`packages/db-schema/src/migrate/runner.ts`](../../../../packages/db-schema/src/migrate/runner.ts)) веде реєстр `schema_migrations` **за іменем файлу**: `getAppliedNames()` повертає рядки, і файл виконується, якщо його імені там немає. Отже перейменований файл для раннера - це нова міграція, і його SQL виконається на проді вдруге, а старий запис лишиться сиротою (запис є, файлу немає).

Це вже сталося тричі, щоразу як «дрібний фікс нумерації»:

| Комміт                                                          | Дія                                  | Сирота в `schema_migrations`   |
| --------------------------------------------------------------- | ------------------------------------ | ------------------------------ |
| `831ea60ad` fix(migrations): renumber duplicate 047 → 048       | `047_tg_topic_archive` → `048_…`     | `047_tg_topic_archive.sql`     |
| `0f8bd3c17` fix(migrations): renumber 096 → 097 finyk/fizruk PK | `096_finyk_fizruk_pk_text` → `097_…` | `096_finyk_fizruk_pk_text.sql` |
| `989061f5d` fix(migrations): повернути fizruk_injuries на 097   | `096_fizruk_injuries` → `097_…`      | `096_fizruk_injuries.sql`      |

Пронесло без пошкоджень випадково: повторений SQL виявився стійким до другого прогону (`097_fizruk_injuries` увесь під `IF NOT EXISTS`; `096_finyk_fizruk_pk_text` робить DROP+recreate FK і `ALTER … TYPE text` на вже-`text` колонці). Наступного разу так не буде.

**Що робити при колізії номерів на ребейзі:**

- Файл ще **не** змерджений у `main` (звичайний випадок: два паралельні PR-и взяли той самий номер) - перенумеровуй свій файл вільно. Git бачить його як `A` (додано) відносно `main`, лінтер мовчить.
- Файл **уже** на `main` - ім'я недоторкане, навіть якщо номер задубльований. Дубль лишається як є; обидва файли додаються до `APPLIED_DUPLICATE_FILENAMES` у [`scripts/lint-migrations.mjs`](../../../../scripts/lint-migrations.mjs) з поясненням, чому саме ці два. Двозначності це не створює: файли застосовуються в лексикографічному порядку.
- Ніколи не «вирівнюй» нумерацію заднім числом заради краси. Порядок номерів - це контракт із реєстром, а не стиль.

`pnpm lint:migrations` блокує перейменування up-міграції, що існує на `origin/<base>` (`git diff --diff-filter=R`). Escape-hatch `ALLOW_MIGRATION_RENAME=1` - лише для міграції, яка точно ніколи не деплоїлась (рідко: push у `main` деплоїть автоматично).

Джоба `migration-lint` навмисно працює і на `pull_request`, і на `push` у `main`: дубль `091` проліз саме тому, що обидва PR-и лінтувались проти `main` з максимумом `090`, а після мержу гейт не запускався ніде.

## Related

- **issue** — #704
- **agents** — #4

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                     | Title                                                                                                                   | Merged     |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ---------- |
| [#508](https://github.com/Skords-01/Sergeant/pull/508) | fix(docs): reconcile canonical docs with current repo                                                                   | 2026-07-29 |
| [#334](https://github.com/Skords-01/Sergeant/pull/334) | docs(root): reconcile docs with code after 2026-07-20 audit (Railway->Coolify, CI gates, dual-write, domain invariants) | 2026-07-21 |

_Auto-derived from `docs/04-governance/pr-ledger/index.json`. Top 2 most recent PRs touching this file._
<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
