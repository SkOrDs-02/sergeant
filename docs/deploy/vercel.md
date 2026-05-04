# Deploy — Vercel (apps/web SPA)

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-04.
> **Status:** Active

Vercel hosts the React PWA from `apps/web`. The API surface lives on Railway —
see [`../integrations/railway-vercel.md`](../integrations/railway-vercel.md) for
the platform split rationale and [`../adr/0009-hosting-split-railway-vercel.md`](../adr/0009-hosting-split-railway-vercel.md)
for the architectural decision.

## Single source of truth: `vercel.json` lives at the repo root

> **Hard rule.** The repository ships exactly **one** `vercel.json`, located at
> the monorepo root. A duplicate `vercel.json` under `apps/web/` MUST NOT
> exist. CI enforces this via `scripts/check-vercel-config.sh` (wired into the
> `check` job in `.github/workflows/ci.yml`).

Why a single file at the root, instead of one per app:

1. **Vercel reads exactly one `vercel.json`** — whichever lives under the
   project's "Root Directory" setting. If we kept both files, a Vercel UI
   change to "Root Directory" would silently swap which security headers
   protect production. The drift was [hardening card H7](../security/hardening/H7-vercel-config-drift.md);
   this page is the long-term remediation.
2. **Pnpm + Turborepo convention.** Build commands routinely span multiple
   workspace packages (e.g. `pnpm --filter @sergeant/db-schema build && pnpm
--filter @sergeant/web build` — see the `buildCommand` in the active
   `vercel.json`). Those commands need the workspace root as their cwd, so
   "Root Directory = `/`" is the only configuration that makes builds
   reproducible. Per-app `vercel.json` files implicitly assume "Root Directory
   = the app's folder" and break the cross-package build pipeline.
3. **Audit trail.** With a single file, `git log -- vercel.json` is the full
   history of every header / rewrite / cache rule shipped to production. With
   two files, the operator has to remember which one was active at the time of
   an incident.

## Vercel project settings (production + preview)

These match the assumptions baked into the root `vercel.json`. Out-of-repo
settings live in the Vercel UI under **Project → Settings → General**:

| Setting             | Required value             | Why                                                                           |
| ------------------- | -------------------------- | ----------------------------------------------------------------------------- |
| Root Directory      | `/`                        | Monorepo build commands cross workspace packages — see "Single source" above. |
| Framework Preset    | Other                      | We override with `installCommand` + `buildCommand` in `vercel.json`.          |
| Output Directory    | `apps/web/dist`            | Set in `vercel.json` (`outputDirectory`); Vercel UI must match.               |
| Install Command     | `(from vercel.json)`       | Vercel honours `installCommand` from `vercel.json`; UI override is empty.     |
| Build Command       | `(from vercel.json)`       | Same — leave blank in UI to defer to the file.                                |
| Node.js Version     | `20.x`                     | Matches `package.json:engines.node` and `.nvmrc`.                             |
| Skip Build for Docs | enabled (`docs/**` ignore) | Optional; CI handles docs-freshness separately.                               |

Verify after every Vercel UI change:

```bash
# A successful preview-deploy must still ship the COOP header.
curl -sI "$(vercel inspect <deployment-url> --token=$VERCEL_TOKEN | jq -r '.url')" \
  | grep -i 'cross-origin-opener-policy'
# Expected: Cross-Origin-Opener-Policy: same-origin
```

## Headers contract

Every header that ships to browsers from `apps/web` is defined in the root
`vercel.json` `headers[*]` blocks. Cross-cutting headers (CSP, COOP/COEP,
Permissions-Policy, Referrer-Policy) live under `source: "/(.*)"`. Path-scoped
headers (e.g. cache-control on `/assets/*`, well-known mime types) get their
own block.

When tightening a header, follow [`../security/hardening/C2-frontend-csp.md`](../security/hardening/C2-frontend-csp.md)
for the Report-Only → Enforce rollout pattern. Do **not** ship a stricter
policy without a Report-Only canary first.

## Incident playbook

If a production deploy regresses headers (e.g. CSP missing in DevTools):

1. Check `git log -- vercel.json` — was the file edited recently?
2. Check Vercel UI → "Root Directory" — is it still `/`?
3. Re-run `bash scripts/check-vercel-config.sh` locally to confirm no
   second `vercel.json` snuck in via a partial revert.
4. If headers truly regressed in production, trigger a rollback via
   `vercel rollback` to the last known-good deployment ID — `vercel ls
--token=$VERCEL_TOKEN` gives the list. See
   [`../playbooks/hotfix-prod-regression.md`](../playbooks/hotfix-prod-regression.md)
   for the full rollback recipe.

## Cross-references

- [`../security/hardening/H7-vercel-config-drift.md`](../security/hardening/H7-vercel-config-drift.md) — original drift card (this doc closes it).
- [`../security/hardening/C2-frontend-csp.md`](../security/hardening/C2-frontend-csp.md) — CSP rollout playbook for `vercel.json`.
- [`../integrations/railway-vercel.md`](../integrations/railway-vercel.md) — Railway/Vercel platform setup.
- [`../adr/0009-hosting-split-railway-vercel.md`](../adr/0009-hosting-split-railway-vercel.md) — why the split exists.
- [`../security/disaster-recovery.md`](../security/disaster-recovery.md) — Vercel re-deploy procedure.
