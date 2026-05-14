# Audits — каталог документів та статусів

> **Last validated:** 2026-05-14 by Devin (deduplicated double `Last validated:` marker — попередні дві версії від 2026-05-13 23:12 та 23:22 UTC залишили обидва рядки замість заміни; історичний контекст збережено в git history. Останні зміни 2026-05-13: P1-4 cleanup — архівовано `2026-04-28-implementation-roadmap.md` + `2026-04-28-ux-improvement-plan.md` у `archive/` за [`2026-05-13-ftux-onboarding-roast.md`](./2026-05-13-ftux-onboarding-roast.md) § P1-4; mobile-reliability-ux-roast counter bumped 3/12 → 4/12 / Outstanding 9 → 8 after P2.1 dead-code `apps/mobile/src/modules/shared/ModuleErrorBoundary.tsx` (206 LOC) removal; bumped `2026-05-13-web-frontend-ergonomics-roast.md` counter to 3/7 ≈ after F2 part-1 rule landing — `sergeant-design/no-bare-fixed-inset-modal` warn-only; re-sync `2026-05-03-readme-gap-analysis.md` row `0/8 ≈ / 8 ≈` → `13/15 ≈ / 2` per [`2026-05-13-documentation-hygiene-roast.md`](./2026-05-13-documentation-hygiene-roast.md) § P1-1; додано рядок для `2026-05-13-mobile-reliability-ux-roast.md`; Status-row sync з file headers: `2026-05-04-csp-disable-retrospective` → Closed (A1–A5 resolved 2026-05-06)). **Next review:** 2026-08-12.

> **Status:** Active

> **Single source of truth → root [`AGENTS.md`](../../AGENTS.md).** Цей файл —
> індекс аудиторських документів. Не дублюй repo policy: hard rules,
> performance budgets, governance — у `docs/governance/`.

## Що тут лежить

