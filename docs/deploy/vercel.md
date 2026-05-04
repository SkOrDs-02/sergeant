# Deploy — Vercel (apps/web SPA)

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-04.
> **Status:** Active

Vercel hosts the React PWA from `apps/web`. The API surface lives on Railway —
see [`../integrations/railway-vercel.md`](../integrations/railway-vercel.md) for
the platform split rationale and [`../adr/0009-hosting-split-railway-vercel.md`](../adr/0009-hosting-split-railway-vercel.md)
for the architectural decision.

## Single source of truth: `vercel.json` lives at `apps/web/vercel.json`

> **Hard rule.** The repository ships exactly **one** `vercel.json`, located at
> `apps/web/vercel.json`. A duplicate `vercel.json` at the monorepo root (or
> anywhere else) MUST NOT exist. CI enforces this via
> `scripts/check-vercel-config.sh` (wired into the `check` job in
> `.github/workflows/ci.yml`).

Why this specific path:

1. **The Vercel project's "Root Directory" is `apps/web`.** Vercel reads
   `vercel.json` only from the configured Root Directory; any file outside
   that directory (notably a stray one at the monorepo root) is dead config
   that silently ages out. The drift problem is [hardening card H7](../security/hardening/H7-vercel-config-drift.md);
   this page is the long-term remediation.
2. **The build still spans the workspace.** Even though Root Directory is
   `apps/web`, `installCommand` and `buildCommand` in `vercel.json` run from
   that directory but can use `pnpm --filter` to reach sibling workspace
   packages — see `buildCommand: "pnpm --filter @sergeant/db-schema build &&
pnpm --filter @sergeant/web build"` in the active file. Without that
   pre-build, rolldown fails to resolve `@sergeant/db-schema/sqlite/migrations`
   at build time (this exact regression happened during the H7 fix in
   PR #1595 — see the incident log on the H7 card).
3. **Audit trail.** With a single file, `git log -- apps/web/vercel.json` is
   the full history of every header / rewrite / cache rule shipped to
   production. With two files, the operator has to remember which one was
   active at the time of an incident.

## Vercel project settings (production + preview)

These match the assumptions baked into `apps/web/vercel.json`. Out-of-repo
settings live in the Vercel UI under **Project → Settings → General**:

| Setting             | Required value             | Why                                                                                               |
| ------------------- | -------------------------- | ------------------------------------------------------------------------------------------------- |
| Root Directory      | `apps/web`                 | The project deploys the PWA in `apps/web`; Vercel reads `apps/web/vercel.json` from this setting. |
| Framework Preset    | Other                      | We override with `installCommand` + `buildCommand` in `vercel.json`.                              |
| Output Directory    | `dist`                     | Set in `vercel.json` (`outputDirectory`, relative to Root Directory); Vercel UI must match.       |
| Install Command     | `(from vercel.json)`       | Vercel honours `installCommand` from `vercel.json`; UI override is empty.                         |
| Build Command       | `(from vercel.json)`       | Same — leave blank in UI to defer to the file.                                                    |
| Node.js Version     | `20.x`                     | Matches `package.json:engines.node` and `.nvmrc`.                                                 |
| Skip Build for Docs | enabled (`docs/**` ignore) | Optional; CI handles docs-freshness separately.                                                   |

Verify after every Vercel UI change:

```bash
# A successful preview-deploy must still ship the COOP header.
curl -sI "$(vercel inspect <deployment-url> --token=$VERCEL_TOKEN | jq -r '.url')" \
  | grep -i 'cross-origin-opener-policy'
# Expected: Cross-Origin-Opener-Policy: same-origin
```

## Headers contract

Every header that ships to browsers from `apps/web` is defined in
`apps/web/vercel.json` `headers[*]` blocks. Cross-cutting headers (CSP,
COOP/COEP, Permissions-Policy, Referrer-Policy) live under `source: "/(.*)"`.
Path-scoped headers (e.g. cache-control on `/assets/*`, well-known mime types)
get their own block.

When tightening a header, follow [`../security/hardening/C2-frontend-csp.md`](../security/hardening/C2-frontend-csp.md)
for the Report-Only → Enforce rollout pattern. Do **not** ship a stricter
policy without a Report-Only canary first.

## Incident playbook

If a production deploy regresses headers (e.g. CSP missing in DevTools) or
fails outright (e.g. rolldown cannot resolve a workspace package):

1. Check `git log -- apps/web/vercel.json` — was the file edited or deleted
   recently? A missing `installCommand`/`buildCommand` will cause Vercel to
   skip the cross-workspace pre-build and break rolldown resolution of
   `@sergeant/db-schema/*`.
2. Check Vercel UI → "Root Directory" — is it still `apps/web`? If it was
   changed to `/`, Vercel will start reading a file that does not exist in
   this repo (we deleted the root copy in the H7 remediation) and fall back
   to defaults.
3. Re-run `bash scripts/check-vercel-config.sh` locally to confirm no
   second `vercel.json` snuck in via a partial revert.
4. If headers truly regressed in production, trigger a rollback via
   `vercel rollback` to the last known-good deployment ID — `vercel ls
--token=$VERCEL_TOKEN` gives the list. See
   [`../playbooks/hotfix-prod-regression.md`](../playbooks/hotfix-prod-regression.md)
   for the full rollback recipe.

## Cross-references

- [`../security/hardening/H7-vercel-config-drift.md`](../security/hardening/H7-vercel-config-drift.md)
- [`../security/hardening/C2-frontend-csp.md`](../security/hardening/C2-frontend-csp.md)
- [`../integrations/railway-vercel.md`](../integrations/railway-vercel.md)
- [`../adr/0009-hosting-split-railway-vercel.md`](../adr/0009-hosting-split-railway-vercel.md)
