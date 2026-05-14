# PR-план — Documentation Hygiene Follow-Up (2026-05)

> **Last validated:** 2026-05-13 by Devin (child session). **Next review:** 2026-06-13.
> **Status:** Active
> **Cross-refs:**
> [`docs/audits/2026-05-13-documentation-hygiene-roast.md`](../audits/2026-05-13-documentation-hygiene-roast.md) — джерело відкритих items (P1/P2) ·
> [`docs/audits/2026-05-02-doc-hygiene-audit.md`](../audits/2026-05-02-doc-hygiene-audit.md) — попередній прохід doc-hygiene ·
> [`docs/audits/2026-05-05-dead-code-and-stale-links-audit.md`](../audits/2026-05-05-dead-code-and-stale-links-audit.md) — dead-links / dead-code roast ·
> [`docs/governance/README.md`](../governance/README.md) — sources of truth + CI gates ·
> [`docs/governance/doc-freshness.md`](../governance/doc-freshness.md) — freshness-marker grammar ·
> [`docs/governance/audit-freeze-2026-05-05.md`](../governance/audit-freeze-2026-05-05.md) — активна 4-тижнева заморозка (до 2026-06-02) ·
> [`docs/governance/policy-review.md`](../governance/policy-review.md) — cadence + review-process для governance docs ·
> [`scripts/check-discoverability.mjs`](../../scripts/check-discoverability.mjs) — ≤2-hop discoverability gate (ROUTES matrix) ·
> [`scripts/check-hard-rules-registry.mjs`](../../scripts/check-hard-rules-registry.mjs) — 3-way sync gate AGENTS.md ↔ `hard-rules.json` ↔ `docs/governance/rules/` ·
> [`scripts/check-governance-sync.mjs`](../../scripts/check-governance-sync.mjs) — AGENTS.md ↔ CONTRIBUTING.md + status-badge + dangling source refs ·
> [`scripts/docs/check-markdown-links.mjs`](../../scripts/docs/check-markdown-links.mjs), [`scripts/check-tech-debt-freshness.mjs`](../../scripts/check-tech-debt-freshness.mjs).

## Чому цей план

Doc-hygiene roast від 2026-05-13 закрив 4 P0-items одним PR-ом (53 broken-links → 0, lighthouse drift, useHashRoute ghost ref, tech-debt freshness gap) і ще 1 follow-up PR (`docs/audits/README.md` README-gap row). Лишились дрібніші open items + клас гігієнічних робіт, які наростають швидше, ніж doc-checker-и їх ловлять:

1. **Stale-link / 3-date / drift cleanup** — окремі archive-файли, dual-source-of-truth markers.
2. **Discoverability gaps** — `lint:discoverability` ROUTES не покриває skills (writing-skills, hubchat, mobile, better-auth), initiative-index, ADR-catalog, freshness dashboard.
3. **Governance sync gates** — є 3-way gate для hard-rules; немає аналогу для playbook-language, AGENTS-сімейства, freshness-cadence drift.
4. **AGENTS.md / DEVIN.md / CLAUDE.md consistency** — структурний drift (Startup flow, секції, посилання) не enforced; зараз diff робиться eyeball-ом.

