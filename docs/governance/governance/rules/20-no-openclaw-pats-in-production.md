# Rule 20 — No OpenClaw PATs in production

> **Category:** `blocker-invariant`
> **Severity:** `blocker`
> **Last touched:** 2026-09-17 by @claude (мертвий `stack-pulse` шлях у Related → permalink). **Next review:** 2026-12-16.
> **Status:** Active

> Per-rule canonical body for Hard Rule #20. Compact summary lives in [`AGENTS.md § Hard rules`](../../../../AGENTS.md#hard-rules-do-not-break) (rendered as a table). The machine-readable registry lives in [`docs/governance/governance/hard-rules.json`](../hard-rules.json). The 3-way sync (AGENTS.md ↔ JSON ↔ this file) is enforced by `pnpm lint:hard-rules-registry`.

## Scope

- `apps/server/src/env.ts`
- `apps/server/src/env/env.ts`

## Enforced by

- **test** — apps/server/src/env/**tests**/assertStartupEnv.test.ts (Hard Rule #20 suite)
- **convention** — apps/server/src/env/env.ts → assertStartupEnv() throws when OPENCLAW_GITHUB_PAT or Git_PAT is present in production
- **doc** — docs/start/instructions/rotate-openclaw-credentials.md

## Why / What is enforced

> **Стан після [ADR-0075](../../adr/0075-openclaw-gateway-decommissioned.md) (2026-07-20).** OpenClaw, його GitHub-App-flow і модуль `apps/server/src/modules/openclaw/` видалено з репо. Правило **не знімається** (ADR-0075 § «Що свідомо лишається»): `assertStartupEnv()` і далі відмовляє prod-серверу стартувати, якщо `OPENCLAW_GITHUB_PAT` або `Git_PAT` лежить у `process.env` — це defense-in-depth проти залишкового PAT-у в secret-store, а не жива інтеграція. Абзаци про App-flow і Phase 1/2 нижче — історичний контекст рішення.

> Why a hard rule? До stack-pulse-2026-05 PR-06 OpenClaw авторизувався у GitHub довго-живущим PAT-ом (`OPENCLAW_GITHUB_PAT`, з Devin-конвенційним `Git_PAT` fallback-ом). PAT-и не мають TTL, видно за актором у audit log як user а не bot, і витік дає атакеру `contents:read` + `pull-requests:write` на репо до моменту, коли хтось помітить аномалію в логах. Phase 1 (PR #1816) завів App-flow поряд з PAT-flow за feature-прапором; Phase 2 (поточний PR) — видалив PAT-flow з коду й env-схеми та підняв `assertStartupEnv()`, що не дає prod-серверу стартувати, поки залишок PAT-у лежить у secret-store.

**Rule.** У production (`NODE_ENV=production` або `APP_ENV=production` — `isDeployedProduction()`; Railway-сигнали зняті після ADR-0074) жодне з:

- `OPENCLAW_GITHUB_PAT`
- `Git_PAT`

— не має бути виставлене у production-середовищі. Якщо виставлене — `assertStartupEnv()` (див. [`apps/server/src/env/env.ts`](../../../../apps/server/src/env/env.ts)) кидає `Hard Rule #20 violated: …`, сервер не стартує, операторові видно misconfig до того, як він стане інцидентом.

**Що блокує:**

- `OPENCLAW_GITHUB_PAT=ghp_…` у production env-vars (Coolify / будь-яке `process.env`) — startup throw.
- `Git_PAT=ghp_…` у production env-vars — startup throw (Devin-конвенція не повинна тікти у prod).
- (історично, до ADR-0075) `source: "pat"` у `OpenclawGithubAuth` — типи Phase 2 фіксували `source: "app"` як literal-type; разом із модулем видалено й типи, тож у коді цього шляху більше немає.

**What this rule does NOT block:**

- `Git_PAT` поза prod-сервером Sergeant (історично — org-secret на Devin VM для CLI git; Devin retired [ADR-0088](../../adr/0088-devin-kilo-harness-retirement.md)) — правило стосується лише production `process.env` сервера.
- `OPENCLAW_GITHUB_PAT` у `NODE_ENV=development` / `NODE_ENV=test` — локальні dev-сервери і CI можуть мати legacy токен у `process.env`, hard-block спрацьовує лише у prod.

Playbook [`rotate-openclaw-credentials.md`](../../../start/instructions/rotate-openclaw-credentials.md) — Deprecated redirect-стаб: живих кроків ротації немає, бо немає чого ротувати; якщо PAT усе ж знайшовся у secret-store — просто видали його. Історичний migration-план — [`docs/work/specs/initiatives/stack-pulse-2026-05/pr-06-openclaw-github-app.md`](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/initiatives/archive/stack-pulse-2026-05/archive/pr-06-openclaw-github-app.md).

## Related

- **doc** — [stack-pulse-2026-05 PR-06 — OpenClaw GitHub App](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/initiatives/archive/stack-pulse-2026-05/archive/pr-06-openclaw-github-app.md) (permalink — файл знято з чекауту)
- **agents** — #20

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                     | Title                                                                              | Merged     |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------- | ---------- |
| [#61](https://github.com/zaebal-beep/sergeant/pull/61) | docs(docs): governance — прибрати застаріле з ADR-індексу, governance/ і security/ | 2026-09-16 |

_Auto-derived from `docs/governance/pr-ledger/index.json`. Top 1 most recent PRs touching this file._
<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
