# Rule 20 — No OpenClaw PATs in production

> **Category:** `blocker-invariant`
> **Severity:** `blocker`
> **Last validated:** 2026-05-09 by @Skords-01
> **Next review:** 2026-08-07
> **Status:** Active

> Per-rule canonical body for Hard Rule #20. Compact summary lives in [`AGENTS.md § Hard rules`](../../../AGENTS.md#hard-rules-do-not-break) (rendered as a table). The machine-readable registry lives in [`docs/governance/hard-rules.json`](../hard-rules.json). The 3-way sync (AGENTS.md ↔ JSON ↔ this file) is enforced by `pnpm lint:hard-rules-registry`.

## Scope

- `apps/server/src/env.ts`
- `apps/server/src/env/env.ts`
- `apps/server/src/modules/openclaw/**`

## Enforced by

- **test** — apps/server/src/env/**tests**/assertStartupEnv.test.ts (Hard Rule #20 suite)
- **convention** — apps/server/src/env/env.ts → assertStartupEnv() throws when OPENCLAW_GITHUB_PAT or Git_PAT is present in production
- **doc** — docs/playbooks/rotate-openclaw-credentials.md

## Why / What is enforced

> Why a hard rule? До stack-pulse-2026-05 PR-06 OpenClaw авторизувався у GitHub довго-живущим PAT-ом (`OPENCLAW_GITHUB_PAT`, з Devin-конвенційним `Git_PAT` fallback-ом). PAT-и не мають TTL, видно за актором у audit log як user а не bot, і витік дає атакеру `contents:read` + `pull-requests:write` на репо до моменту, коли хтось помітить аномалію в логах. Phase 1 (PR #1816) завів App-flow поряд з PAT-flow за feature-прапором; Phase 2 (поточний PR) — видалив PAT-flow з коду й env-схеми та підняв `assertStartupEnv()`, що не дає prod-серверу стартувати, поки залишок PAT-у лежить у secret-store.

**Rule.** У production (`NODE_ENV=production` або `RAILWAY_ENVIRONMENT=production`) OpenClaw авторизується у GitHub **виключно** через GitHub App-flow (`OPENCLAW_GITHUB_APP_ID` + `OPENCLAW_GITHUB_APP_PRIVATE_KEY` + `OPENCLAW_GITHUB_APP_INSTALLATION_ID`). Жодне з:

- `OPENCLAW_GITHUB_PAT`
- `Git_PAT`

— не має бути виставлене у production-середовищі. Якщо виставлене — `assertStartupEnv()` (див. [`apps/server/src/env/env.ts`](./apps/server/src/env/env.ts)) кидає `Hard Rule #20 violated: …`, сервер не стартує, операторові видно misconfig до того, як він стане інцидентом.

**Що блокує:**

- `OPENCLAW_GITHUB_PAT=ghp_…` у production env-vars (Vercel / Railway / будь-яке `process.env`) — startup throw.
- `Git_PAT=ghp_…` у production env-vars — startup throw (Devin-конвенція не повинна тікти у prod).
- `source: "pat"` у `OpenclawGithubAuth` — типи Phase 2 фіксують `source: "app"` як literal-type, тому будь-який легасі `if (auth.source === "pat")` падає на `tsc`.

**What this rule does NOT block:**

- `Git_PAT` у Devin VM org-secret для CLI git operations поза prod-сервером — це конвенція, що живе на VM, а не у Sergeant production.
- `OPENCLAW_GITHUB_PAT` у `NODE_ENV=development` / `NODE_ENV=test` — локальні dev-сервери і CI можуть мати legacy токен у `process.env`, hard-block спрацьовує лише у prod.
- Відсутність `OPENCLAW_GITHUB_APP_*` змінних — це окрема failure mode (`getOpenclawGithubAuth()` повертає null, caller бачить `status: 'not_configured'`), не violation цього правила.

Procedure для ротації / емержансі — [`docs/playbooks/rotate-openclaw-credentials.md`](./docs/playbooks/rotate-openclaw-credentials.md). Migration-план — [`docs/initiatives/stack-pulse-2026-05/pr-06-openclaw-github-app.md`](./docs/initiatives/stack-pulse-2026-05/pr-06-openclaw-github-app.md).

## Related

- **doc** — docs/initiatives/stack-pulse-2026-05/pr-06-openclaw-github-app.md
- **agents** — #20
