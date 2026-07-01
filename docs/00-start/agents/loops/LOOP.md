<!-- LIFECYCLE: Active -->

# Loop Manifest — Autonomous Agent Workflows

> **Last touched:** 2026-07-01 by @claude (per-run brakes: max_turns/max_budget_usd/circuit_breaker/heartbeat). **Next review:** 2026-09-29.
> **Status:** Active
> **Source of truth:** [`registry.yaml`](./registry.yaml) (machine-readable, 10 loops)

Цей документ описує автономні agent loops, що працюють у Sergeant. На відміну від [`agent-skills-catalog.md`](../agent-skills-catalog.md), який каталогізує **всі** skills (23 шт, з ручним trigger), цей manifest обмежений **loops, що можуть запускатись без human-in-the-loop trigger** (scheduled, per-PR, per-batch, per-decision).

Loops існують у режимі **L1 report-only → L2 assisted fixes → L3 unattended** (phased rollout per `docs/loop-design-checklist` від loop-engineering convention). Поточний стан: **0 loops active unattended, 2 loops active report-only**.

## Active Loops

| Loop                                            | Owner skill                         | Cadence      | Phase | Enabled |
| ----------------------------------------------- | ----------------------------------- | ------------ | ----- | ------- |
| [pr-review](#pr-review)                         | `sergeant-review-and-merge`         | 5-15m        | L1    | No      |
| [tech-debt-sweep](#tech-debt-sweep)             | `sergeant-tech-debt`                | 6h-1d        | L2    | No      |
| [security-audit](#security-audit)               | `sergeant-security-audit`           | 1d           | L1    | No      |
| [migration-guard](#migration-guard)             | `sergeant-data-and-migrations`      | per-PR       | L2    | No      |
| [deploy-watch](#deploy-watch)                   | `sergeant-deploy-and-observability` | 5-15m        | L2    | No      |
| [e2e-flake-watch](#e2e-flake-watch)             | `sergeant-e2e-testing`              | per-PR       | L1    | No      |
| [review-squad-parallel](#review-squad-parallel) | `sergeant-review-squad`             | per-PR       | L1    | No      |
| [qa-squad-parallel](#qa-squad-parallel)         | `sergeant-qa-squad`                 | per-PR       | L1    | No      |
| [council-advisory](#council-advisory)           | `sergeant-council`                  | per-decision | L1    | **Yes** |
| [planning-batch](#planning-batch)               | `sergeant-planning-batch`           | per-batch    | L1    | **Yes** |

## Human Gates (cross-cutting)

Жоден loop не має права без human-in-the-loop:

- **Billing / payment paths** — Hard Rule #3 (API contract); `sergeant-server-api` блокує.
- **Auth, cookies, sessions** — `better-auth-best-practices` veto.
- **Production secrets, PATs, env vars** — Hard Rules #20/#21.
- **Hard rule amendments** — Hard Rule #15 + 26-rule ledger update.
- **DB destructive ops** — Hard Rule #4 (two-phase DROP).
- **Cross-surface PRs (3+ governed surfaces)** — automatic routing через `sergeant-review-squad` замість single-agent review.

Девіація від gates = pause loop + append до incident review.

## Budget & Kill Switch

- Token caps per loop (aggregate daily/monthly) — [`loop-budget.md`](./loop-budget.md).
- Per-run brakes (`max_turns`, `max_budget_usd`, `circuit_breaker` — hard stop on a single run, independent of aggregate cap) — [`loop-budget.md § Per-Run Brakes`](./loop-budget.md#per-run-brakes) + `registry.yaml.cost`.
- Heartbeat monitoring (`heartbeat_required` — alerting only, not a stop condition) — [`loop-budget.md § Dead-man's Heartbeat`](./loop-budget.md#dead-mans-heartbeat) + `registry.yaml.cost`.
- Kill switch: створити GitHub issue з label `loop-pause-all` + призначити `@SkOrDs-02`. Resume — після явного коментаря в issue та оновлення `enabled: true` у `registry.yaml`.
- Підозра на overspend → append event до Sentry (тег `loop-budget-exceeded`, `loop-circuit-breaker-tripped`, або `loop-heartbeat-silent`) + page on-call.

## Convention Source

Schema, phased rollout (L1/L2/L3), gates vocabulary і cost fields запозичено з [cobusgreyling/loop-engineering](https://github.com/cobusgreyling/loop-engineering) (`patterns/registry.yaml`, `docs/loop-design-checklist.md`). Ми **не** приймаємо `STATE.md` / `loop-run-log.md` артефакти (у нас є pr-ledger + freshness dashboard + Sentry, дубль недоречний).

---

## Per-Loop Detail

### pr-review

- **Goal:** React to open PRs with safety review, contract checks, docs freshness, commit scope.
- **Phases:** discover → triage → fix → verify → notify.
- **Gates:** billing, auth, security, breaking API, hard-rule amendments.
- **Hard rules:** #3, #6, #7, #15, #26.
- **Tools:** claude-code, kilo-code, codex, github-actions.
- **Counterpart:** `pr-babysitter` pattern у loop-engineering.
- **Cost:** [registry.yaml#pr-review](./registry.yaml) — suggested_daily_cap 1.5M tokens.

### tech-debt-sweep

- **Goal:** Discover dead code (Knip), ESLint baseline drift, module-size violations (#18).
- **Phases:** scan → prioritize → fix-small → ticket-large.
- **Gates:** architectural changes, baseline amendment, rule amendment.
- **Hard rules:** #18, #19, #26.
- **Tools:** claude-code, kilo-code, codex, github-actions.
- **Counterpart:** `dependency-sweeper` + `post-merge-cleanup` hybrid.
- **Cost:** 400k tokens/day cap.

### security-audit

- **Goal:** pnpm audit, secret scan, Pino redaction check (#21), Drizzle SQL review, CVE triage.
- **Phases:** scan → triage-risk → patch-safe → verify-worktree → escalate-risky.
- **Gates:** high-sev CVE, denylisted packages, auth-cookie changes, prod PAT.
- **Hard rules:** #20, #21, #22.
- **Tools:** claude-code, kilo-code, codex, github-actions.
- **Counterpart:** `dependency-sweeper` (security mode).
- **Cost:** 500k tokens/day cap.

### migration-guard

- **Goal:** Sequential-numbering check, two-phase DROP detection (#4), index audit on every PR touching `db-schema/`.
- **Phases:** detect → classify → block → escalate.
- **Gates:** DROP TABLE, gap in numbering, prod rollback required.
- **Hard rules:** #4.
- **Tools:** claude-code, kilo-code, codex, github-actions.
- **Counterpart:** `ci-sweeper` (DB-migration variant).
- **Cost:** 100k tokens/day cap. High risk per-run, low volume.

### deploy-watch

- **Goal:** React to deploy health, Sentry alerts, env drift, Railway incidents.
- **Phases:** detect → classify → page-human → file-postmortem.
- **Gates:** prod outage, secret rotation, DB migration on prod.
- **Hard rules:** #6, #21.
- **Tools:** claude-code, kilo-code, github-actions, sentry-webhooks.
- **Counterpart:** `ci-sweeper` (deploy variant).
- **Cost:** 500k tokens/day cap.

### e2e-flake-watch

- **Goal:** Detect and quarantine Playwright E2E flakes; surface new a11y regressions on PRs.
- **Phases:** detect → quarantine → propose-fix → escalate.
- **Gates:** seed-data change, role-selector change, infra change.
- **Tools:** claude-code, kilo-code, codex, github-actions.
- **Counterpart:** `ci-sweeper` (E2E variant).
- **Cost:** 100k tokens/day cap.

### review-squad-parallel

- **Goal:** Parallel lens coverage (contract, design, security, docs) for PRs touching 3+ governed surfaces.
- **Phases:** discover → fan-out → synthesize → gate.
- **Gates:** contradictory lens findings, security flag, contract break.
- **Hard rules:** #3, #15, #26.
- **Tools:** claude-code, kilo-code.
- **Counterpart:** none — multi-agent DAG (review-squad є нашою розробкою).
- **Cost:** 800k tokens/day cap. **early_exit_required: true** — fan-out може роздуватись.

### qa-squad-parallel

- **Goal:** Per-surface test + typecheck across all 4 surfaces before synthesis; full QA fan-out.
- **Phases:** discover → fan-out → synthesize → report.
- **Gates:** cross-surface bug, baseline amendment.
- **Hard rules:** #18, #19.
- **Tools:** claude-code, kilo-code.
- **Counterpart:** none.
- **Cost:** 800k tokens/day cap.

### council-advisory

- **Goal:** Multi-perspective product/strategy/UX advice for ambiguous decisions and tradeoffs.
- **Phases:** frame → fan-out → debate → synthesize.
- **Gates:** none — purely advisory.
- **Tools:** claude-code, kilo-code.
- **Counterpart:** none.
- **Status:** **Enabled** (manual trigger only, через `sergeant-council` skill).
- **Cost:** 600k tokens/day cap.

### planning-batch

- **Goal:** Execute a batch of N planning tasks via parallel agents with tracker sync.
- **Phases:** discover → batch → fan-out → sync → archive.
- **Gates:** contradictory plans, scope creep, blocker amendment.
- **Hard rules:** #15.
- **Tools:** claude-code, kilo-code.
- **Counterpart:** `issue-triage` analogue (planning variant).
- **Status:** **Enabled** (manual trigger only).
- **Cost:** 400k tokens/day cap.

---

## Adoption Notes

- Цей manifest — **доповнення** до `agent-skills-catalog.md`, не заміна. Catalog лишається primary source-of-truth для **всіх** skills; manifest фокусується на autonomous subset.
- Schema сумісна з loop-engineering `loop-audit` / `loop-cost` (їх інструменти ігнорують невідомі поля `owner_skill`, `related_skills`, `hard_rules_ref`, `enabled`).

**Tooling limitation:** `loop-audit` шукає файли на repo root рівні (`LOOP.md`, `STATE.md`, `patterns/registry.yaml`, `loop-budget.md`). Ми свідомо тримаємо manifest у `docs/00-start/agents/loops/` щоб не дублювати sources of truth (Hard Rule #15). Через це `loop-audit . --suggest` показує ті самі false-positives незалежно від вмісту — це обмеження їх hardcoded path matching, не нашої schema. Source-of-truth для нашого loop readiness — внутрішня `pnpm lint:skills` + cross-ref validation (див. verification steps у PR description).

- Перед вмиканням будь-якого loop в L2/L3 — заповнити `enabled: true` у `registry.yaml`, оновити таблицю вище, додати entry до PR-ledger (`docs/04-governance/pr-ledger/index.json` per Hard Rule #26).
