# Monorepo deploy filtering — Vercel ignoreCommand + Railway watchPatterns

> **Last validated:** 2026-05-09 by @Skords-01. **Next review:** 2026-08-07.
> **Status:** Active

Sergeant ships three production surfaces from one `main` branch:

- `apps/web` → Vercel
- `apps/server` → Railway service `Sergeant`
- `tools/console` → Railway service `sergeant-openclaw` (config-as-code path
  `railway.console.toml`)

Without filtering, **every push to `main` triggers all three deploys**, even
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

## Railway — `watchPatterns` per service / environment

Railway honours `watchPatterns` on the **service-instance** level (per
service × environment). When non-empty, a push triggers a deploy only if
at least one changed path matches at least one pattern.

Both production services have explicit watch patterns set via the Railway
GraphQL API. **They are NOT in `railway.toml` / `railway.console.toml`** —
Railway intentionally only allows config-as-code for build/runtime fields,
not for source/git-trigger settings (those live in the project DB only).

The state of record is the GraphQL API; this doc is the human-readable
mirror.

### Service `Sergeant` (api) — service id `accea0e9-a138-45a3-bff1-58a9bae8ff6c`

```
apps/server/**
packages/config/**
packages/db-schema/**
packages/design-tokens/**
packages/finyk-domain/**
packages/shared/**
Dockerfile.api
railway.toml
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
turbo.json
.npmrc
.nvmrc
patches/**
```

Rationale:

- `apps/server` is the unit being deployed.
- The package list is the **transitive closure of `apps/server/package.json`'s `@sergeant/*` deps**: `apps/server` → `{config, db-schema, finyk-domain, shared}`; `shared` → `design-tokens`. If a new direct or transitive `@sergeant/*` dep is added, **append it here** (and update this doc).
- `Dockerfile.api`, `railway.toml`, root manifest files (`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `turbo.json`), `.npmrc`, `.nvmrc`, `patches/**` — anything that affects the build but lives at repo root.

### Service `sergeant-openclaw` (console) — service id `5f3248d1-5a67-4702-81ee-1371f9d31191`

```
tools/console/**
packages/config/**
Dockerfile.console
railway.console.toml
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
turbo.json
.npmrc
.nvmrc
patches/**
```

Rationale:

- `tools/console/package.json` only depends on `@sergeant/config`. Keep this list narrower than `Sergeant`'s on purpose — long-poll grammy bots are sensitive to needless restarts (per [`./console.md`](./console.md) §Build / runtime, the service is `restartPolicyType=ON_FAILURE` for exactly this reason).
- `railway.console.toml` is the config-as-code file; `Dockerfile.console` is the build input.

### Read / update via GraphQL

Set the following environment variables (look up the IDs in the
[`./console.md`](./console.md) §«Project / environment» section and in the
service-IDs noted in the per-service subsections above):

```text
RAILWAY_TOKEN  — workspace-scoped Railway API token
PROJECT_ID     — humorous-eagerness project id
ENV_ID         — production environment id
SERVICE_ID     — service id (api or console — pick one)
```

Read current state:

```bash
curl -sS -X POST https://backboard.railway.com/graphql/v2 \
  -H "Authorization: Bearer $RAILWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"{ serviceInstance(serviceId: \\\"$SERVICE_ID\\\", environmentId: \\\"$ENV_ID\\\") { watchPatterns } }\"}"
```

Update:

```bash
curl -sS -X POST https://backboard.railway.com/graphql/v2 \
  -H "Authorization: Bearer $RAILWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation Update($serviceId: String!, $environmentId: String!, $input: ServiceInstanceUpdateInput!) { serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input) }",
    "variables": {
      "serviceId": "'"$SERVICE_ID"'",
      "environmentId": "'"$ENV_ID"'",
      "input": { "watchPatterns": ["apps/server/**", "…"] }
    }
  }'
```

The mutation returns `{"data":{"serviceInstanceUpdate": true}}` on success
and applies immediately (no service restart required — Railway recomputes
the deploy trigger on the next push).

## Adding a new service to the filter

When you add a fourth Railway service (e.g. a worker) or a second Vercel
project (e.g. a marketing site):

1. **Vercel**: in the new project's `vercel.json`, set
   `"ignoreCommand": "npx --yes turbo-ignore @sergeant/<workspace-name> --fallback=HEAD^1"`.
2. **Railway**: figure out the transitive closure of the new service's
   `@sergeant/*` deps (`pnpm list --filter @sergeant/<name>` or read its
   `package.json`), then call `serviceInstanceUpdate` with the
   corresponding `watchPatterns`.
3. Document the new service's pattern set under its own subsection above.
4. Land the policy change in the same PR as the service creation so the
   filter exists from day one (avoids a transient "every push deploys"
   period).

## Failure mode — if a deploy is missed

If a real bug-fix landed in `main` but the corresponding service didn't
deploy because its pattern didn't match the change set (e.g. the fix was
a follow-up tweak in a path nobody added to `watchPatterns`):

- **Manual redeploy**: in Railway UI for the affected service, **Deploy → Deploy** the latest commit. In Vercel, **Deployments → Redeploy** without the cache.
- **Append the missing path** to the service's `watchPatterns` (Railway) or check whether the path is reachable from `@sergeant/web` (Vercel `turbo-ignore`).
- **Update this doc** with the added path and the rationale (one-line PR comment is enough).

The point of the filter is to stop **needless** deploys, not to gatekeep
real changes — when in doubt, widen the pattern set.

## Related

- [`./vercel.md`](./vercel.md) — Vercel project settings + headers contract
- [`./console.md`](./console.md) — `sergeant-openclaw` deploy walkthrough
- [`../integrations/railway-vercel.md`](../integrations/railway-vercel.md) — platform setup
- [`../adr/0009-hosting-split-railway-vercel.md`](../adr/0009-hosting-split-railway-vercel.md) — why Railway + Vercel
- [`../playbooks/hotfix-prod-regression.md`](../playbooks/hotfix-prod-regression.md) — emergency rollback
