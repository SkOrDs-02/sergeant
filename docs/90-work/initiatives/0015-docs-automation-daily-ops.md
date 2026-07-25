# 0015 — Docs automation for daily ops

> **Last validated:** 2026-07-20 by @cursoragent (code↔doc reconcile). **Next review:** 2026-10-18.
> **Status:** In progress — **Phase 1 + Phase 2 code-complete.** Phase 2 (Bundle Beta) shipped: skill+playbook columns + `agent-ready` field on all initiatives + `lint:initiative-agent-ready` gate. Remaining = Phase 1 **observational acceptance only** (maintainer 5/7-day `today.md` usage self-report). **7-day consecutive-green streak MET** for `docs-daily-brief.yml`: green 2026-07-02 → 2026-07-09 (8 runs) after fail 2026-07-01. **Cron removed on purpose** 2026-07-09 (`dca267eeb` — Actions-minutes hygiene; workflow лишився `workflow_dispatch`-only). Це пояснює відсутність schedule-runs після 07-09 — не broken cron. Stays In progress until self-report closes.
> **Agent-ready:** yes

## TL;DR

Sergeant має ~250 trackable документів, **4 numbered active/proposed initiatives** (+ hardening-matrix index; більшість історичних ініціатив уже в `archive/`) — single-maintainer ловить decision fatigue, не information access fatigue. Інфраструктура (Status headers, `open-work.md` rollup, freshness dashboard) уже працює; бракує **виведених поверх неї views**, що відповідають за тебе на питання "що сьогодні робити" і "коли зупинитися заводити нове". Ця ініціатива докручує **daily-ops layer**: щоденний brief, WIP overload guard, trust badge — Phase 1; agent-dispatch suggestions і `agent-ready` tagging — Phase 2.

## Чому зараз

- 4 open initiative-docs × 1 maintainer + великий launch/planning surface = **decision fatigue** — natural impulse заводити нові ініціативи не закриваючи старих
- `open-work.md` показує 106 open items, але без ranking — maintainer щоразу руками визначає що пріоритетно
- Немає feedback loop "WIP занадто великий" — ніщо у CI не сигналить про violation
- Trust gap: maintainer не довіряє auto-rollup (Phase 0 audit 2026-05-17 показав 0 contradictions, але maintainer ще не звик читати rollup замість 7 trackers)

## Скоуп

### In scope

- **Phase 1 (Bundle Alpha)** — daily brief generator, WIP limit check, trust badge
- **Phase 2 (Bundle Beta)** — suggested skill + playbook columns в `open-work.md`, `agent-ready` frontmatter tag
- Нові pnpm scripts + GitHub Action crons
- `docs/README.md` промоція нових artifacts
- Документація для maintainer-а як споживати

### Out of scope

- Зміни в Hard Rules або AGENTS.md content
- Перейменування / переміщення існуючих docs
- Нові ADRs (можуть зʼявитися як побічний продукт)
- Bundles Gamma / Delta / Epsilon — у Backlog нижче

## План змін

### Phase 1 — Bundle Alpha (committed) — ETA 2026-05-31

**Acceptance:** maintainer відкриває `docs/today.md` вранці і отримує 3-5 actionable items без чтення інших файлів.

| PR         | Що ввозиться                                                               | Файли                                                                                |
| ---------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **PR-1.1** | `pnpm docs:gen-today` script + `docs/today.md` generated artifact          | `scripts/docs/generate-today.mjs`, `docs/today.md`                                   |
| **PR-1.2** | `pnpm docs:check-wip-limits` — soft warn + hard fail на violation          | `scripts/docs/check-wip-limits.mjs`, `docs/04-governance/governance/wip-limits.json` |
| **PR-1.3** | Trust badge в `docs/README.md` (auto-updated section)                      | `scripts/docs/generate-trust-badge.mjs`, `docs/README.md`                            |
| **PR-1.4** | GitHub Action cron: daily regen `today.md` + trust badge; weekly WIP audit | `.github/workflows/docs-daily-brief.yml`                                             |

**WIP limits (стартові, можна підкручувати):**

| Tracker            | Soft | Hard |
| ------------------ | ---- | ---- |
| initiatives        | 25   | 30   |
| audits             | 35   | 40   |
| planning           | 28   | 35   |
| launch             | 25   | 30   |
| tech-debt          | 10   | 15   |
| security/hardening | 20   | 25   |
| superpowers        | 6    | 10   |

