# Deploy — Vercel (apps/web SPA)

> **Last validated:** 2026-05-13 by @andrijvigrav. **Next review:** 2026-08-11.
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

| Setting           | Required value       | Why                                                                                                                                                                                                                          |
| ----------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root Directory    | `apps/web`           | The project deploys the PWA in `apps/web`; Vercel reads `apps/web/vercel.json` from this setting.                                                                                                                            |
| Framework Preset  | Other                | We override with `installCommand` + `buildCommand` in `vercel.json`.                                                                                                                                                         |
| Output Directory  | `dist`               | Set in `vercel.json` (`outputDirectory`, relative to Root Directory); Vercel UI must match.                                                                                                                                  |
| Install Command   | `(from vercel.json)` | Vercel honours `installCommand` from `vercel.json`; UI override is empty.                                                                                                                                                    |
| Build Command     | `(from vercel.json)` | Same — leave blank in UI to defer to the file.                                                                                                                                                                               |
| Ignored Build Cmd | `(from vercel.json)` | `ignoreCommand` in `vercel.json` runs `turbo-ignore @sergeant/web` so commits that don't touch `@sergeant/web` or its workspace deps skip the build. See [`./monorepo-deploy-filtering.md`](./monorepo-deploy-filtering.md). |
| Node.js Version   | `20.x`               | Matches `package.json:engines.node` and `.nvmrc`.                                                                                                                                                                            |

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

## Third-party iframe / cross-origin compatibility

> Tracked by [M21 — `docs/security/hardening/M21-coep-stripe-compatibility.md`](../security/hardening/M21-coep-stripe-compatibility.md).
> This section is the canonical compatibility matrix for the
> `Cross-Origin-Embedder-Policy: require-corp` posture set in
> `apps/web/vercel.json`.

`COEP: require-corp` blocks any cross-origin subresource (image, script,
iframe) that does not explicitly opt in via `Cross-Origin-Resource-Policy:
cross-origin` (or, for some flows, valid CORS headers). It is what allows
the page to be `crossOriginIsolated`, which is in turn what unlocks
`SharedArrayBuffer` and the OPFS Worker VFS used by SQLite-WASM.

### Why we are on `require-corp` today (and not the softer alternatives)

| Option           | Effect                                                         | Sergeant verdict                                                                                                                                     |
| ---------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unsafe-none`    | No isolation; `crossOriginIsolated === false`                  | **Reject.** Disables `SharedArrayBuffer` → SQLite-WASM falls back to OPFS-SAH-Pool / kvvfs. Slower writes; see `apps/web/src/core/db/sqlite.ts:148`. |
| `credentialless` | Cross-origin subresources load without cookies; no CORP needed | Future option if a third-party CDN refuses to send CORP headers. Caniuse coverage is wide enough today (Chrome 96+, Firefox 119+, Safari 17.5+).     |
| `require-corp`   | Strict — cross-origin must opt in                              | **Current.** Matches the `crossOriginIsolated` requirement for the SQLite-WASM Worker VFS path.                                                      |

### Compatibility matrix (per third-party integration)

The matrix is verified manually before any new third-party iframe / SDK
ships. Re-run the verification when bumping a third-party SDK major
version or when COEP / CSP is widened.

| Integration                  | Surface                                                      | Used today                                                    | COEP `require-corp` compatible | Notes / verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sentry SDK + session replay  | JS bundle from `*.sentry-cdn.com` / `*.sentry.io`; no iframe | Yes (`apps/web/src/core/observability/sentry.ts`)             | Yes                            | Loaded as a JS module; egress over `connect-src https://*.sentry.io https://*.ingest.sentry.io` — does not need CORP. Replay payloads ride the same `connect-src` channel.                                                                                                                                                                                                                                                                                                                      |
| PostHog SDK + session replay | JS bundle from `*.posthog.com`; no iframe                    | Yes (`apps/web/src/core/observability/posthog.ts`)            | Yes                            | Same as Sentry — JS module, no iframe. CSP `connect-src` allowlists `https://*.posthog.com` (covered by [L11](../security/hardening/L11-csp-monitoring-allowlist.md)).                                                                                                                                                                                                                                                                                                                          |
| Mono webhook surface         | Server-side only (Railway)                                   | Yes                                                           | N/A                            | No browser iframe. Mono dashboards are accessed by the operator, not embedded.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| OpenFoodFacts (OFF) lookup   | `fetch` over HTTPS                                           | Yes (nutrition module)                                        | Yes                            | `connect-src` only; not an iframe.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Stripe Checkout / Elements   | Cross-origin iframe from `js.stripe.com`                     | **No** (planned, see `apps/web/src/core/PricingPage.tsx:12`)  | **No without changes**         | Stripe.js loads `js.stripe.com` then injects a `<iframe>` from `https://hooks.stripe.com` / `https://m.stripe.com`. These origins do not advertise CORP — under `require-corp` the iframe fails with `ERR_BLOCKED_BY_RESPONSE`. Decision when Stripe ships: switch COEP to `credentialless` for `/(.*)` _or_ scope `unsafe-none` to billing routes via a `vercel.json` source-glob. Record the decision in this matrix and add an [audit-exceptions.md](../security/audit-exceptions.md) entry. |
| Google OAuth silent refresh  | Hidden iframe from `accounts.google.com`                     | No (Better Auth ships email + magic-link only)                | **No without changes**         | Same posture as Stripe — would require COEP downgrade or iframe removal in favour of redirect-based OAuth.                                                                                                                                                                                                                                                                                                                                                                                      |
| YouTube / Vimeo embeds       | Cross-origin iframe                                          | No                                                            | No                             | Not needed today. If marketing pages add an embed, they live on `apps/marketing/*` (separate Vercel project) — out of scope for this matrix.                                                                                                                                                                                                                                                                                                                                                    |
| Telegram bot login widget    | Cross-origin iframe from `oauth.telegram.org`                | No (operator console runs in a Telegram chat, not in the SPA) | No                             | Out of scope unless a "Connect Telegram" web flow is added.                                                                                                                                                                                                                                                                                                                                                                                                                                     |

### Verification recipe (per integration)

When introducing or bumping a third-party SDK / iframe:

1. Open the staging deploy in Chrome with DevTools → Network panel.
2. Trigger the third-party flow (e.g. open the Stripe Checkout sandbox link,
   start a Sentry replay, expand a PostHog feature flag).
3. Confirm no console error matches `ERR_BLOCKED_BY_RESPONSE` (COEP) or
   `Refused to (load|connect)` (CSP).
4. If a block fires:
   - **CSP:** widen the relevant directive in `vercel.json` and re-test —
     keep the policy in `Content-Security-Policy-Report-Only` for the
     rollout window per [C2](../security/hardening/C2-frontend-csp.md).
   - **COEP:** decide between (a) downgrade COEP for the affected route
     glob, (b) switch the page-wide policy to `credentialless`, or (c)
     replace the iframe with a redirect-based flow. Whichever path,
     update this matrix and link the decision PR.
5. Run the regression tests:
   - `pnpm --filter @sergeant/web test` — covers
     [`cspMonitoringAllowlist.test.ts`](../../apps/web/src/test/cspMonitoringAllowlist.test.ts)
     and the L4 / L11 fallback assertions.
   - `pnpm --filter @sergeant/server test src/http/security.test.ts` —
     covers L5 (`X-DNS-Prefetch-Control: off`) and L6
     (`X-Content-Type-Options: nosniff`).

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
