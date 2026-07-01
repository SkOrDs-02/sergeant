# Harness Engineering v1 — Rollout Summary

> **Status:** Active
> **Last touched:** 2026-07-01 by @claude. **Next review:** 2026-09-29.
> **Owner:** @SkOrDs-02
> **Supersedes:** —
> **Related:** `E:\Temp\kilo\harness-plan.md` (тимчасовий план, видаляється після merge цієї сторінки), NxCode "Harness-инженерия: Полное руководство" (посилання-плейсхолдер видалено — джерело офлайн) (2026-03-01)

## Summary

2026-06-29 в `main` завезено **чотири** базові компоненти harness-engineering,
які перетворюють AGENTS.md + skills + Hard Rules із статичного policy-документа
на динамічну систему з версіонуванням, A/B-вимірюванням, scheduled-прибиральниками
та явним gate-ом для AI-генерованого коду. Ролл-аут виконано в один день через
4 послідовні PR (#72 → #73 → #74 → #75); цей документ — канонічний зведений
огляд для рев'юерів і наступних сесій, що підхоплюють естафету.

## Components

| #   | Компонент              | Ключові файли                                                                                                                                                    | ADR                                                                    | PR                                                   | Commit      |
| --- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------- | ----------- |
| 1   | **AI-PR Checklist**    | `.github/PULL_REQUEST_TEMPLATE.md`, `.github/workflows/ai-pr-checklist.yml`, `docs/04-governance/governance/ai-pr-checklist.md`                                  | [0069](../../../docs/04-governance/adr/0069-ai-pr-checklist.md)        | [#72](https://github.com/Skords-01/Sergeant/pull/72) | `61c88579c` |
| 2   | **Dynamic Snapshot**   | `tools/agent-snapshot/snapshot.mjs`, `tools/agent-snapshot/README.md`, §0.1 у `sergeant-start-here`                                                              | [0067](../../../docs/04-governance/adr/0071-dynamic-agent-snapshot.md) | [#73](https://github.com/Skords-01/Sergeant/pull/73) | `03601c59b` |
| 3   | **Harness Versioning** | `.kilo/harness-versions.json`, `scripts/ci-bump-harness-version.mjs`, `.github/workflows/harness-a-b.yml`, `docs/04-governance/governance/harness-versioning.md` | [0068](../../../docs/04-governance/adr/0072-harness-versioning.md)     | [#75](https://github.com/Skords-01/Sergeant/pull/75) | `a8b656320` |
| 4   | **Entropy Janitors**   | `tools/entropy-janitors/**` (package), `.github/workflows/entropy-janitors.yml`, `docs/04-governance/governance/entropy-janitors/README.md`                      | [0066](../../../docs/04-governance/adr/0070-entropy-janitors.md)       | [#74](https://github.com/Skords-01/Sergeant/pull/74) | `60aa46057` |

### Деталі по кожному

**AI-PR Checklist (PR #72, ADR-0069).** Шість обов'язкових пунктів у
PR-шаблоні + guard-workflow, який detect-ить AI authorship за
`Co-authored-by` / `Generated with` trailers і вимагає checklist лише
для AI-генерованих PR. Human-only PR bypass-ляться автоматично;
maintainer override через label `ai-pr/override`. Мінімальний permission
scope (`pull-requests: read` + `contents: read`).

**Dynamic Snapshot (PR #73, ADR-0071).** Один zero-dep Node-скрипт
`tools/agent-snapshot/snapshot.mjs`, запускається через `pnpm snapshot`.
Продукує 8-секційний markdown (repo / CI / budgets / entropy issues /
PR-ledger / hard-rule drift / initiative deadlines / agent hints) у
`.kilocode/snapshot.md`. 15-хв TTL cache, graceful `[unavailable]`
fallback, `<50 KB` cap. Інтегровано в `sergeant-start-here` як §0.1
"Dynamic context".

**Harness Versioning (PR #75, ADR-0072).** Append-only registry
`.kilo/harness-versions.json` (schemaVersion 1, поточна `0.1.0` —
навмисно pre-1.0.0), PR-time bumper `scripts/ci-bump-harness-version.mjs`
з auto-detect `patch`/`minor`/`major` за diff від `origin/main`,
weekly A/B workflow `.github/workflows/harness-a-b.yml` з matrix
`[main, experimental/loop-detect]`. Bench-step поки `if: false` — чекає
на golden-task suite (follow-up).

**Entropy Janitors (PR #74, ADR-0070).** Workspace package
`tools/entropy-janitors/` з трьома незалежними скриптами:
`doc-drift` (ESM file walker + reference extractor),
`dead-code` (обгортка над `knip --reporter json`),
`dep-cycles` (hand-rolled ESM resolver — без нових runtime-deps).
Weekly cron Mon 06:00 UTC, **тільки issues** (не PR), debounce через
`gh issue list --search in:title`. Pino-style redaction (Hard Rule #21).

## Metrics

| Метрика                       | Baseline (pre-rollout)  | Post-rollout (2026-06-29)                                                  | Джерело                                                     |
| ----------------------------- | ----------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `apps/web` JS bundle (brotli) | ≤ 1.2 MB budget         | 1.14 MB (95%)                                                              | ADR-0071 §Rationale; perf budgets таблиця                   |
| `apps/web` CSS bundle         | ≤ 36 kB budget          | 34.2 kB (95%)                                                              | ADR-0071 §Rationale                                         |
| `pnpm check` duration         | baseline TBD            | green (4 PR послідовно)                                                    | WORKLOG-и кожної з 4 сесій                                  |
| `pr-ledger/index.json` size   | 195 lines (~PR #3614)   | 202 lines (+4 harness PR)                                                  | `docs/04-governance/pr-ledger/index.json`                   |
| New weekly CI jobs            | 0                       | 2 (janitors + harness-a-b)                                                 | `.github/workflows/entropy-janitors.yml`, `harness-a-b.yml` |
| New repo-owned skills         | 20                      | 20 (no new skill files; tooling is in `tools/**`, not `.agents/skills/**`) | `docs/00-start/agents/agent-skills-catalog.md`              |
| Hard Rules                    | 26                      | 26 (harness work = governance, not new rules)                              | `docs/04-governance/governance/hard-rules.json`             |
| ADRs                          | 65 (0065 = last before) | 69 (0066-0069 = harness v1)                                                | `docs/04-governance/adr/`                                   |

> Примітка: bundle numbers у ADR-0071 наводяться як pre-rollout baseline
> з власних вимірювань автора. Точні CI-виміри з'являться після першого
> тижня production runs у `docs/90-work/observability/harness-v1-baseline.md`
> (follow-up).

## Follow-ups

- **Golden-task suite для A/B harness benchmark.** ADR-0072 §Open Questions
  трекнув це як окремий ADR. Потрібно ≥10 reproducible harness-sensitive
  tasks, на яких можна буде виміряти pass-rate до/після harness-зміни.
- **Janitor performance baselines.** ADR-0070 §Follow-ups: track
  false-positive rate per janitor протягом 4 тижнів production;
  `ignorePatterns` allowlist якщо noise > 10%.
- **Snapshot skill entry в `agent-skills-catalog.md`.** Snapshot не
  додано як окремий skill (це CLI-скрипт, а не skill file), але
  catalog посилається на нього з `sergeant-start-here` — формалізувати
  це посилання у catalog table.
- **Promote `0.1.0` → `1.0.0` after 3 minor bumps** (ADR-0072 §Open Q).
- **`lint:harness-version-freshness` janitor** (ADR-0072 §Open Q).
  Трекнуто у `docs/90-work/tech-debt/agents.md`.
- **Wire janitor issue labels у agent snapshot** (ADR-0070 §Follow-up).
  Залежить від §2.4 acceptance — частково реалізовано (snapshot already
  lists open entropy issues), але без label-based filtering.
- **Skill-trigger evals** для нових tooling surfaces. `pnpm eval:skills`
  очікує 2 trigger / 1 anti-trigger / 1 workflow-compliance prompt на
  кожен repo-owned skill; harness tooling — не skill, але варто
  зафіксувати evals на рівні catalog.
- **PR #74 lockfile drift:** локальний `pnpm install --frozen-lockfile`
  падає через `tools/entropy-janitors/package.json` deps
  (`knip`, `tsx`, `typescript`). CI має сам re-lock на наступному push
  і це expected; задокументовано у `WORKLOG.md` summary-сесії.

## References

- **NxCode стаття:** "Harness-инженерия: Полное руководство" (2026-03-01) —
  джерело методології; цитується у ADR-0069, 0070, 0071, 0072.
- **ADRs:**
  - [0066 — Scheduled Entropy Janitors](../../../docs/04-governance/adr/0070-entropy-janitors.md)
  - [0067 — Dynamic agent snapshot for harness context](../../../docs/04-governance/adr/0071-dynamic-agent-snapshot.md)
  - [0068 — Harness versioning and A/B evaluation](../../../docs/04-governance/adr/0072-harness-versioning.md)
  - [0069 — AI-PR Checklist and validation workflow](../../../docs/04-governance/adr/0069-ai-pr-checklist.md)
- **PRs:**
  - [#72 — feat(agents): add AI-PR checklist and validation workflow](https://github.com/Skords-01/Sergeant/pull/72)
  - [#73 — feat(agents): add dynamic agent snapshot for harness context](https://github.com/Skords-01/Sergeant/pull/73)
  - [#74 — feat(agents): add scheduled entropy janitors (doc-drift, dead-code, dep-cycles)](https://github.com/Skords-01/Sergeant/pull/74)
  - [#75 — feat(agents): add harness versioning and A/B evaluation workflow](https://github.com/Skords-01/Sergeant/pull/75)
- **Governance docs:**
  - [docs/04-governance/governance/ai-pr-checklist.md](../../../docs/04-governance/governance/ai-pr-checklist.md)
  - [docs/04-governance/governance/harness-versioning.md](../../../docs/04-governance/governance/harness-versioning.md)
  - [docs/04-governance/governance/entropy-janitors/README.md](../../../docs/04-governance/governance/entropy-janitors/README.md)
- **Tooling:**
  - [tools/agent-snapshot/README.md](../../../tools/agent-snapshot/README.md) — `pnpm snapshot`
  - [tools/entropy-janitors/README.md](../../../tools/entropy-janitors/README.md) — `pnpm janitors:*`
  - [`.kilo/harness-versions.json`](../../../.kilo/harness-versions.json) — registry
  - [scripts/ci-bump-harness-version.mjs](../../../scripts/ci-bump-harness-version.mjs) — bumper
- **Workflows:**
  - `.github/workflows/ai-pr-checklist.yml` — on PR open/edit/reopen
  - `.github/workflows/entropy-janitors.yml` — weekly Mon 06:00 UTC
  - `.github/workflows/harness-a-b.yml` — weekly Sun 00:00 UTC
- **Skill integration:** §0.1 "Dynamic context" у
  [`.agents/skills/sergeant-start-here/SKILL.md`](../../../.agents/skills/sergeant-start-here/SKILL.md)
- **План-тимчасовий:** `E:\Temp\kilo\harness-plan.md` — видаляється
  вручну власником після merge цієї сторінки в main.
