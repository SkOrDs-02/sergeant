# Local Postgres setup

> **Last touched:** 2026-10-03 by @claude (Renovate прибрано: digest pgvector піднімається вручну, ADR-0103). **Next review:** 2027-04-01.
> **Status:** Active

Локальний Postgres для розробки запускається через `docker-compose.yml` у
корені репо. Використовується image `pgvector/pgvector:pg17` —
**SHA-pinned** до того же digest, що й у CI (`.github/workflows/{ci,
extended-e2e, db-backup-verify}.yml`).

## Запуск

```bash
pnpm db:up         # = docker compose up -d (постгрес + healthcheck)
pnpm db:migrate    # node dist-server/migrate.js (потребує build); dev-варіант без білда — pnpm --filter @sergeant/server db:migrate:dev
pnpm dev           # Turborepo: web + server у parallel
pnpm db:down       # docker compose down (зберігає volume)
```

`DATABASE_URL` у `.env`: `postgresql://hub:hub@localhost:5432/hub` (credentials
тільки для локальної розробки — не плутати з production).

## Чому SHA-pin (`@sha256:…`) замість тегу `:pg17`

`docker-compose.yml` пінить:

```yaml
image: pgvector/pgvector:pg17@sha256:feb68f4f15446397d8cac7f4fe48fe4586de83160d1fc48b46283312d1a33966
```

**Getting the digest:** Run the following after pulling the image:

```bash
docker pull pgvector/pgvector:pg17
docker inspect pgvector/pgvector:pg17 --format '{{index .RepoDigests 0}}'
```

Floating-теги (`:pg17`, `:latest`) автомутують upstream-вміст без notice, що
ламає три інваріанти Sergeant-стеку:

1. **Reproducibility.** Bug-репорт місячної давності неможливо exact-reproduce —
   `docker pull pgvector/pgvector:pg17` у вівторок дає інакший layer-набір
   ніж у понеділок. SHA робить «works on my machine» falsifiable.
2. **CVE-trap safety.** Свіжо-зламаний upstream-shape (наприклад, regression у
   `vector` extension) автоматично pull-иться під час `docker compose up`.
   Pin блокує це до явного bump-у.
3. **CI ↔ local parity.** Чотири workflow-и (`ci.yml`, `extended-e2e.yml`,
   `db-backup-verify.yml`) уже пінять той самий SHA;
   локальний floating-тег ламає «works locally / fails in CI» triage.

PR-37 (stack-pulse 2026-05 / L10) зафіксував цей invariant. Тоді ж SHA
оновлював Renovate (`pinDigests`, щомісяця), але Renovate на GitHub-репо не
встановлено і `renovate.json` видалено ([ADR-0103](../../governance/adr/0103-dependabot-only-dependency-updates.md)).
Автоматичного оновлення digest зараз немає.

## Bumping the SHA

Автоматичного шляху немає. Dependabot цей digest не бачить: екосистема
`docker` у [`.github/dependabot.yml`](../../../.github/dependabot.yml) читає
лише Dockerfile (`Dockerfile.api`), а `docker-compose.yml` і `services:` у
воркфлоу не входять ні в `docker`, ні в `github-actions`. Тож SHA піднімають
вручну: при security advisory на `pgvector`/Postgres, коли потрібна нова
версія `vector` extension, або під час періодичного тріажу залежностей
([`dependency-sweeper.md`](../../start/instructions/dependency-sweeper.md)).

### Manual

```bash
# 1. Pull latest tag і отримай digest:
docker pull pgvector/pgvector:pg17
docker inspect pgvector/pgvector:pg17 --format '{{index .RepoDigests 0}}'
# → pgvector/pgvector@sha256:<new-digest>

# 2. Онови всі входження (SHA має збігатися всюди):
git grep -n 'pgvector/pgvector:pg17@sha256' -- ':!*.md'
#    станом на 2026-10-03 це 5 місць:
#    - docker-compose.yml (services.postgres.image)
#    - .github/workflows/ci.yml (два services.postgres.image)
#    - .github/workflows/extended-e2e.yml
#    - .github/workflows/db-backup-verify.yml

# 3. Smoke-test:
pnpm db:down
docker volume rm sergeant_hub_pgdata 2>/dev/null || true
pnpm db:up
pnpm db:migrate
pnpm test --filter @sergeant/server
```

Bump-PR мерджиться лише після:

1. CI passes (усі workflow-и з pgvector + migration tests).
2. Manual smoke вище локально.
3. Якщо upstream changelog показує major-bump pgvector — review
   migration `025_ai_memories_pgvector.sql` ще раз перед merge-ем.

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
- CI workflows: `.github/workflows/{ci, extended-e2e, db-backup-verify}.yml`.
- Dependabot config: [`.github/dependabot.yml`](../../../.github/dependabot.yml) (pgvector не покриває, див. § Bumping the SHA).
- Migration: `apps/server/src/migrations/025_ai_memories_pgvector.sql`.
- Pool sizing runbook: [`docs/operations/observability/pg-pool-sizing.md`](../../operations/observability/pg-pool-sizing.md).
- Backup/restore runbook: [`docs/start/instructions/database-backup-restore.md`](../../start/instructions/database-backup-restore.md).
- Робота з PR Dependabot: [`docs/engineering/integrations/dependabot-usage.md`](../integrations/dependabot-usage.md).
- Initiative: [`docs/work/specs/initiatives/stack-pulse-2026-05/pr-37-postgres-image-sha-pin.md`](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/initiatives/archive/stack-pulse-2026-05/archive/pr-37-postgres-image-sha-pin.md).
