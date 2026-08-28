# Harness Engineering v1 — Rollout Summary

> **Status:** Reference — rollout v1 завершено (2026-06-29), follow-up-и закрито 2026-07-20; harness `1.0.0` + skill-trigger evals + golden-task suite + freshness-janitor + playbook-routing evals. Відкритих пунктів немає — документ лишається як довідник по чотирьох компонентах harness-у.
> **Last touched:** 2026-07-25 by @claude (Active → Reference: відкритих пунктів немає). **Next review:** 2027-11-22.
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

| #   | Компонент              | Ключові файли                                                                                                                                                    | ADR                                                                                                                                         | PR                                                   | Commit      |
| --- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------- |
| 1   | **AI-PR Checklist**    | `.github/PULL_REQUEST_TEMPLATE.md`, `.github/workflows/ai-pr-checklist.yml`, `docs/04-governance/governance/ai-pr-checklist.md`                                  | [0069](../../../docs/04-governance/adr/0069-ai-pr-checklist.md)                                                                             | [#72](https://github.com/Skords-01/Sergeant/pull/72) | `61c88579c` |
| 2   | **Dynamic Snapshot**   | `tools/agent-snapshot/snapshot.mjs`, `tools/agent-snapshot/README.md`, §0.1 у `sergeant-start-here`                                                              | [0067](../../../docs/04-governance/adr/0071-dynamic-agent-snapshot.md)                                                                      | [#73](https://github.com/Skords-01/Sergeant/pull/73) | `03601c59b` |
| 3   | **Harness Versioning** | `.kilo/harness-versions.json`, `scripts/ci-bump-harness-version.mjs`, `.github/workflows/harness-a-b.yml`, `docs/04-governance/governance/harness-versioning.md` | [0068](../../../docs/04-governance/adr/0072-harness-versioning.md)                                                                          | [#75](https://github.com/Skords-01/Sergeant/pull/75) | `a8b656320` |
| 4   | **Entropy Janitors**   | Retired 2026-07-29; прямі Knip/docs/ESLint checks + standalone dual-write residue                                                                                | [0070](../../../docs/04-governance/adr/0070-entropy-janitors.md), [0081](../../../docs/04-governance/adr/0081-repository-simplification.md) | [#74](https://github.com/Skords-01/Sergeant/pull/74) | `60aa46057` |

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
`.kilo/harness-versions.json` (schemaVersion 1, поточна `4.0.0`), PR-time
bumper `scripts/ci-bump-harness-version.mjs`
з auto-detect `patch`/`minor`/`major` за diff від `origin/main`,
weekly A/B workflow `.github/workflows/harness-a-b.yml` з matrix
`[main, experimental/loop-detect]`. Bench-step активний: `pnpm harness:bench`
проти `docs/00-start/agents/harness-golden-tasks.json` (12 tasks).

**Entropy Janitors (PR #74, ADR-0070; retired ADR-0081).** Історичний workspace-wrapper і weekly issue workflow прибрано. Сигнали запускаються напряму через Knip, docs checks і ESLint `import/no-cycle`; доменний `pnpm check:dualwrite-residue` лишився standalone.

## Metrics

| Метрика                       | Baseline (pre-rollout)  | Post-rollout (2026-06-29)                                                  | Джерело                                                                                  |
| ----------------------------- | ----------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `apps/web` JS bundle (brotli) | ≤ 1.2 MB budget         | 1.14 MB (95%)                                                              | ADR-0071 §Rationale; perf budgets таблиця                                                |
| `apps/web` CSS bundle         | ≤ 37 kB budget          | 34.2 kB (95%)                                                              | ADR-0071 §Rationale                                                                      |
| `pnpm check` duration         | baseline TBD            | green (4 PR послідовно)                                                    | [`2026-06-30-harness-v1-summary-worklog.md`](./2026-06-30-harness-v1-summary-worklog.md) |
| `pr-ledger/index.json` size   | 195 lines (~PR #3614)   | 202 lines (+4 harness PR)                                                  | `docs/04-governance/pr-ledger/index.json`                                                |
| New weekly CI jobs            | 0                       | 2 (janitors + harness-a-b)                                                 | `.github/workflows/entropy-janitors.yml`, `harness-a-b.yml`                              |
| New repo-owned skills         | 20                      | 20 (no new skill files; tooling is in `tools/**`, not `.agents/skills/**`) | `docs/00-start/agents/agent-skills-catalog.md`                                           |
| Hard Rules                    | 26                      | 26 (harness work = governance, not new rules)                              | `docs/04-governance/governance/hard-rules.json`                                          |
| ADRs                          | 65 (0065 = last before) | 69 (0069–0072 = harness v1, перенумеровано 2026-07-01)                     | `docs/04-governance/adr/`                                                                |

> Примітка: bundle numbers у ADR-0071 наводяться як pre-rollout baseline
> з власних вимірювань автора. Окремих CI-вимірів не збирали — baseline
> лишається авторським (ADR-0071 § Rationale).

## Follow-ups

### ✅ Закрито (code-reconcile 2026-07-20)

- **Promote `0.1.7` → `1.0.0`** — `.kilo/harness-versions.json` `"current": "1.0.0"`.
- **Skill-trigger evals** — `docs/00-start/agents/skill-trigger-evals.json` + `pnpm eval:skills` (wired у `pnpm lint:skills`).

### ✅ Закрито (harness follow-ups 2026-07-20)

- **Golden-task suite для A/B harness benchmark.** `docs/00-start/agents/harness-golden-tasks.json`
  (schemaVersion 1, 12 tasks) + `scripts/harness-bench.mjs` + `pnpm harness:bench`.
  `.github/workflows/harness-a-b.yml` bench-step тепер активний (без `if: false`),
  weekly schedule Sun 00:00 UTC додано. Тести: `scripts/__tests__/harness-bench.test.mjs`.
- **`lint:harness-version-freshness` janitor.** `scripts/check-harness-version-freshness.mjs`
  - `pnpm lint:harness-version-freshness` wired в aggregate `pnpm lint`.
    Перевіряє: schemaVersion=1, current у versions map, releasedAt присутній,
    AGENTS.md і harness-engineering-v1.md не мають stale `0.1.7` refs.
    Тести: `scripts/__tests__/check-harness-version-freshness.test.mjs`.
- **Playbook routing evals.** `docs/00-start/agents/playbook-routing-evals.json`
  (12 cases: 10 match + 2 anti-match) + `scripts/eval-playbook-routing.mjs`
  - `pnpm eval:playbooks` wired в aggregate `pnpm lint` (поруч з `lint:skills`).
    Тести: `scripts/__tests__/eval-playbook-routing.test.mjs`.

### Відкриті

- **Snapshot skill entry в `agent-skills-catalog.md`.** Snapshot не
  додано як окремий skill (це CLI-скрипт, а не skill file), але
  catalog посилається на нього з `sergeant-start-here` — формалізувати
  це посилання у catalog table.

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
- **Tooling:**
  - [tools/agent-snapshot/README.md](../../../tools/agent-snapshot/README.md) — `pnpm snapshot`
  - [`.agents/harness-versions.json`](../../../.agents/harness-versions.json) — registry (шлях з 2026-08-28, ADR-0088; історично `.kilo/`)
  - [scripts/ci-bump-harness-version.mjs](../../../scripts/ci-bump-harness-version.mjs) — bumper
- **Workflows:**
  - `.github/workflows/ai-pr-checklist.yml` — прибрано ([ADR-0082](../../04-governance/adr/0082-private-storage-repo-posture.md))
  - `.github/workflows/harness-a-b.yml` — weekly Sun 00:00 UTC
- **Skill integration:** §0.1 "Dynamic context" у
  [`.agents/skills/sergeant-start-here/SKILL.md`](../../../.agents/skills/sergeant-start-here/SKILL.md)
- **План-тимчасовий:** `E:\Temp\kilo\harness-plan.md` — видаляється
  вручну власником після merge цієї сторінки в main.
