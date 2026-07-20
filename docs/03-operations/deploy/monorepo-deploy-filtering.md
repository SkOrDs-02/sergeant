# Monorepo deploy filtering — Vercel ignoreCommand + GitHub Actions path filters

> **Last touched:** 2026-07-20 by @Skords-01. **Next review:** 2026-10-18.
> **Status:** Active
>
> **⚠️ Бекенд-тригер переписано ([ADR-0074](../../04-governance/adr/0074-hosting-hetzner-coolify.md)):** `apps/server` більше **не** деплоїться через Railway `watchPatterns`/GraphQL — тепер це GitHub Actions [`deploy-api.yml`](../../../.github/workflows/deploy-api.yml) з `on.push.paths`, що білдить образ → `ghcr.io` → Coolify webhook. Файли `railway*.toml` видалено з репо 2026-07-19. OpenClaw Gateway ніде не задеплоєний (див. [`service-catalog.md`](../../02-engineering/architecture/service-catalog.md)). Vercel-секція нижче чинна без змін.

Sergeant ships production surfaces from one `main` branch:

- `apps/web` → Vercel (`ignoreCommand` + `turbo-ignore`)
- `apps/server` → образ на `ghcr.io` → Coolify на Hetzner VPS (GitHub Actions `on.push.paths`)

Without filtering, **every push to `main` triggers both deploys**, even
for `docs/**`-only or `apps/mobile/**`-only changes. That wastes build
minutes, churns Sentry release annotations, and creates unnecessary deploy
events in `#deploys` Telegram alerts (n8n routes them per [`../observability/runbook.md`](../observability/runbook.md)).

This page is the canonical recipe for the **per-surface deploy filters**
that keep the trunk-based workflow cheap.

## Vercel — `ignoreCommand` in `apps/web/vercel.json`

```json
"ignoreCommand": "npx --yes turbo-ignore @sergeant/web --fallback=HEAD^1"
```

`turbo-ignore` reads `turbo.json` + workspace deps and exits with:

- **`1`** if `@sergeant/web` (or any of its workspace deps — `@sergeant/{config,db-schema,design-tokens,shared}` etc.) changed since the last successful deploy → Vercel **builds**.
- **`0`** if nothing in that subtree changed → Vercel **skips** (you'll see "Build skipped" in the deployment list).

`--fallback=HEAD^1` is the safety net for first deploys and clean clones
where Vercel has no `VERCEL_GIT_PREVIOUS_SHA` cache to compare against. In
that case it compares against the immediately previous commit instead of
falling back to "always build".

> **Note on deprecation.** As of Turbo 2.9, `turbo-ignore` prints a
> deprecation warning and recommends `turbo query affected` instead. The
> tool still works correctly and is what Vercel's official monorepo docs
> recommend today. Migrate when Vercel's recipe catches up. Tracked in the
> Turbo upgrade card.

### Verify locally

```bash
cd apps/web
# On a branch that touches apps/web/** — must exit 1 (build):
npx --yes turbo-ignore @sergeant/web --fallback=HEAD^1; echo "exit=$?"
# On a docs-only commit — must exit 0 (skip).
```

### Verify on Vercel after merge

1. Open the deployment list in the Vercel UI for project `sergeant-web`.
2. After landing a `docs/**`-only PR, the corresponding deployment row
   should show **"Build skipped"** with the reason "Build skipped due to
   ignored build step".
3. After landing a PR that touches `apps/web/**` or any workspace dep, the
   deployment must show **"Ready"** (built and promoted to Production for
   the production branch).

If a docs-only deploy still builds, double-check that `ignoreCommand` is
exactly the value above in `apps/web/vercel.json`. Vercel UI must NOT
override it (the "Ignored Build Step" field in **Settings → Git** stays
empty — config-as-code wins).

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

### OpenClaw — not deployed

There is **no** OpenClaw deploy in the filter. The former `tools/openclaw` grammy
bot was removed from the repo (replaced by [`packages/openclaw-plugin`](../../../packages/openclaw-plugin)),
and `sergeant-openclaw-gateway` is not deployed anywhere — migration to Coolify
or deprecation is TBD (see [`service-catalog.md`](../../02-engineering/architecture/service-catalog.md)). When it
lands, add its own workflow/path-filter here.

## Adding a new service to the filter

When you add a new deployable service (e.g. a worker) or a second Vercel
project (e.g. a marketing site):

1. **Vercel**: in the new project's `vercel.json`, set
   `"ignoreCommand": "npx --yes turbo-ignore @sergeant/<workspace-name> --fallback=HEAD^1"`.
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
- **Append the missing path** to `deploy-api.yml` `on.push.paths` (API) or check whether the path is reachable from `@sergeant/web` (Vercel `turbo-ignore`).
- **Update this doc** with the added path and the rationale (one-line PR comment is enough).

The point of the filter is to stop **needless** deploys, not to gatekeep
real changes — when in doubt, widen the pattern set.

## Related

- [`./vercel.md`](./vercel.md) — Vercel project settings + headers contract
- [`service-catalog.md`](../../02-engineering/architecture/service-catalog.md) — актуальний перелік сервісів і статус OpenClaw Gateway
- [`../../04-governance/adr/0074-hosting-hetzner-coolify.md`](../../04-governance/adr/0074-hosting-hetzner-coolify.md) — чинна бекенд-топологія (Hetzner + Coolify)
- [`../adr/0009-hosting-split-railway-vercel.md`](../../04-governance/adr/0009-hosting-split-railway-vercel.md) — попередній Railway + Vercel split (superseded ADR-0074)
- [`../playbooks/hotfix-prod-regression.md`](../../00-start/playbooks/hotfix-prod-regression.md) — emergency rollback