Кожна картка — окремий PR (S/M/L, P-рівень, dependency-граф, owner-placeholder). Sequencing внизу. XS quick-wins реалізуються одним PR-spike-ом (див. PR #0 нижче).

## Audit-freeze contract (важливо)

Активний [`audit-freeze-2026-05-05.md`](../governance/audit-freeze-2026-05-05.md) (до 2026-06-02) **забороняє** новi audit-доки в `docs/audits/` top-level, новi initiatives в `docs/initiatives/00NN-…`, новi playbook-и без двох завершених PR-ів і новi ADR-и без активного code-PR-а. Дозволені:

- **Edit** existing audit / initiative / governance / playbook доків (status bump, P-items, errata).
- Нові скрипти / lint-and-doc-checks / per-rule файли у `docs/governance/rules/` — це не audit-content, дозволено.
- Нові entries у `scripts/check-discoverability.mjs ROUTES` — це machine-readable enforcement, не нова політика.
- Нові playbook-и **дозволені тільки після того, як 2+ PR-и руками показали recipe**.

Кожна картка явно позначена `Freeze-compatible: yes/no/with-condition`. PR-и `no` плануються на ≥ 2026-06-03 і не блокують решту.

## Прогнозовані quick-wins (PR #0)

Зведений XS PR (≤30 хв скоп), що закриває 4 точкових drift-и за один прохід — наслідок аудиту + дрібного research-у при складанні цього плану. Створюється **окремо від решти** карток, щоб не сповільнювати дискусію по `M/L`-картках.

| ID   | Зміна                                                                                                                                                                                                                                         | Файл:рядок                                                      |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| QW-1 | Закрити P1-3 в roast: `.github/workflows/lighthouse-ci.yml` зашиплений у `cb459c08` (#2726, 2026-05-13). Bump статусу: `⏸ P1-3` → `✅ Closed in #2726`; видалити «Action: Add (recommended P2)» з § P0-2.                                     | `docs/audits/2026-05-13-documentation-hygiene-roast.md:100-103` |
| QW-2 | Закрити P2-2 в roast: `MARKER_RE` у [`scripts/knip-respects-scaffolded.mjs:26`](../../scripts/knip-respects-scaffolded.mjs) вже містить `@experimental` — переписати § P2-2 на `✅ Closed (already covered)`.                                 | `docs/audits/2026-05-13-documentation-hygiene-roast.md:110-112` |
| QW-3 | Bump `Last validated` у [`docs/governance/pnpm-overrides-policy.md`](../governance/pnpm-overrides-policy.md) — зараз `2026-05-11 by @claude`, drift > 48h щодо решти governance-доків (`2026-05-13 by @andrijvigrav`).                        | `docs/governance/pnpm-overrides-policy.md:3`                    |
| QW-4 | Bump `Last validated` у [`docs/governance/doc-freshness.md`](../governance/doc-freshness.md) — `2026-05-11 by @Skords-01`, аналогічний 2-денний drift; doc описує саму систему freshness-маркерів і має бути першим у списку, не пропусканим. | `docs/governance/doc-freshness.md:3`                            |

**Freeze-compatible: yes** (status update + bump = «Edit existing»).

---

## PR-01 — Archive 3-date canonicalization + remaining stale-link sweep ✦ Stale-link / drift

- **Group:** 1) stale-link / drift cleanup.
- **Trigger:** P1-2 у roast — `docs/audits/archive/2026-04-28-ux-ui-audit.md` тримає 3 окремі дати (`Last validated`, `Initial audit date`, in-content `Дата аудиту` / `Дата оновлення`). Аналогічний дрейф можливий у решті 18 archive-файлів — потрібен єдиний прохід.
- **Action:** канонікалізувати на 1 freshness-marker (`Last validated:`) + 1 нерухомий `Initial audit date:` (якщо потрібен історичний context). In-content «Дата ...» рядки помічаються `<!-- frozen-original: 2026-04-28 -->` і виключаються з `bump-last-validated.mjs`.
- **Files (≤6):** `docs/audits/archive/2026-04-28-ux-ui-audit.md`, `docs/audits/archive/2026-04-28-implementation-roadmap.md`, `docs/audits/archive/2026-04-28-ux-improvement-plan.md`, `docs/audits/archive/2026-05-11-docs-audit-summary.md` (+ ще 2 за результатом sweep).
- **Acceptance:**
  - `pnpm docs:check-links` зелений (no regression від quick-wins PR-а).
  - У всіх archive-доках рівно 1 `Last validated:` рядок (count check у наступному PR-02).
  - In-content «Дата ...» рядки помічені або видалені.
- **Size:** S (≤8 файлів, ~80 рядків). **P-рівень:** P1.
- **Dependencies:** PR #0 (quick-wins) merge-ed першим, щоб roast-status-rows не конфліктували.
- **Freeze-compatible:** yes (edit existing archive docs).
- **Owner:** TBD (`@<docs-owner>` placeholder; default → @Skords-01).

---

## PR-02 — Add `docs:check-freshness-single-marker` lint gate ✦ Governance sync

- **Group:** 3) governance sync gates.
- **Trigger:** PR-01 закриває multi-date drift руками — потрібен ME, який не дає reverted у наступних PR-ах. `docs:check-freshness-coverage` лише перевіряє наявність маркера, не його кількість.
- **Action:** новий скрипт `scripts/docs/check-freshness-single-marker.mjs` — для кожного `.md` під `docs/**` рахує `^> \*\*Last validated:` lines; fail якщо `> 1` (поза code-блоками). Реєструється у `package.json` як `docs:check-freshness-single-marker` + додається до `lint:governance-sync` aggregate (або у CI workflow `.github/workflows/docs.yml` поряд з `docs:check-links`).
- **Test plan:**
  - Unit: `scripts/__tests__/check-freshness-single-marker.test.mjs` — fixtures з 0 / 1 / 2 markers + code-block-fenced markers (skip).
  - Integration: запуск на чистому `docs/` — exit 0.
