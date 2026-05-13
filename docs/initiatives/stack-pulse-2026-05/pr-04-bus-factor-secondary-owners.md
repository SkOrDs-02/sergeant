# PR-04: Secondary owners + knowledge-transfer plan

> **Last validated:** 2026-05-13 by Devin. **Next review:** 2026-08-11.
> **Status:** Closed — last 3 DoD items shipped in this PR: (1) `AGENTS.md` Module ownership map має `Secondary` колонку для всіх 22 рядків (placeholder-роли `TBD (<role>)`), (2) `L2 escalation` поле в `AGENTS.md` тепер посилається на [`docs/playbooks/operational-continuity.md`](../../playbooks/operational-continuity.md) як L2 entry point (vendor support + 1Password vaults замість «paging another person»), (3) `scripts/check-codeowners-coverage.mjs` має `validateAgentsSecondaryColumn()` що падає, якщо хтось додасть рядок без `Secondary`-cell. Раніше landed: CODEOWNERS secondary placeholder block, 6 module walkthroughs у `docs/notes/spikes/2026-05-walkthrough-*.md`, ops-runbook ([#2000](https://github.com/Skords-01/Sergeant/pull/2000)). Реальні secondary engineers — окрема hire-driven задача (out of scope).

|              |                                                                  |
| ------------ | ---------------------------------------------------------------- |
| **Severity** | Critical (C4)                                                    |
| **Owner**    | TBD (sponsor: @Skords-01)                                        |
| **Effort**   | 1 тиждень calendar (5–8 actual hours per knowledge-transfer doc) |
| **Risk**     | Low (organizational, not technical)                              |
| **Touches**  | `.github/CODEOWNERS`, `AGENTS.md`, `docs/notes/spikes/`          |

## Контекст

`AGENTS.md` Module ownership map: **усі 18 рядків → `@Skords-01`**. CODEOWNERS coverage enforced (`scripts/check-codeowners-coverage.mjs`), але це лише гарантує, що `@Skords-01` reviewer для всього.

**Bus factor = 1.** Хвороба на тиждень = весь deploy queue заблокований. Knowledge transfer = 40 ADR + 30 playbooks + 17 hard rules + 18 skills — нереально для нової людини за <2 місяці.

## Scope

### 1. Secondary CODEOWNERS

- Розділити `.github/CODEOWNERS` на тематичні групи:
  - `apps/web/**` → primary `@Skords-01`, secondary TBD (frontend-engineer)
  - `apps/server/**` → primary `@Skords-01`, secondary TBD (backend-engineer)
  - `apps/mobile*/**` → primary `@Skords-01`, secondary TBD (mobile-engineer)
  - `packages/db-schema/**` + `apps/server/src/migrations/**` → primary, secondary TBD (data-engineer)
  - `docs/governance/**` + `AGENTS.md` → primary `@Skords-01` (governance не делегується)
- Якщо реальних людей наразі немає — використати **AI-агента (наприклад Devin/Claude)** як placeholder secondary, з примусовим human-review від `@Skords-01` як final approver.

### 2. Knowledge-transfer playbook

Для кожного з 6 модулів — **записати 1-годинний walkthrough**:

| Модуль      | Walkthrough scope                                                 |
| ----------- | ----------------------------------------------------------------- |
| `fizruk`    | Workouts data model, ChartKit, RNGH gestures, sync semantics      |
| `finyk`     | Categorization rules, Monobank webhook, manual-tx UX              |
| `nutrition` | Photo-analyze flow, USDA FDC integration, weekly digest           |
| `routine`   | Reminder scheduling, push-token lifecycle, notification platforms |
| `hubchat`   | Anthropic streaming, tool-execution, RAG injection, prompt-cache  |
| `sync`      | CloudSync LWW, op-log, conflict resolution, op-replay determinism |

Кожен walkthrough — `docs/notes/spikes/2026-05-walkthrough-<module>.md` з:

- Архітектурною діаграмою (mermaid)
- Top-5 файлів та їх роль
- Топ-3 «gotcha» (наприклад «не міняй порядок в LWW timestamp resolution»)
- Контактна точка для escalation

### 3. L2 escalation поле

Зараз `AGENTS.md` має `L2 escalation` поле, що ефективно повторює owner-а. Заповнити реальним second-name (або зовнішнім консультантом / community-mantainer).

### 4. Operational continuity playbook

`docs/playbooks/operational-continuity.md` з:

- Список зовнішніх систем (Railway, Vercel, Anthropic, Voyage, Sentry, PostHog, Resend, Monobank) і **хто має credentials** (1Password vault?)
- DNS / domain renewal — куди дивитись, коли paid-up
- Що ламається першим при відсутності owner-а 1 тиждень / 1 місяць / 6 місяців

## Out of scope

- Hire-driven рішення (це організаційне, не цей PR).
- Реструктуризація team-ownership поза monorepo.

## Acceptance criteria (DoD)

- [x] `.github/CODEOWNERS` розділений на ≥4 path-rules з secondary placeholder.
- [x] `AGENTS.md` Module ownership map має `secondary` поле для кожного рядка (22/22, всі заповнені placeholder-роллю `TBD (<role>)`).
- [x] `scripts/check-codeowners-coverage.mjs` оновлений для перевірки secondary-coverage — `validateAgentsSecondaryColumn()` парсить ownership-map і fail-ить, якщо будь-який рядок має empty `Secondary` cell або колонка відсутня в header-і. Покрито 4 testcase-ами в `scripts/__tests__/check-codeowners-coverage.test.mjs`.
- [x] 6 walkthrough-документів у `docs/notes/spikes/2026-05-walkthrough-*.md`.
- [x] `docs/playbooks/operational-continuity.md` з секціями (зовнішні системи, escalation contacts, kill-switch).
- [x] PR-description явно вказує: «це не реальні secondary, а placeholder — фактичний onboarding відбувається коли друга людина приєднається».
- [x] L2 escalation поле в `AGENTS.md` має конкретний fallback (playbook → vendor support → 1Password vaults), не дубль owner-а.

## Тести

- `scripts/check-codeowners-coverage.mjs` — перевіряє, що кожен path має ≥1 owner і (опційно) secondary.
- Manual: spot-check кожного walkthrough-документа на повноту.

## Rollout

- Single PR. Все documentation-only, нічого не ламається у runtime.

## Risks & mitigations

| Risk                                                             | Mitigation                                                                                                  |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Walkthrough-документи stale через 6 місяців                      | freshness-gate: `Last validated` поле + `check-tech-debt-freshness.mjs`-style check на `docs/notes/spikes/` |
| Placeholder secondary (Devin/Claude) не справжній resilience-fix | Чітко marked у CODEOWNERS comment-ах: `# placeholder — replace with real engineer when hired`               |

## Touchpoints (file:line)

- `.github/CODEOWNERS` — повна реструктуризація
- `AGENTS.md:34–55` — Module ownership map
- `docs/notes/spikes/` — нові 6 файлів
- `docs/playbooks/operational-continuity.md` — новий
- `scripts/check-codeowners-coverage.mjs` — secondary-coverage logic

## Refs

- [Spotify «squad ownership» model](https://www.atlassian.com/agile/agile-at-scale/spotify)
- Atlassian «Bus factor» writeup