**Trust badge thresholds:**

| Status      | Умова                           |
| ----------- | ------------------------------- |
| 🟢 healthy  | 0 stale docs + 0 WIP violations |
| 🟡 warning  | ≤3 stale OR 1 violation         |
| 🔴 critical | >3 stale OR >1 violation        |

**Priority rule для today.md:** items з `Phase X next` маркером у Status header — top 3 за recency mention.

### Phase 2 — Bundle Beta (committed) — ETA 2026-06-30

**Acceptance:** maintainer вибирає item з `today.md`, копіює одним блоком "load skill `<X>`, playbook `<Y>`, prompt: `<Z>`" — agent починає виконання без додаткових питань.

| PR         | Що ввозиться                                                                                               | Файли                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **PR-2.1** | Suggested skill + playbook columns у `open-work.md` (heuristic mapping)                                    | `scripts/docs/generate-open-work.mjs` (extend), `scripts/docs/skill-mapping.json`      |
| **PR-2.2** | `agent-ready: yes / needs-decision / blocked` field у initiative frontmatter + сорtування в `open-work.md` | усі `docs/90-work/initiatives/*.md` (1-рядковий додаток frontmatter), generator update |
| **PR-2.3** | Lint rule: новий initiative MUST мати `agent-ready` field                                                  | `scripts/docs/lint-initiative-agent-ready.mjs`                                         |

**Передумова Phase 2:** **2 тижні daily usage `today.md`** з Phase 1, щоб мапінг initiative→skill будувати на реальних patterns, а не на здогадках.

## Критерії DONE

