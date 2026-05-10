# Local Postgres setup

> **Last validated:** 2026-05-09 by Devin. **Next review:** 2026-08-07.
> **Status:** Active

Локальний Postgres для розробки запускається через `docker-compose.yml` у
корені репо. Використовується image `pgvector/pgvector:pg16` —
**SHA-pinned** до того ж digest, що й у CI (`.github/workflows/{ci,
extended-e2e, visual-regression, db-backup-verify}.yml`).

## Запуск

```bash
pnpm db:up         # = docker compose up -d (постгрес + healthcheck)
pnpm db:migrate    # apps/server/migrate.mjs — застосовує всі NNN_*.sql
pnpm dev           # Turborepo: web + server у parallel
pnpm db:down       # docker compose down (зберігає volume)
```

`DATABASE_URL` у `.env`: `postgresql://hub:hub@localhost:5432/hub` (credentials
тільки для локальної розробки — не плутати з production).

## Чому SHA-pin (`@sha256:…`) замість тегу `:pg16`

`docker-compose.yml` пінить:

```yaml
image: pgvector/pgvector:pg16@sha256:7d400e340efb42f4d8c9c12c6427adb253f726881a9985d2a471bf0eed824dff
```

Floating-теги (`:pg16`, `:latest`) автомутують upstream-вміст без notice, що
ламає три інваріанти Sergeant-стеку:

1. **Reproducibility.** Bug-репорт місячної давності неможливо exact-reproduce —
   `docker pull pgvector/pgvector:pg16` у вівторок дає інакший layer-набір
   ніж у понеділок. SHA робить «works on my machine» falsifiable.
2. **CVE-trap safety.** Свіжо-зламаний upstream-shape (наприклад, regression у
   `vector` extension) автоматично pull-иться під час `docker compose up`.
   Pin блокує це до явного bump-у.
3. **CI ↔ local parity.** Чотири workflow-и (`ci.yml`, `extended-e2e.yml`,
   `visual-regression.yml`, `db-backup-verify.yml`) уже пінять той самий SHA;
   локальний floating-тег ламає «works locally / fails in CI» triage.

PR-37 (stack-pulse 2026-05 / L10) зафіксував цей invariant і додав
freshness-gate (`renovate.json`) щоб SHA не застрягав застарілим.

## Bumping the SHA

### Auto (default path) — Renovate

`renovate.json` має правило `pgvector pinDigests` з cadence **monthly**
(`before 6am on the first day of the month`). Renovate відкриє PR з новим
digest, заплановано branch-ім'я `renovate/pgvector` (group `pgvector`).

`automerge: false` — bump-и SHA-pinned image-у потенційно проносять breaking
changes у `vector` extension; merge виключно після:

1. CI passes (всі 4 workflow-и + migration tests).
2. Manual smoke: `pnpm db:up && pnpm db:migrate && pnpm test --filter
@sergeant/server` локально.
3. Якщо diff-changelog upstream показує major-bump pgvector — review
   migration `025_ai_memories_pgvector.sql` ще раз перед merge-ем.

### Manual (pre-Renovate, або forced security advisory)

```bash
# 1. Pull latest tag і отримай digest:
docker pull pgvector/pgvector:pg16
docker inspect pgvector/pgvector:pg16 --format '{{index .RepoDigests 0}}'
# → pgvector/pgvector@sha256:<new-digest>

# 2. Оновіть 5 місць (SHA має ідеально матчити в усіх):
#    - docker-compose.yml (services.postgres.image)
#    - .github/workflows/ci.yml (services.postgres.image, ~line 410)
#    - .github/workflows/extended-e2e.yml (~line 57)
#    - .github/workflows/visual-regression.yml (~line 40)
#    - .github/workflows/db-backup-verify.yml (~line 34)

# 3. Smoke-test:
pnpm db:down
docker volume rm sergeant_hub_pgdata 2>/dev/null || true
pnpm db:up
pnpm db:migrate
pnpm test --filter @sergeant/server
```

CI freshness-guard для drift між docker-compose і workflows-ами наразі немає
(out of scope для PR-37). Якщо drift трапляється часто — додавай у backlog
окремий freshness-script (по аналогії з рештою `scripts/check-*.mjs`).

## Troubleshooting

- **`docker compose up` зависає на pull**: digest-pull падає коли image-shape
  для архітектури не існує. На M1/M2 Mac часом потрібен `--platform
linux/amd64`. Зменшіть platform-mismatch правкою в `docker-compose.yml`
  (локально, не commit-ити).
- **`db:migrate` падає на `CREATE EXTENSION vector`**: переконайтеся, що
  `image:` в `docker-compose.yml` справді pgvector-варіант, а не stock
  `postgres:16-alpine`. Stock image не shipping-ить vector extension.
- **`postgres` контейнер crash-ить з `database "hub" does not exist`**:
  volume `hub_pgdata` пере-bootstrap-ивається першого запуску. Якщо ви руками
  тулили SQL — `docker volume rm sergeant_hub_pgdata` і перезапустити.

## Cross-links

- `docker-compose.yml` — root, `services.postgres`.
- CI workflows: `.github/workflows/{ci, extended-e2e, visual-regression, db-backup-verify}.yml`.
- Renovate config: `renovate.json` (`pgvector pinDigests` rule).
- Migration: `apps/server/src/migrations/025_ai_memories_pgvector.sql`.
- Pool sizing runbook: [`docs/observability/pg-pool-sizing.md`](../observability/pg-pool-sizing.md).
- Backup/restore runbook: [`docs/runbooks/database-backup-restore.md`](../runbooks/database-backup-restore.md).
- Renovate operations: [`docs/ops/renovate.md`](../ops/renovate.md).
- Initiative: [`docs/initiatives/stack-pulse-2026-05/pr-37-postgres-image-sha-pin.md`](../initiatives/stack-pulse-2026-05/pr-37-postgres-image-sha-pin.md).