- **Files:** `scripts/docs/check-freshness-single-marker.mjs` (новий), `scripts/__tests__/check-freshness-single-marker.test.mjs` (новий), `package.json` (+1 script entry), `.github/workflows/docs.yml` або відповідний CI-job (+1 step).
- **Acceptance:** скрипт exit 0 на main після PR-01; PR, що додає 2-й marker, ловиться лінтером.
- **Size:** M (~120-180 рядків коду + tests). **P-рівень:** P1.
- **Dependencies:** **залежить від PR-01** (без нього лінтер червоний на main).
- **Freeze-compatible:** yes (new script + CI job, не новий doc).
- **Owner:** TBD (governance / agents tooling).

---

## PR-03 — Codemod-catalog ESLint guard (kvStore deep-imports) ✦ Stale-link / drift

- **Group:** 1) stale-link / drift cleanup + governance-adjacent enforcement (closes P2-1 у roast).
- **Trigger:** [`scripts/codemods/README.md`](../../scripts/codemods/README.md) каталогізує `@deprecated` codemods, але долгостроковий enforcement для `kvStore` deep-imports (per `2026-05-02-doc-hygiene-audit.md` PR #013) досі planned. Без guard-а codemod закінчиться regression-ом.
- **Action:** додати правило у `eslint-plugin-sergeant-design` (або `no-restricted-imports` у root `eslint.config.js`) — заборона `import … from "@sergeant/<pkg>/.../kvStore"` / `"…/kv-store/..."` deep-paths у web/server/mobile, з allowlist для adapter-файлів. Long-term-enforcement entry додається у [`scripts/codemods/README.md`](../../scripts/codemods/README.md) каталог.
- **Acceptance:**
  - `pnpm lint` на main green.
  - Демо-fixture: `apps/web/src/__tests__/fixtures/bad-kvstore-deep-import.ts` — fails з clear message.
  - `scripts/codemods/README.md` рядок `kvStore` має «✅ enforced» у колонці «Long-term enforcement».
- **Size:** M (~150 рядків ESLint rule + tests + 1-line allowlist update). **P-рівень:** P2.
- **Dependencies:** немає (паралельний з рештою).
- **Freeze-compatible:** yes (eslint rule + lint-doc, не новий audit).
- **Owner:** TBD (web/server engineer).

---

## PR-04 — Expand discoverability ROUTES (writing-skills, mobile, hubchat, better-auth) ✦ Discoverability

- **Group:** 2) discoverability gaps.
- **Trigger:** [`scripts/check-discoverability.mjs ROUTES`](../../scripts/check-discoverability.mjs) сьогодні enforce-ить ≤2 hops до `start-here` + `review-and-merge` + on-call playbooks. Решта 8 Sergeant specialist-skill-ів (writing-skills, mobile-expo, hubchat, web-ui, server-api, data-and-migrations, bugfix-and-regression, monorepo-boundaries) + better-auth-best-practices, + new agent skills evolution (`docs/agents/skills-evolution-roadmap.md`) — НЕ покриті, тому drift у роутингу не ловиться. Аналогічно немає row-а для `docs/initiatives/README.md` (новий contributor не знаходить активних ініціатив).
- **Action:** ~10 нових rows у `ROUTES` array (`role: new-agent` / `role: reviewer` / `role: on-call`):
  - `new-agent → .agents/skills/sergeant-writing-skills/SKILL.md` (entrypoints: AGENTS.md).
  - `new-agent → .agents/skills/sergeant-{web-ui,server-api,mobile-expo,hubchat,data-and-migrations,bugfix-and-regression,monorepo-boundaries,deploy-and-observability,feature-delivery}/SKILL.md` (entrypoints: `docs/agents/agent-skills-catalog.md`).
  - `new-agent → .agents/skills/better-auth-best-practices/SKILL.md`.
  - `new-contributor → docs/initiatives/README.md`.
  - `reviewer → docs/governance/policy-review.md`.