- **Прожарки** (`*-roast.md`) — тематичні rolling-roast програми (#1/10 …
  #10/10) з freshness-маркером, cross-refs, TL;DR, P0/P1/P2 розбивкою.
- **Аудити** (`*-audit.md`) — комплексні перевірки якості, безпеки, UX,
  doc-hygiene тощо.
- **Implementation-roadmap-и** (`*-roadmap.md`) — план послідовних PR-ів
  за результатами аудитів.
- **Архів** (`archive/`) — superseded або completed-and-frozen аудити.

## Як читати

`Status` — поточний life-cycle статус документа: `Active` (актуальний,
треба перевіряти), `Archived` (superseded або завершений),
`Scaffolded` (skeleton без вмісту).

`Implemented` / `Outstanding` — coarse-grain лічильники recommended-items
у документі. Числа — приблизні («≈»), бо різні аудити форматують
рекомендації по-різному (топ-9, скоринг, секційні гаптики, P0/P1/P2-теги).
Точні per-item статуси завжди живуть у самому документі або у пов'язаному
`*-implementation-roadmap.md`. Реакомпуляція цих лічильників — раз на
квартал під час `Last validated` бампу.

## Документи

| Документ                                                                                           | Опис                                                                                                                           | Status | Implemented      | Outstanding   | Tracker                                                                                                      |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------ | ---------------- | ------------- | ------------------------------------------------------------------------------------------------------------ |
| [`2026-05-02-doc-hygiene-audit.md`](./2026-05-02-doc-hygiene-audit.md)                             | Doc-hygiene аудит — структура, freshness, dead code                                                                            | Active | 3/5 ≈            | 2 ≈           | embedded fix list                                                                                            |
| [`2026-05-03-readme-gap-analysis.md`](./2026-05-03-readme-gap-analysis.md)                         | README gap analysis — що відсутнє у root README                                                                                | Active | 13/15 ≈          | 2             | self                                                                                                         |
| [`2026-05-05-dead-code-and-stale-links-audit.md`](./2026-05-05-dead-code-and-stale-links-audit.md) | Dead-code & stale-links прохід (knip / docs:check-links)                                                                       | Active | 5/5              | 6 ≈           | embedded §3 (unused deps + exports + duplicate exports for follow-up PRs)                                    |
| [`2026-05-06-ux-roast-pr-plan.md`](./2026-05-06-ux-roast-pr-plan.md)                               | План PR-ів за UX-прожаркою — 41 PR + 4 cross-cutting                                                                           | Active | 10/41            | 31            | self                                                                                                         |
| [`2026-05-06-ux-roast.md`](./2026-05-06-ux-roast.md)                                               | UX-прожарка post-onboarding (день 0–7), web                                                                                    | Active | 10/39            | 29 ≈          | [`2026-05-06-ux-roast-pr-plan.md`](./2026-05-06-ux-roast-pr-plan.md)                                         |
| [`2026-05-07-app-audit.md`](./2026-05-07-app-audit.md)                                             | Повний аудит застосунку — web-blocker, mobile/web tests, lint hard-rule, latent imports                                        | Active | 0/11             | 11            | embedded §10 (P0–P3 follow-up PR plan)                                                                       |
| [`2026-05-13-backend-performance-roast.md`](./2026-05-13-backend-performance-roast.md)             | Backend/performance прожарка #4/10 — error handling, validation, observability, env                                            | Active | 7/14 ≈           | 7 ≈           | embedded "Прогрес виконання" + cross-refs                                                                    |
| [`2026-05-13-documentation-hygiene-roast.md`](./2026-05-13-documentation-hygiene-roast.md)         | Doc-hygiene прожарка #8/10 — links/freshness/playbook-catalog, post-archive-move regression fix                                | Active | 4/4 P0           | 3 P1 / 2 P2   | embedded §Progress                                                                                           |
| [`2026-05-13-ftux-onboarding-roast.md`](./2026-05-13-ftux-onboarding-roast.md)                     | FTUX onboarding day 0-7 roast (прожарка #1/10)                                                                                 | Active | 3/3 P0 + 1/4 P1  | 3 P1 + 3 P2   | [`docs/launch/product-os/ftux-master-tracker.md`](../launch/product-os/ftux-master-tracker.md)               |
| [`2026-05-13-mobile-reliability-ux-roast.md`](./2026-05-13-mobile-reliability-ux-roast.md)         | Прожарка #10/10 — mobile (Expo + Capacitor) reliability & UX                                                                   | Active | 4/12             | 8             | embedded "Outstanding" table                                                                                 |
| [`2026-05-13-security-observability-roast.md`](./2026-05-13-security-observability-roast.md)       | Security & observability roast — CSP, secrets, Sentry/OTel/web-vitals, audit logs                                              | Active | 1/9              | 8             | embedded §Прогрес-виконання + §P0/P1/P2                                                                      |
| [`2026-05-13-testing-devx-roast.md`](./2026-05-13-testing-devx-roast.md)                           | Прожарка #6/10 — Testing & DevX (Vitest/Jest/Playwright/Detox, CI, pre-commit)                                                 | Active | 8/14             | 6             | embedded §Outstanding + [`docs/testing/2026-05-05-tests-pr-plan.md`](../testing/2026-05-05-tests-pr-plan.md) |
| [`2026-05-13-web-architecture-state-roast.md`](./2026-05-13-web-architecture-state-roast.md)       | Roast #3/10 — Web Architecture & State (provider invariant test, typed standalone routes registry, state-write-paths doctrine) | Active | 5/5 closed in PR | 5 P1 deferred | self (§1.1 / §1.2 / §2.1 closed; P1-A/B/C/D/E carried forward)                                               |
| [`2026-05-13-web-frontend-ergonomics-roast.md`](./2026-05-13-web-frontend-ergonomics-roast.md)     | Прожарка #2/10 Web Frontend Ergonomics — toast policy, shortcuts, modal a11y, PWA defer                                        | Active | 3/7 ≈            | 4 ≈           | self (F1 / F3 closed; F2 part-1 rule landed warn-only; F2 part-II + F4 / F5 / F6 / F7 outstanding)           |

| [`2026-05-13-dead-code-hard-rules-roast.md`](./2026-05-13-dead-code-hard-rules-roast.md) | Dead code + hard-rules roast #9/10 (knip / dead-code:files / docs:check-links) | Active | 12/13 | 1 ≈ | embedded §6 (knip Unlisted/Unresolved sweep) — P1.2 closed via `.github/workflows/lighthouse-ci.yml` (2026-05-13) |

| [`2026-05-13-revenue-monetization-roast.md`](./2026-05-13-revenue-monetization-roast.md) | Revenue / monetization / paywall roast — follow-up до 2026-05-04 | Active | 7/18 | 11 | self (Прогрес виконання) + [`docs/initiatives/0010-revenue-first-launch.md`](../initiatives/0010-revenue-first-launch.md) |

| [`archive/2026-04-26-sergeant-audit-devin.md`](./archive/2026-04-26-sergeant-audit-devin.md) | Незалежний аудит Devin (historical record) | Archived | 30/31 | 1 | embedded таблиця у самому файлі |
| [`archive/2026-04-28-implementation-roadmap.md`](./archive/2026-04-28-implementation-roadmap.md) | План реалізації покращень (архівовано P1-4 — консолідовано у master tracker) | Archived | — | — | [`docs/launch/product-os/ftux-master-tracker.md`](../launch/product-os/ftux-master-tracker.md) |
| [`archive/2026-04-28-sergeant-comprehensive-audit.md`](./archive/2026-04-28-sergeant-comprehensive-audit.md) | Комплексний генеральний аудит | Archived | 12/18 ≈ | 6 ≈ | [`archive/2026-04-28-implementation-roadmap.md`](./archive/2026-04-28-implementation-roadmap.md) |
| [`archive/2026-04-28-ux-improvement-plan.md`](./archive/2026-04-28-ux-improvement-plan.md) | Технічний план покращення UX (архівовано P1-4 — консолідовано у master tracker) | Archived | — | — | [`docs/launch/product-os/ftux-master-tracker.md`](../launch/product-os/ftux-master-tracker.md) |
| [`archive/2026-04-28-ux-ui-audit.md`](./archive/2026-04-28-ux-ui-audit.md) | UX/UI аудит 2026 | Archived | — | — | [`archive/2026-04-28-ux-improvement-plan.md`](./archive/2026-04-28-ux-improvement-plan.md) |
| [`archive/2026-05-03-ftux-onboarding-roast.md`](./archive/2026-05-03-ftux-onboarding-roast.md) | Web FTUX onboarding roast — 6 P0 + 22 рекомендацій | Archived | 3/6 P0 | 3 P0 | [`docs/launch/product-os/ftux-master-tracker.md`](../launch/product-os/ftux-master-tracker.md) |
| [`archive/2026-05-04-csp-disable-retrospective.md`](./archive/2026-05-04-csp-disable-retrospective.md) | CSP_DISABLE retrospective audit (initiative 0011 PR 1.4) | Archived | 5/5 | 0 | self (A1–A5 resolved 2026-05-06) |
| [`archive/2026-05-11-docs-audit-summary.md`](./archive/2026-05-11-docs-audit-summary.md) | Документаційний аудит 2026-05-11 | Archived | all CRIT | 6 scheduled | self (future-dated follow-ups) |
| [`archive/ux-audit-2025.md`](./archive/ux-audit-2025.md) | UX-аудит 2025 | Archived | n/a | n/a | superseded by [`archive/2026-04-28-ux-ui-audit.md`](./archive/2026-04-28-ux-ui-audit.md) |

## Deep-dive прожарки

Точкові ad-hoc прожарки на конкретний зріз системи з власним internal roadmap (sub-файли + sprint-burndown файли). Часто породжують нові tracker-items, які вливаються у `*-implementation-roadmap.md`.

| Документ                                                   | Опис                                                                          | Status | Implemented | Outstanding |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------- | ------ | ----------- | ----------- |
| [`2026-05-03-web-deep-dive/`](./2026-05-03-web-deep-dive/) | Web deep-dive — 18-item roadmap (forms, state, security, observability, DevX) | Active | 5/18        | 13          |

## Process

- При злитті PR-у, що закриває recommendation з аудиту:
  1. Оновити inline статус усередині самого документа (taglines типу `— done #PR`).
  2. Бампнути `Implemented` лічильник у таблиці вище.
  3. Якщо це закриває all-items → перевести Status у `Closed` і вказати tracker.
  4. Якщо документ повністю superseded — перенести у `archive/` і додати
     посилання на правонаступника в колонці Tracker.
- CI freshness-gate (`scripts/check-tech-debt-freshness.mjs`) форсить
  `Last validated:` маркер ≤ 60 днів. PR падає, якщо маркер старший за
  поріг — re-validate сторінку (статуси, лічильники, нові аудити) і
  онови дату.
- Для нових аудитів використовуй шаблон з [`docs/audits/archive/2026-04-28-ux-ui-audit.md`](./archive/2026-04-28-ux-ui-audit.md)
  (front-matter блок зверху + Lifecycle-status + явний tracker).
