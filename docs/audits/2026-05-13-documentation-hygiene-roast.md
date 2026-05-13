# Doc-hygiene roast — 2026-05-13

> **Last validated:** 2026-05-13 by Devin (child session). **Next review:** 2026-08-11.
> **Status:** Active
> **Cross-refs:**
> [`2026-05-02-doc-hygiene-audit.md`](./2026-05-02-doc-hygiene-audit.md) — попередній doc-hygiene прохід ·
> [`2026-05-03-readme-gap-analysis.md`](./2026-05-03-readme-gap-analysis.md) — gap-analysis README ·
> [`2026-05-05-dead-code-and-stale-links-audit.md`](./2026-05-05-dead-code-and-stale-links-audit.md) — попередній прохід по dead-links (закрив 14, лишилось 53 нових через archive-move) ·
> [`archive/2026-05-11-docs-audit-summary.md`](./archive/2026-05-11-docs-audit-summary.md) — summary 2026-05-11 ·
> [`docs/governance/doc-freshness.md`](../governance/doc-freshness.md) — система freshness-маркерів.

## TL;DR

1. **Регресія link-checker-а: 53 broken internal links.** Усі через batch-archive-move від 2026-05-13 ([`8b5a22ef docs(docs): archive 6 mature closed audits without 90-day wait`](https://github.com/Skords-01/Sergeant/commits/main)). Файли переміщені у `docs/audits/archive/`, але внутрішні relative-paths (`../adr/`, `../launch/`, `./<sibling>`) не оновлені — тепер вони резолвлять на одну директорію вище, ніж треба. **Fixed у цьому PR.**
2. **`lighthouse-ci.yml` GitHub workflow не існує**, але `apps/web/AGENTS.md:45`, `docs/planning/sprint-roadmap-q2q3-2026.md:38,374` і `AGENTS.md` посилаються на нього як «shipped». **Fixed у цьому PR** — текст бампнуто до «planned, локально через `pnpm lighthouse`».
3. **`docs/initiatives/0006-frontend-routing-and-code-split.md` стейл**: рапортує `useHashRouter` migration як «2/4», насправді 4/4. Дві останні (shared `useHashRoute.ts` + per-module hooks для fizruk/routine) закриті у `f5caf1ee` (2026-05-13). **Fixed у цьому PR.**
4. **Tech-debt freshness guard не покривав `docs/tech-debt/backend.md`** — `scripts/check-tech-debt-freshness.mjs` `DEFAULT_FILES` містив лише frontend + mobile. Backend `Last validated` міг дрейфувати без CI-сигналу. **Fixed у цьому PR.**
5. **README gap-analysis (`2026-05-03`) status drift**: `docs/audits/README.md` досі рапортує `Implemented: 0/8 ≈ Outstanding: 8 ≈`, хоча 13/15 пунктів чек-листу §6 уже у README.md (Modules, Tech Stack, Prerequisites, Quickstart, Testing, Deployment, Architecture, Integrations, Troubleshooting, License, Feature flags, Observability, Documentation map). Залишається 2 (Packages як окрема таблиця, Environment Variables як окрема секція). **Fixed у follow-up PR** — рядок пересинхронізовано на `13/15 ≈ / 2` (див. §Прогрес виконання → P1-1).
6. **AGENTS.md split** — попередня прожарка пропонувала розгрупування у `AGENTS.md` slim + `docs/governance/hard-rules.md` full. Поточний AGENTS.md = 170 рядків (manageable), вже містить cross-refs у `docs/governance/rules/`. **Split не потрібен** — попередня прожарка спиралась на стару версію файлу.
7. **`docs/audits/archive/2026-04-28-ux-ui-audit.md` 3-date-drift** — у файлі ще 3 окремі дати (Last validated, Initial audit date, Initial audit reference). Файл Archived; рекомендується канонікалізувати у наступному audit-passе.

## P0 — закрити в цьому PR ✓

### P0-1. Broken internal links (53 → 0) ✓

**Root cause:** commit `8b5a22ef docs(docs): archive 6 mature closed audits without 90-day wait` переніс файли у `docs/audits/archive/` без оновлення `../<dir>/` relative-paths. Тепер посилання типу `../adr/foo.md` резолвляться у `docs/audits/adr/foo.md` (неіснує) замість `docs/adr/foo.md`.

**Action: Change** — оновлені relative paths:

| File:line                                                                        | Action                                                                                                                                                      |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/audits/archive/2026-04-26-sergeant-audit-devin.md:391`                     | `../adr/0002-tool-lifecycle.md` → `../../adr/0002-tool-lifecycle.md`                                                                                        |
| `docs/audits/archive/2026-04-28-sergeant-comprehensive-audit.md:4,10`            | `./2026-04-28-implementation-roadmap.md` → `../2026-04-28-implementation-roadmap.md`                                                                        |
| `docs/audits/archive/2026-04-28-ux-ui-audit.md:4,11,22`                          | `./2026-04-28-ux-improvement-plan.md` → `../2026-04-28-ux-improvement-plan.md`                                                                              |
| `docs/audits/archive/2026-04-28-ux-ui-audit.md:24`                               | `../design/design-system.md` → `../../design/design-system.md`                                                                                              |
| `docs/audits/archive/2026-05-03-ftux-onboarding-roast.md` (×16, including `:32`) | `../launch/`, `../design/`, `../observability/`, `../../apps/`, `./<peer>` — всі +1 рівень `../` ([sed batch](../../scripts/docs/check-markdown-links.mjs)) |
| `docs/audits/archive/2026-05-04-csp-disable-retrospective.md` (×14)              | `../initiatives/`, `../security/`, `../governance/`, `../playbooks/`, `../tech-debt/` — всі +1 рівень `../`                                                 |
| `docs/audits/archive/2026-05-11-docs-audit-summary.md:60-66`                     | `../adr/0035-...`, `../adr/0039-...`, `../adr/0046-...`, `../initiatives/archive/2026-08-02-...` — +1 рівень `../`                                          |

**Verification:** `pnpm docs:check-links` тепер `✅ All markdown links resolve.`

### P0-2. `lighthouse-ci.yml` workflow drift ✓

**Root cause:** `.github/workflows/lighthouse-ci.yml` ніколи не був зашиплений (`git log --all --oneline -- '.github/workflows/lighthouse-ci.yml'` → empty). Документація рапортує T5 як «First pass shipped (warn-only)», що неточно. `apps/web/lighthouserc.json` існує, `pnpm --filter @sergeant/web lighthouse` працює локально, але CI-workflow відсутній.

**Action: Change** — оновити claim до «planned, локальний прогон через `pnpm lighthouse`»:

| File:line                                       | Зміна                                                                                           |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `apps/web/AGENTS.md:45`                         | «Workflow: lighthouse-ci.yml» → «Workflow planned (T5 у тех-боргу); локально `pnpm lighthouse`» |
| `docs/planning/sprint-roadmap-q2q3-2026.md:38`  | Status `🚧 First pass shipped (warn-only)` → `🚧 Local-only; workflow planned`                  |
| `docs/planning/sprint-roadmap-q2q3-2026.md:374` | Workflow link замінено на текст із поміткою **planned**                                         |
| `AGENTS.md:117,123,129`                         | Performance budgets рядок переписано: workflow planned, локально через `pnpm lighthouse`        |

**Action: Add (recommended P2)** — створити `.github/workflows/lighthouse-ci.yml` із `pull_request` тригером, `warn`-only severity (як описано у [`docs/planning/sprint-roadmap-q2q3-2026.md` § T5](../planning/sprint-roadmap-q2q3-2026.md)). Не в цьому PR — поза скоупом «documentation hygiene».

### P0-3. `useHashRoute.ts` ghost reference ✓

**Root cause:** `f5caf1ee chore(web): remove unused useHashRoute hook + tests + exports` (2026-05-13) видалив `apps/web/src/shared/hooks/useHashRoute.ts`. `docs/initiatives/0006-frontend-routing-and-code-split.md:119,160` рапортує файл як «still active for fizruk + routine», що неправда — fizruk має `useFizrukRoute.ts`, routine має `useRoutineRoute.ts`.

**Action: Change** ([`docs/initiatives/0006-frontend-routing-and-code-split.md`](../initiatives/0006-frontend-routing-and-code-split.md)):

- `line 119` — статус прогрес-бара `[ ] Прогрес: 2/4` → `[x] 4/4: ... shared usage closed in f5caf1ee`
- `line 160` — посилання на видалений файл → strikethrough + посилання на per-module hooks

### P0-4. Tech-debt freshness guard coverage gap ✓

**Root cause:** [`scripts/check-tech-debt-freshness.mjs:31-34`](../../scripts/check-tech-debt-freshness.mjs) `DEFAULT_FILES` містив лише `frontend.md` + `mobile.md`. `backend.md` мав ручний freshness header (`Last validated: 2026-05-11`), але без auto-check.

**Action: Change** ([`scripts/check-tech-debt-freshness.mjs`](../../scripts/check-tech-debt-freshness.mjs)):

- Додано `docs/tech-debt/backend.md` у `DEFAULT_FILES`
- Розширено marker grammar: тепер також парсить `> **Last validated:** YYYY-MM-DD …` (canonical freshness-format у всьому репо), а не лише історичні `> **Оновлено …**` / `> **Last reviewed: …**`
- Тести оновлено: `scripts/__tests__/check-tech-debt-freshness.test.mjs` (новий case для canonical pattern + дефолтний список з 3 файлів)

**Verification:**

```
✅ docs/tech-debt/frontend.md:8: marker dated 2026-05-13 (0 day(s) ago).
✅ docs/tech-debt/backend.md:3: marker dated 2026-05-11 (2 day(s) ago).
✅ docs/tech-debt/mobile.md:6: marker dated 2026-05-12 (1 day(s) ago).
```

## P1 — recommended follow-up (не в цьому PR)

### P1-1. `docs/audits/README.md` README-gap-analysis row drift ✅ Closed

**Закрито у follow-up PR** — рядок `2026-05-03-readme-gap-analysis.md` у `docs/audits/README.md` пересинхронізовано з `0/8 ≈ / 8 ≈` на `13/15 ≈ / 2`. `Last validated` у `docs/audits/README.md` бампнуто з посиланням на цей audit § P1-1. Деталі дії перенесено у §Прогрес виконання нижче.

### P1-2. `docs/audits/archive/2026-04-28-ux-ui-audit.md` 3-date canonicalization

Файл досі містить 3 окремі дати:

- `Last validated: 2026-05-13` (header — bump-last-validated.mjs точка істини)
- `Initial audit date: 2026-04-28` (sub-header — історичний context)
- `Дата аудиту: 2026-04-28` / `Дата оновлення: ...` (in-content — НЕ дрейфує, але дублює `Initial audit date`)

**Дія (рекомендована):** Файл Archived → залишити як-є (read-only historical record). Якщо у майбутньому unarchive — спочатку канонікалізувати у `Last validated` + `Initial audit date` (no third date).

### P1-3. `.github/workflows/lighthouse-ci.yml` follow-up

Виокремити у окрему ініціативу: створити `lighthouse-ci.yml` workflow + закрити T5 (зараз `🚧 Local-only` у тех-боргу sprint-roadmap). Workflow `warn`-only severity → tightening до `error` після baseline.

## P2 — long-term (не блокує)

### P2-1. Codemod catalog enforcement gap

[`scripts/codemods/README.md`](../../scripts/codemods/README.md) каталогізує `@deprecated` codemods. ESLint guard для запобігання нових deep-import-ів `kvStore` (per `2026-05-02-doc-hygiene-audit.md` PR #013) — не зашиплений (статус: planned).

### P2-2. Knip respects-scaffolded edge case

[`scripts/knip-respects-scaffolded.mjs`](../../scripts/knip-respects-scaffolded.mjs) фільтрує `@scaffolded`, але не `@experimental` (рідкісно вживаний lifecycle marker). Низький пріоритет: 0 файлів зараз із `@experimental`.

## Прогрес виконання (в цьому PR)

- ✅ **P0-1**: 53 → 0 broken internal links. `pnpm docs:check-links` зелений.
- ✅ **P0-2**: 4 stale «lighthouse-ci.yml shipped» refs → виправлені на «planned, local only».
- ✅ **P0-3**: useHashRoute.ts ghost ref → виправлено + bumped `[x] 4/4`.
- ✅ **P0-4**: tech-debt-freshness тепер покриває `backend.md`; marker grammar розширена для canonical `Last validated:` pattern; +1 unit-test, +1 default list test.
- ✅ **P1-1** (follow-up PR): `docs/audits/README.md` row для `2026-05-03-readme-gap-analysis.md` пересинхронізовано з `Implemented: 0/8 ≈ / Outstanding: 8 ≈` на `Implemented: 13/15 ≈ / Outstanding: 2`. Реальний стан зачекдено по `README.md` (13 секцій присутні: Modules, Tech Stack, Prerequisites, Quickstart, Testing, Deployment, Architecture, Integrations, Troubleshooting, License, Feature flags, Observability, Documentation map; 2 залишаються outstanding — Packages як окрема таблиця-каталог і Environment Variables як окрема секція). `docs/audits/README.md` `Last validated` бампнуто. Сам `2026-05-03-readme-gap-analysis.md` не редагувався — деталізовані §Резюме-пункти живуть там як історичний знімок 2026-05-03.
- ⏸ **P1-2/P1-3, P2-1/P2-2**: рекомендовані follow-up-и, не блокуючі.

## Файли у цьому PR (~7-9)

| File                                                             | Action                                                                       |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `docs/audits/archive/2026-04-26-sergeant-audit-devin.md`         | Fix `../adr/` → `../../adr/`                                                 |
| `docs/audits/archive/2026-04-28-sergeant-comprehensive-audit.md` | Fix `./<peer>` → `../<peer>`                                                 |
| `docs/audits/archive/2026-04-28-ux-ui-audit.md`                  | Fix `./<peer>`, `../design/`                                                 |
| `docs/audits/archive/2026-05-03-ftux-onboarding-roast.md`        | Batch +1 `../` рівень                                                        |
| `docs/audits/archive/2026-05-04-csp-disable-retrospective.md`    | Batch +1 `../` рівень                                                        |
| `docs/audits/archive/2026-05-11-docs-audit-summary.md`           | Batch +1 `../` рівень                                                        |
| `apps/web/AGENTS.md`                                             | Lighthouse drift fix                                                         |
| `docs/planning/sprint-roadmap-q2q3-2026.md`                      | T5 status + workflow ref drift fix                                           |
| `AGENTS.md`                                                      | Performance budgets table: lighthouse workflow planned, not shipped          |
| `docs/initiatives/0006-frontend-routing-and-code-split.md`       | useHashRoute.ts: `[ ] 2/4` → `[x] 4/4`; видаленa file ref → per-module hooks |
| `scripts/check-tech-debt-freshness.mjs`                          | + `docs/tech-debt/backend.md` у DEFAULT_FILES; + `Last validated:` pattern   |
| `scripts/__tests__/check-tech-debt-freshness.test.mjs`           | Tests for new DEFAULT_FILES + new marker pattern                             |
| `docs/audits/2026-05-13-documentation-hygiene-roast.md`          | **Новий** — цей файл                                                         |
| `docs/audits/README.md`                                          | +1 status row для цього roast                                                |

## Acceptance gates

```bash
pnpm install --frozen-lockfile
pnpm docs:check-links              # ✅ All markdown links resolve.
pnpm lint:tech-debt-freshness      # ✅ frontend + backend + mobile freshness OK
node --test scripts/__tests__/check-tech-debt-freshness.test.mjs   # 33 pass / 0 fail
pnpm check                         # pre-PR gate
```
