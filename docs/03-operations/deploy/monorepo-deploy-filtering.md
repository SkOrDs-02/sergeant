# Monorepo deploy filtering — Vercel ignoreCommand + GitHub Actions path filters

> **Last touched:** 2026-09-03 by @Skords-01. **Next review:** 2026-12-20.
> **Status:** Active
>
> **⚠️ Бекенд-тригер переписано ([ADR-0074](../../04-governance/adr/0074-hosting-hetzner-coolify.md)):** `apps/server` більше **не** деплоїться через Railway `watchPatterns`/GraphQL — тепер це GitHub Actions [`deploy-api.yml`](../../../.github/workflows/deploy-api.yml) з `on.push.paths`, що білдить образ → `ghcr.io` → Coolify webhook. Файли `railway*.toml` видалено з репо 2026-07-19. OpenClaw Gateway ніде не задеплоєний (див. [`service-catalog.md`](../../02-engineering/architecture/service-catalog.md)). Vercel-секція нижче чинна без змін.

Sergeant ships production surfaces from one `main` branch:

- `apps/web` → Vercel (`ignoreCommand` + `turbo query affected`)
- `apps/server` → образ на `ghcr.io` → Coolify на Hetzner VPS (GitHub Actions `on.push.paths`)

Without filtering, **every push to `main` triggers both deploys**, even
for `docs/**`-only or `apps/mobile/**`-only changes. That wastes build
minutes, churns Sentry release annotations, and creates unnecessary deploy
noise in the Coolify deploy history and burn CI minutes for nothing.

This page is the canonical recipe for the **per-surface deploy filters**
that keep the trunk-based workflow cheap.

## Vercel — `ignoreCommand` в `apps/web/vercel.json`

```json
"ignoreCommand": "if [ \"$VERCEL_GIT_COMMIT_REF\" = \"beta\" ]; then exit 1; fi; npx --yes turbo@2 query affected --base=\"$VERCEL_GIT_PREVIOUS_SHA\" --packages @sergeant/web --exit-code || exit 1"
```

`turbo query affected` читає `turbo.json` + воркспейсні залежності і виходить з:

- **`1`** якщо `@sergeant/web` (або будь-яка його воркспейсна залежність — `@sergeant/{config,db-schema,design-tokens,shared}` тощо) зачеплений діфом `$VERCEL_GIT_PREVIOUS_SHA...HEAD` → Vercel **білдить**.
- **`0`** якщо в цьому піддереві нічого не змінилось → Vercel **пропускає** ("Build skipped" у списку деплоїв).

Гілка `beta` збирається **завжди** — `exit 1` до будь-якого порівняння.

### Чому не `turbo-ignore --fallback=HEAD^1`

Дві причини, і друга важливіша за депрекейт.