> **Gate health note 2026-06-07:** PR [#3418](https://github.com/Skords-01/Sergeant/pull/3418) стабілізує `docs:check-links` для daily-ops/doc automation роботи: checker більше не читає markdown-посилання всередині nested fenced blocks як реальні лінки, а `--skip-file` працює з Windows backslash paths. Це не змінює observational acceptance нижче, але зменшує ризик фальшивого red CI для `today.md` / `open-work.md` follow-up PR-ів.

### Phase 1

- [x] `docs/today.md` генерується (`pnpm docs:gen-today`), містить top items + overdue + WIP warnings
- [x] `pnpm docs:check-wip-limits` запускається в CI; soft = warn, hard = fail
- [x] `docs/README.md` має auto-updated trust badge section з 🟢/🟡/🔴 + лічильник
- [x] Daily cron не падає 7 днів поспіль _(observational — **streak MET 2026-07-02→07-09** = 8 greens після fail 07-01; earlier June window зламався 06-06. Schedule **свідомо знято** 2026-07-09 у `dca267eeb` — workflow лишився `workflow_dispatch`-only; daily regen тепер manual або PR-triggered)_
- [ ] Maintainer звітує що відкривав `today.md` принаймні 5 з 7 днів першого тижня _(self-report — чекає на тиждень usage)_

### Phase 2

- [x] `open-work.md` має колонки `Skill` + `Playbook` для кожного item у Ініціативах і Plansах _(score-based skill mapping у `scripts/docs/skill-mapping.json` + `generate-open-work.mjs`; enriched-tracker рядки несуть `Agent-ready`/`Skill`/`Playbook` колонки)_
- [x] Усі numbered initiatives мають `agent-ready` field _(lint `4/4`: 0006 `blocked` (Withdrawn), 0010 `needs-decision`, 0015 `yes`, 0022 `needs-decision`; archived 0003/0017 більше не в active set)_
- [x] Items з `agent-ready: yes` сорtяться першими в open-work tables _(`sortByAgentReady`: yes → needs-decision → blocked → unset)_
- [x] CI gate `lint:initiative-agent-ready` блокує новий initiative без поля _(`scripts/docs/lint-initiative-agent-ready.mjs` + `pnpm lint:initiative-agent-ready`, wired у aggregate `lint`)_

## Ризики

| Ризик                                                             | Митигація                                                                                                    |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Daily brief стане ще одним dashboard, який maintainer ігнорує** | Якщо за 2 тижні `today.md` не консумиться — Phase 2 не стартує, Phase 1 розбираємо                           |
| **WIP limit fails CI на legit work batch (нормальне ramp-up)**    | Soft warn на 80% від hard; hard limits ставимо консервативно +5-10 над поточним active count                 |
| **Trust badge показує 🔴 без actionable details**                 | Badge включає 1-рядковий summary "5 stale, 2 WIP violations — see today.md §Overdue"; не голе кольорове коло |
| **Heuristic skill mapping видає неточні suggestions у Phase 2**   | Phase 2 чекає 2 тижні daily-usage feedback; mapping table editable вручну                                    |
| **Agent-ready field forgotten у нових initiatives**               | CI gate `lint:initiative-agent-ready` блокує merge                                                           |

## Власник / ETA

- **Owner:** @Skords-01
- **Implementation agent:** Claude Code (current session)
- **ETA Phase 1:** 2026-05-31 (≈ 2 тижні після старту)
- **ETA Phase 2:** 2026-06-30 (після 2 тижнів daily-usage feedback)

## Backlog — Можливі доповнення (NOT committed)

Ці bundles обговорювалися під час планування і свідомо **не включені** в Phase 1+2. Зведено сюди як future considerations — стартуємо коли Phase 1+2 приживуться і знатимемо чи real friction залишається.

### Bundle Zeta — External-blocker detection у `today.md` (~2h, proposed)

- Розрізняти `blocked-by-us` (треба unblock-ити) vs `blocked-by-external` (чекаємо третю сторону — нема daily action)
- Detection pattern: status string містить «blocked» + одне з: «external», «чекаємо», «чекає», «waiting for», «pending release of», «depends on»
- Behavior: external-blocked items НЕ в Top-N, окрема секція "💤 Indefinitely blocked on external" з порогом `>30 днів` since last update
- **Trigger to start:** ще раз tailwind-v4-style ситуація — maintainer бачить stale item у `today.md` що не має daily-actionable forward path
- **Reference incident:** 2026-05-18 — `tailwind-v4-migration.md` показувався як Top-1 з `Phase 2 blocked` хоча 3 з 4 фаз закриті і Phase 2 чекає NativeWind 5 (external). Тимчасовий fix: перевести status у `Reference`. Long-term: detection rule вище.

### Bundle Gamma — Review Hygiene (~4h, proposed)

- Auto-gen `docs/this-week-review.md` weekly: docs з `Next review` цього тижня, сорtовано ADR > playbook > решта
- Auto-archive cadence: `Status: Closed` >90d → `<tracker>/archive/` через daily cron
- **Trigger to start:** maintainer звітує що weekly review ritual забуває або займає >30 хвилин

### Bundle Delta — Surface Dashboards (~6h, proposed)

- Per-surface dashboards `docs/surfaces/web.md`, `server.md`, `mobile.md`, `openclaw.md`, `nutrition.md`, `fizruk.md`
- Combined view: останні 3 audits + active initiatives → surface + top 3 tech-debt + last 10 commits до paths
- **Trigger to start:** surface-focused work sessions потребують відкривати >3 файли паралельно

### Bundle Epsilon — Audit Discipline (~3h, proposed)

- Bot створює PR "archive this audit?" для audits >60d без update (1-клік merge)
- Hard audit budget enforced у CI (на додаток до WIP guard з Alpha)
- **Trigger to start:** через 2 місяці з Alpha live, кількість active audits не падає природним чином з 30 до <20

## Посилання

- Phase 0 cleanup audit з якого виросла ця ініціатива: commits `92e5ffda`, `46d73386`, `921fd992` на `chore/repo-cleanup`
- [`docs/open-work.md`](../../open-work.md) — source-of-truth для daily brief генератора
- [`scripts/docs/generate-open-work.mjs`](../../../scripts/docs/generate-open-work.mjs) — pattern reference для нових generators
- [`docs/04-governance/governance/freshness-dashboard.html`](../../04-governance/governance/freshness-dashboard.html) — джерело для trust badge stale-count
- Rule #10 [`lifecycle-markers.md`](../../04-governance/governance/rules/10-lifecycle-markers.md) — Status header semantics
- Rule #25 [`auto-generated-marker.md`](../../04-governance/governance/rules/25-auto-generated-marker.md) — обовʼязковий marker на нових generated файлах

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                       | Title                                                                               | Merged     |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------- |
| [#3551](https://github.com/Skords-01/Sergeant/pull/3551) | fix(ci): finish CI-on-main heal — regenerate SBOM + refresh overdue freshness stamp | 2026-06-13 |

_Auto-derived from `docs/04-governance/pr-ledger/index.json`. Top 1 most recent PRs touching this file._
<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