- **Acceptance:**
  - `pnpm lint:discoverability` green з новими rows.
  - PR який видаляє link з `agent-skills-catalog.md` до specialist-skill — fails з explicit «role:new-agent target X unreachable within 2 hops».
- **Size:** M (~10 rows + smoke tests). **P-рівень:** P1.
- **Dependencies:** немає (паралельний).
- **Freeze-compatible:** yes (ROUTES — machine enforcement, не нова політика).
- **Owner:** TBD (agents/governance).

---

## PR-05 — `docs/initiatives/README.md` + `docs/adr/README.md` indexing & reachability ✦ Discoverability

- **Group:** 2) discoverability gaps.
- **Trigger:** `docs/initiatives/` має 8 активних multi-phase trackers (0002, 0003, 0006, 0010, 0011, 0013, follow-ups, stack-pulse-2026-05) + `archive/` + `follow-ups.md`. README відсутній або тонкий — discoverability fails для нового contributor. Аналогічно `docs/adr/` має 40+ ADR-ів, single-flat-каталог без table-of-contents.
- **Action:**
  - `docs/initiatives/README.md` (якщо існує — bump; інакше add): таблиця активних 8 ініціатив зі статусом + 2-line scope. Cross-link з `docs/README.md` + `docs/planning/README.md`.
  - `docs/adr/README.md` (analogously): хронологічний index ADR-1..ADR-49 + ADR-status-table (proposed / accepted / superseded), генерований із frontmatter (`docs:gen-adr-index` script, аналогічно `docs:gen-playbook-index`).
- **Acceptance:**
  - `docs/initiatives/README.md` має `Last validated:` header + 8-row таблицю.
  - `docs:gen-adr-index` запускається у CI як `--check`, fail-ить, якщо index drift-ить від ADR-frontmatter.
- **Size:** L (~250 рядків doc + ~100 рядків ADR-indexer + tests). **P-рівень:** P1.
- **Dependencies:** PR-04 (новий ROUTES row для initiatives README робить sense після створення README).
- **Freeze-compatible:** **with-condition** — створення `docs/initiatives/README.md` дозволено (це index, не нова initiative). Створення `docs/adr/README.md` — те ж саме (не ADR). Якщо у моменті ревʼю буде сумнів — частину про ADR-indexer відкласти до post-freeze (≥ 2026-06-03).
- **Owner:** TBD.

---

## PR-06 — AGENTS-family consistency lint (`AGENTS.md` ↔ `CLAUDE.md` ↔ `DEVIN.md`) ✦ AGENTS/DEVIN/CLAUDE