`turbo-ignore` задепрекейчений з Turbo 2.9 на користь `turbo query affected`;
[монорепо-доки Vercel](https://vercel.com/docs/monorepos/turborepo) тепер
рекомендують саме цю команду для Ignored Build Step.

Але міняти було треба через `--fallback=HEAD^1`. Фолбек спрацьовує щоразу, коли
попередній **успішний** деплой гілки недосяжний (`Previous deployment for
@sergeant/web on branch main is unreachable` у логах — досить, щоб попередній
деплой було скасовано), і тоді порівняння звужується до діфу ОДНОГО останнього
коміту. Сценарій хибного пропуску: у PR раніше чіпали `apps/web/**`, зверху ліг
`docs/`- або `ci/`-коміт → `HEAD^1..HEAD` порожній для веба → превʼю
пропускається цілком, хоча гілка веб змінює. На `main` цього не видно, бо там
merge-коміт і `HEAD^1` це попередня вершина `main`, тобто повний діф PR-а —
баг проявлявся саме на превʼю гілок.

Тепер фолбека немає взагалі. Порожній або недосяжний `$VERCEL_GIT_PREVIOUS_SHA`
дає в `turbo` помилку (`GitRefNotFound` → «assuming all files have changed»,
або exit 2), а `|| exit 1` нормалізує будь-який ненульовий код у «білдити».
Тобто невідомість завжди коштує зайву збірку, ніколи не пропуск.

### Verify locally

```bash
cd apps/web
# На гілці, що чіпає apps/web/** — має бути exit 1 (build):
npx --yes turbo@2 query affected --base=origin/main --packages @sergeant/web --exit-code; echo "exit=$?"
# На docs-only коміті — має бути exit 0 (skip).
```

### Verify on Vercel after merge

1. Відкрий список деплоїв у Vercel UI для проєкту `sergeant`.
2. Після мержу `docs/**`-only PR-а відповідний рядок має показати
   **"Build skipped"** з причиною "Build skipped due to ignored build step".
3. Після мержу PR-а, що чіпає `apps/web/**` або будь-яку воркспейсну
   залежність, деплой має бути **"Ready"**.

Якщо docs-only деплой усе одно білдиться, звір `ignoreCommand` з
`apps/web/vercel.json`. Vercel UI НЕ має його перекривати (поле
"Ignored Build Step" у **Settings → Git** лишається порожнім — config-as-code
виграє).

## Backend — GitHub Actions `on.push.paths` in `deploy-api.yml`

The API deploy is a GitHub Actions workflow, not a platform-side git trigger.
[`.github/workflows/deploy-api.yml`](../../../.github/workflows/deploy-api.yml)
runs on `push` to `main` **only if a changed path matches its `paths:` filter**
(GitHub's native path filter — a push whose diff touches nothing on the list is
skipped entirely). On match it builds the image → `ghcr.io/<owner>/sergeant-api`
→ triggers the Coolify deploy webhook. `workflow_dispatch` allows a manual run.

The state of record is the workflow file itself; this doc is the human-readable
mirror. **Edit `deploy-api.yml`, not a dashboard**, to change the trigger.

### Path filter (from `deploy-api.yml` `on.push.paths`)

```
Dockerfile.api
.dockerignore
pnpm-lock.yaml
pnpm-workspace.yaml
package.json
patches/**
apps/server/**
packages/shared/**
packages/config/**
packages/db-schema/**
packages/finyk-domain/**
.github/workflows/deploy-api.yml
```

Rationale:

- `apps/server` is the unit being deployed.
- The package list is the **transitive closure of `apps/server/package.json`'s `@sergeant/*` deps**: `apps/server` → `{config, db-schema, finyk-domain, shared}`. If a new direct or transitive `@sergeant/*` dep is added, **append it here** (and to `container-scan.yml`, which mirrors this surface).
- `Dockerfile.api`, `.dockerignore`, root manifest files (`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`), `patches/**` — anything that affects the built image but lives at repo root.
- The workflow lists **itself** so that changes to the deploy pipeline redeploy on merge.

> **Coarse-filter caveat.** GitHub path filters are prefix-glob, not workspace-aware:
> any change under `apps/server/**` (including `apps/server/AGENTS.md` and other
> docs) matches and triggers a rebuild. The build is idempotent (same code → same
> image), so a doc-only change just churns one no-op-ish deploy — acceptable, but
> worth knowing before you bundle server-tree docs into a big PR.

### OpenClaw — decommissioned, not in the filter

There is **no** OpenClaw deploy in the filter. Both the former `tools/openclaw`
grammy bot and its successor, the OpenClaw Gateway (`packages/openclaw-plugin`),
have been fully removed from the repo — decommissioned per
[ADR-0075](../../04-governance/adr/0075-openclaw-gateway-decommissioned.md).
There is no pending re-home; nothing to add a filter for.

## Adding a new service to the filter

When you add a new deployable service (e.g. a worker) or a second Vercel
project (e.g. a marketing site):

1. **Vercel**: in the new project's `vercel.json`, set
   `"ignoreCommand": "npx --yes turbo@2 query affected --base=\"$VERCEL_GIT_PREVIOUS_SHA\" --packages @sergeant/<workspace-name> --exit-code || exit 1"`.
2. **GitHub Actions**: give the service its own deploy workflow, figure out the
   transitive closure of its `@sergeant/*` deps (`pnpm list --filter @sergeant/<name>`
   or read its `package.json`), and put that path list under `on.push.paths`.
3. Document the new service's path set under its own subsection above.
4. Land the policy change in the same PR as the service creation so the
   filter exists from day one (avoids a transient "every push deploys"
   period).

## Failure mode — if a deploy is missed

If a real bug-fix landed in `main` but the corresponding service didn't
deploy because its pattern didn't match the change set (e.g. the fix was
a follow-up tweak in a path nobody added to `on.push.paths`):

- **Manual redeploy**: for the API, re-run [`deploy-api.yml`](../../../.github/workflows/deploy-api.yml) via **Actions → Deploy API image → Run workflow** (`workflow_dispatch`), or dernути Coolify deploy-webhook напряму. In Vercel, **Deployments → Redeploy** without the cache.
- **Append the missing path** to `deploy-api.yml` `on.push.paths` (API) or check whether the path is reachable from `@sergeant/web` (Vercel `turbo query affected`).
- **Update this doc** with the added path and the rationale (one-line PR comment is enough).

The point of the filter is to stop **needless** deploys, not to gatekeep
real changes — when in doubt, widen the pattern set.

## Related

- [`./vercel.md`](./vercel.md) — Vercel project settings + headers contract
- [`service-catalog.md`](../../02-engineering/architecture/service-catalog.md) — актуальний перелік сервісів і статус OpenClaw Gateway
- [`../../04-governance/adr/0074-hosting-hetzner-coolify.md`](../../04-governance/adr/0074-hosting-hetzner-coolify.md) — чинна бекенд-топологія (Hetzner + Coolify)
- [`../adr/0009-hosting-split-railway-vercel.md`](../../04-governance/adr/0009-hosting-split-railway-vercel.md) — попередній Railway + Vercel split (superseded ADR-0074)
- [`../playbooks/hotfix-prod-regression.md`](../../00-start/playbooks/hotfix-prod-regression.md) — emergency rollback
