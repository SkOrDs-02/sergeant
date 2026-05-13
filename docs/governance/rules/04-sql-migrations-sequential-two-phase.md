# Rule 4 — SQL migrations: sequential, no gaps, two-phase for DROP

> **Category:** `blocker-invariant`
> **Severity:** `blocker`
> **Last validated:** 2026-05-13 by @Skords-01
> **Next review:** 2026-08-11
> **Status:** Active

> Per-rule canonical body for Hard Rule #4. Compact summary lives in [`AGENTS.md § Hard rules`](../../../AGENTS.md#hard-rules-do-not-break) (rendered as a table). The machine-readable registry lives in [`docs/governance/hard-rules.json`](../hard-rules.json). The 3-way sync (AGENTS.md ↔ JSON ↔ this file) is enforced by `pnpm lint:hard-rules-registry`.

## Scope

- `apps/server/src/migrations/**`

## Enforced by

- **ci** — pnpm lint:migrations
- **codeowners** — .github/CODEOWNERS

## Why / What is enforced

Files in `apps/server/src/migrations/` use the pattern `NNN_description.sql` (currently 001–049). Pre-deploy: `pnpm db:migrate` (Railway, runs `apps/server/migrate.mjs`). The build step copies them via `apps/server/build.mjs` (fixed in [#704](https://github.com/Skords-01/Sergeant/issues/704)).

> **Local Postgres image:** `docker-compose.yml` uses `pgvector/pgvector:pg16`, not stock `postgres:16-alpine`. Migration `025_ai_memories_pgvector.sql` runs `CREATE EXTENSION IF NOT EXISTS vector;` and the alpine image does not ship the extension — `pnpm db:up` would fail at migrate-time. CI workflows (`ci.yml`, `extended-e2e.yml`, `visual-regression.yml`) already pin the same image.

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

Authoring walkthrough + failure-mode catalog: [`docs/runbooks/operations-runbook.md § 8.2`](../../runbooks/operations-runbook.md#82-two-phase-drop-authoring).

### Empty `.down.sql` is a lint error

`pnpm lint:migrations` rejects any **new or modified** `.down.sql` file whose body is empty — only blank lines, single-line `--` comments, or the plop-generated `-- TODO: write your DOWN (rollback) migration here` placeholder count as "empty". Pre-existing empty rollbacks in the tree are not retroactively flagged; the gate only fires on files the PR touches.

If rollback is genuinely impossible (irreversible data backfill, `DROP TABLE` of an obsolete schema, etc.) add one escape-hatch comment with the same shape as `ALLOW_DROP:`:

```sql
-- NO_ROLLBACK: <reason> (due: YYYY-MM-DD)
```

A reason after the colon is mandatory — the linter rejects bare `-- NO_ROLLBACK:` lines.

## Related

- **issue** — #704
- **agents** — #4