- **Group:** 4) AGENTS.md / DEVIN.md / CLAUDE.md consistency.
- **Trigger:** Структурний diff показав drift:
  - `CLAUDE.md:7` vs `DEVIN.md:7` — у CLAUDE немає посилання на agent-skills-catalog у пункті 3 Startup flow.
  - `CLAUDE.md:8` vs `DEVIN.md:8` — у Devin розгорнутий контекст для onboarding (`/run/repo_secrets/Sergeant/.env.secrets`, `pnpm db:up`), у Claude — лише «секрети, БД».
  - Specific-нотатки секції повністю різні (3 bullet-и в кожному, нульове перетин ).
  - **Single-source-of-truth disclaimer** збігається — це інваріант, який треба enforce-ити machinely.
- **Action:** новий скрипт `scripts/check-agents-family-sync.mjs` (~120 рядків) — для CLAUDE.md / DEVIN.md / OPENAI.md (якщо є) перевіряє:
  - Header `> **Single source of truth → [AGENTS.md](./AGENTS.md).**` присутній і точно один.
  - Startup flow секція має ≥ 5 нумерованих пунктів і пункт 1 — `Прочитай [AGENTS.md]`.
  - Файл ≤ 40 рядків (slim contract — детальна політика в AGENTS.md).
- **Acceptance:**
  - `pnpm lint:agents-family-sync` exit 0 на main.
  - PR який розширює CLAUDE.md / DEVIN.md > 40 рядків — fail з пояснення «move into AGENTS.md».
- **Size:** S (~120 рядків script + 30 рядків tests). **P-рівень:** P1.
- **Dependencies:** немає.
- **Freeze-compatible:** yes (new lint script, не нова політика — інваріант існує у обох доках уже сьогодні).
- **Owner:** TBD (agents/governance).

---

## PR-07 — Playbook-language → 3-way sync gate (file ↔ INDEX ↔ catalog) ✦ Governance sync

- **Group:** 3) governance sync gates.
- **Trigger:** `lint:playbook-language` + `docs:check-playbook-index` + `docs:check-playbook-schema` працюють незалежно. Якщо новий playbook доданий до `docs/playbooks/`, але не до `playbook-catalog.md` (canonical routing table), скрипти його не ловлять як drift до перших manual checks.
- **Action:** розширити `scripts/check-playbook-language.mjs` (або новий `scripts/check-playbook-3way-sync.mjs`):
  - Кожен `*.md` у `docs/playbooks/` (виключно `_TEMPLATE-*.md`, `README.md`, `INDEX.md`, `playbook-catalog.md`) має row у `playbook-catalog.md` (canonical) і entry у `INDEX.md`.
  - `INDEX.md` згенерований автоматично (`docs:gen-playbook-index`) — `--check` тепер також enforce-ить, що orphan-файлів у `docs/playbooks/` нема (file без row у catalog).
- **Acceptance:**
  - Existing 50 playbooks pass.
  - Demo: створи `docs/playbooks/test-orphan.md` локально → `pnpm docs:check-playbook-index` fail з «orphan playbook: missing row in playbook-catalog.md». Then revert.
- **Size:** M (~80 рядків змін у `generate-playbook-index.mjs` + 1 нова assertion + tests). **P-рівень:** P2.
- **Dependencies:** немає.
- **Freeze-compatible:** yes (extend existing CI gate).
- **Owner:** TBD.

---

## PR-08 — Freshness-cadence drift detector (governance docs cadence) ✦ Governance sync

- **Group:** 3) governance sync gates.
- **Trigger:** Cadence governance-доків (90-day review per `policy-review.md`) дрейфує без CI-сигналу. Сьогодні `docs:check-freshness-coverage` лише перевіряє наявність маркера; `check-tech-debt-freshness.mjs` обмежений `docs/tech-debt/{frontend,backend,mobile}.md` (закрито в roast P0-4). Аналогічного guard-а для `docs/governance/*.md` нема — приклад: `pnpm-overrides-policy.md` і `doc-freshness.md` тримали `Last validated: 2026-05-11`, поки решта вже на `2026-05-13` (закрито через QW-3/QW-4 quick-win).
- **Action:** додати у `scripts/docs/check-freshness.mjs --check-coverage` (або новий `--check-cadence` режим) — для кожного `.md` під `docs/governance/`, `docs/agents/`, `docs/playbooks/README.md`, `AGENTS.md`, `CONTRIBUTING.md`, `README.md`: fail якщо `Last validated:` старіший за `Next review:` мінус 7 днів grace (тобто overdue review).
- **Acceptance:**
  - Скрипт exit 0 на main після quick-wins QW-3/QW-4.
  - Demo: змінити `Next review:` на `2025-01-01` локально → fail з clear message + список overdue файлів.
- **Size:** M (~80 рядків). **P-рівень:** P1.
- **Dependencies:** **залежить від QW-3/QW-4** (інакше fail на main).
- **Freeze-compatible:** yes (extend existing CI gate).
- **Owner:** TBD (governance).

---

## PR-09 — Freshness-marker dashboard surfacing in `docs/governance/README.md` ✦ Discoverability

- **Group:** 2) discoverability gaps + 3) governance sync (cross-cutting).
- **Trigger:** `scripts/docs/generate-freshness-dashboard.mjs` існує (`docs:freshness-dashboard` script), але output не лінкується з `docs/governance/README.md`, `docs/README.md` або `AGENTS.md`. Дашборд невидимий для нового contributor / agent → drift не помічається до наступного аудиту.
- **Action:**
  - Запустити `pnpm docs:freshness-dashboard` → committ-нути output у `docs/governance/freshness-dashboard.md` (зара generated, не committed).
  - Лінк з `docs/governance/README.md § CI gates` + `docs/README.md § Документи governance`.
  - CI step: regenerate-on-PR + diff-check (fail якщо stale).
- **Acceptance:**
  - `docs/governance/freshness-dashboard.md` існує + `pnpm docs:freshness-dashboard --check` exit 0.
  - Лінк reachable з `AGENTS.md` за ≤2 hops (test через `lint:discoverability` нову row).
- **Size:** S (~60 рядків docs + 1 CI step + ROUTES row). **P-рівень:** P2.
- **Dependencies:** PR-04 (для ROUTES row).
- **Freeze-compatible:** **with-condition** — `freshness-dashboard.md` це новий top-level governance file. Аргумент за дозвіл: це generated artifact (не policy), governance-content там zero. Якщо рев'ю trakує його як «новий governance doc», відкласти до 2026-06-03. Інакше — частина freeze-window.
- **Owner:** TBD.

---

## Sequencing & dependency-граф

```
PR #0 (QW-1..4) ─┬─→ PR-01 (archive 3-date) ──→ PR-02 (single-marker lint)
                 ├─→ QW-3/QW-4 (Last validated bumps) ─→ PR-08 (cadence detector)
                 └─→ paralel: PR-03 (kvStore guard), PR-06 (AGENTS-family lint),
                              PR-04 (ROUTES expand) ─→ PR-05 (initiatives + ADR index)
                                                 └──→ PR-09 (freshness dashboard)
                                                 PR-07 (playbook 3-way sync) — паралельний
```

Послідовність:

1. **Day 0 (freeze-window):** PR #0 (quick-wins) — XS, merge-ready.
2. **Day 0–1:** PR-01 (archive 3-date sweep). Розблоковує PR-02.
3. **Day 1–3 (паралельно):** PR-02, PR-03, PR-04, PR-06, PR-07. Не залежать одне від одного.
4. **Day 3–5:** PR-08 (depends QW-3/QW-4), PR-05 (depends PR-04).
5. **Post-freeze (2026-06-03+):** PR-09 якщо рев'ю кваліфікує `freshness-dashboard.md` як «новий governance file».

**Critical path:** QW → PR-01 → PR-02. Решта — паралельна.

## Розподіл по групах і P-рівнях

| Group                         | PR cards             | P0  | P1  | P2  |
| ----------------------------- | -------------------- | --- | --- | --- |
| 1) Stale-link / drift cleanup | PR-01, PR-03 (cross) | —   | 1   | 1   |
| 2) Discoverability gaps       | PR-04, PR-05, PR-09  | —   | 2   | 1   |
| 3) Governance sync gates      | PR-02, PR-07, PR-08  | —   | 2   | 1   |
| 4) AGENTS-family consistency  | PR-06                | —   | 1   | —   |
| Quick-wins (XS, окремий PR)   | PR #0 (QW-1..QW-4)   | —   | 4   | —   |

**Розмір:** 1 XS (PR #0), 3 S (PR-01, PR-06, PR-09), 5 M (PR-02, PR-03, PR-04, PR-07, PR-08), 1 L (PR-05). Загалом 9 cards + 1 XS quick-win PR.

## Acceptance gates для всього плану

Після всіх 9 PR-ів (+ QW):

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint                              # включає всі lint:* scripts
pnpm lint:discoverability              # ≤2 hops до 25+ targets
pnpm lint:hard-rules-registry          # 3-way AGENTS↔JSON↔per-rule
pnpm lint:governance-sync --strict     # AGENTS↔CONTRIBUTING, status badges
pnpm lint:tech-debt-freshness          # frontend + backend + mobile
pnpm lint:agents-family-sync           # (PR-06, NEW) — single-source-of-truth invariant
pnpm docs:check-links                  # 0 broken internal links
pnpm docs:check-playbook-index --check
pnpm docs:check-playbook-schema
pnpm docs:check-freshness-coverage
pnpm docs:check-freshness-single-marker # (PR-02, NEW) — 1 freshness-marker per doc
pnpm docs:check-adr-graph
pnpm docs:check-adr-index --check       # (PR-05, NEW) — ADR README ↔ frontmatter
pnpm docs:freshness-dashboard --check   # (PR-09, NEW) — committed dashboard fresh
```

## Що ЯВНО поза скоупом цього плану

- Нові ADR-и, нові initiatives, нові audit-доки — freeze (до 2026-06-02). Якщо drift вимагатиме — переноситься у post-freeze release.
- Розширення AGENTS.md новими hard rules без lint-enforcement — freeze.
- Реструктуризація `docs/governance/rules/` (per-rule files уже у канонічному форматі post-0009 PR 3.2).
- Перепис roast-документа `2026-05-13-documentation-hygiene-roast.md` — лише status-update edits через QW-1/QW-2.
- Lighthouse-CI follow-up (P1-3 у roast) — закрито у `cb459c08 ci(ci): add lighthouse-ci.yml gate (P1.2 / T5)` (#2726).

## Open questions для ревʼю плану

1. **PR-05 ADR README** під freeze — чи дозволено створити index-doc у `docs/adr/`? Якщо ні, виносимо `docs/adr/README.md` у post-freeze (S subtask), `docs/initiatives/README.md` лишається у скоупі (index, не нова initiative).
2. **PR-09 freshness-dashboard** — committed чи `.gitignore`-ed artifact? Якщо committed — окремий freeze concern (новий top-level governance file). Якщо gitignored — `--check` режим не має сенсу (дашборд завжди regenerated locally). Recommendation: committed, з виправданням «це index не policy».
3. **PR-03 kvStore guard scope** — заборона deep-import для всіх `apps/*` чи лише `apps/web`? Аналогія з PR #1411 (strip-js-extensions) — спочатку web, потім server/mobile через окремий ADR. Default: web-only у цьому PR-і.
4. **PR-06 max-lines budget for CLAUDE.md/DEVIN.md** — 40 рядків аргументований («slim contract»), але [Rule #18](../governance/rules/18-module-size-discipline-600.md) для web TS/TSX = 600. Чи додавати 40-line budget як новий hard rule (з freeze це impossible), чи лишити soft-warning у lint?
