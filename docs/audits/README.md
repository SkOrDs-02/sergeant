# Audits

> **Last validated:** 2026-05-13 by Devin / @Skords-01 (Status-row sync з file headers: `2026-05-04-csp-disable-retrospective` → Closed (A1–A5 resolved 2026-05-06)). **Next review:** 2026-08-11.
> **Status:** Active

Періодичні аудити коду, архітектури та UX. Цей README — навігаційний індекс
із status-таблицею; кожен аудит сам по собі — окремий документ із власним
freshness-маркером (див. `scripts/check-tech-debt-freshness.mjs`).

## Lifecycle

- **Active** — аудит або трекер усе ще використовується для прийняття рішень / пріоритизації.
- **Closed** — оцінка завершена, fixes винесені у tracker (зазвичай — `*-implementation-roadmap.md` або `2026-04-28-ux-improvement-plan.md`); сам документ лишається як historical record.
- **Archived** — аудит застарів і фізично переміщений у `docs/audits/archive/`. Канонічні правила тепер живуть у `docs/design/*` або `docs/governance/*`.

## Жанри під одним парасольником

З 2026-05-05 `docs/audits/` об'єднує два типи документів — раніше був окремий каталог `docs/diagnostics/`, який злито сюди як піджанр (`*-deep-dive/`-директорії).

|             | Generalні аудити (`YYYY-MM-DD-<scope>-audit.md`)                                                     | Deep-dive прожарки (`YYYY-MM-DD-<scope>-deep-dive/`)                          |
| ----------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Періодичні? | Регулярні (квартальні / напівщорічні)                                                                | Ad-hoc, на запит                                                              |
| Скоуп       | Вся система чи весь домен                                                                            | Тонкий зріз з sub-секціями (frontend / architecture / backend / security ...) |
| Структура   | Один файл                                                                                            | Директорія з `00-overview.md` + `01-...md` ... + опційний `round-NN-*.md`     |
| Lifecycle   | Active / Closed / Archived                                                                           | Active / Superseded                                                           |
| Приклад     | [`2026-04-28-sergeant-comprehensive-audit.md`](./archive/2026-04-28-sergeant-comprehensive-audit.md) | [`2026-05-03-web-deep-dive/`](./2026-05-03-web-deep-dive/)                    |

## Як читати таблицю

`Implemented` / `Outstanding` — coarse-grain лічильники recommended-items
у документі. Числа — приблизні («≈»), бо різні аудити форматують
рекомендації по-різному (топ-9, скоринг, секційні гаптики, P0/P1/P2-теги).
Точні per-item статуси завжди живуть у самому документі або у пов'язаному
`*-implementation-roadmap.md`. Реакомпуляція цих лічильників — раз на
квартал під час `Last validated` бампу.

## Документи

| Документ                                                                                                     | Опис                                                                                                                           | Status   | Implemented      | Outstanding   | Tracker                                                                                        |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | -------- | ---------------- | ------------- | ---------------------------------------------------------------------------------------------- |
| [`2026-04-28-implementation-roadmap.md`](./2026-04-28-implementation-roadmap.md)                             | План реалізації покращень                                                                                                      | Active   | —                | —             | self                                                                                           |
| [`2026-05-02-doc-hygiene-audit.md`](./2026-05-02-doc-hygiene-audit.md)                                       | Doc-hygiene аудит — структура, freshness, dead code                                                                            | Active   | 3/5 ≈            | 2 ≈           | embedded fix list                                                                              |
| [`2026-05-03-readme-gap-analysis.md`](./2026-05-03-readme-gap-analysis.md)                                   | README gap analysis — що відсутнє у root README                                                                                | Active   | 0/8 ≈            | 8 ≈           | self                                                                                           |
| [`2026-04-28-ux-improvement-plan.md`](./2026-04-28-ux-improvement-plan.md)                                   | Технічний план покращення UX                                                                                                   | Active   | —                | —             | self                                                                                           |
| [`2026-05-06-ux-roast.md`](./2026-05-06-ux-roast.md)                                                         | UX-прожарка post-onboarding (день 0–7), web                                                                                    | Active   | 10/39            | 29 ≈          | [`2026-05-06-ux-roast-pr-plan.md`](./2026-05-06-ux-roast-pr-plan.md)                           |
| [`2026-05-06-ux-roast-pr-plan.md`](./2026-05-06-ux-roast-pr-plan.md)                                         | План PR-ів за UX-прожаркою — 41 PR + 4 cross-cutting                                                                           | Active   | 10/41            | 31            | self                                                                                           |
| [`2026-05-05-dead-code-and-stale-links-audit.md`](./2026-05-05-dead-code-and-stale-links-audit.md)           | Dead-code & stale-links прохід (knip / docs:check-links)                                                                       | Active   | 5/5              | 6 ≈           | embedded §3 (unused deps + exports + duplicate exports for follow-up PRs)                      |
| [`2026-05-07-app-audit.md`](./2026-05-07-app-audit.md)                                                       | Повний аудит застосунку — web-blocker, mobile/web tests, lint hard-rule, latent imports                                        | Active   | 0/11             | 11            | embedded §10 (P0–P3 follow-up PR plan)                                                         |
| [`2026-05-13-web-frontend-ergonomics-roast.md`](./2026-05-13-web-frontend-ergonomics-roast.md)               | Прожарка #2/10 Web Frontend Ergonomics — toast policy, shortcuts, modal a11y, PWA defer                                        | Active   | 2/7              | 5             | self                                                                                           |
| [`2026-05-13-web-architecture-state-roast.md`](./2026-05-13-web-architecture-state-roast.md)                 | Roast #3/10 — Web Architecture & State (provider invariant test, typed standalone routes registry, state-write-paths doctrine) | Active   | 5/5 closed in PR | 5 P1 deferred | self (§1.1 / §1.2 / §2.1 closed; P1-A/B/C/D/E carried forward)                                 |
| [`archive/2026-04-26-sergeant-audit-devin.md`](./archive/2026-04-26-sergeant-audit-devin.md)                 | Незалежний аудит Devin (historical record)                                                                                     | Archived | 30/31            | 1             | embedded таблиця у самому файлі                                                                |
| [`archive/2026-04-28-sergeant-comprehensive-audit.md`](./archive/2026-04-28-sergeant-comprehensive-audit.md) | Комплексний генеральний аудит                                                                                                  | Archived | 12/18 ≈          | 6 ≈           | [`2026-04-28-implementation-roadmap.md`](./2026-04-28-implementation-roadmap.md)               |
| [`archive/2026-04-28-ux-ui-audit.md`](./archive/2026-04-28-ux-ui-audit.md)                                   | UX/UI аудит 2026                                                                                                               | Archived | —                | —             | [`2026-04-28-ux-improvement-plan.md`](./2026-04-28-ux-improvement-plan.md)                     |
| [`archive/2026-05-03-ftux-onboarding-roast.md`](./archive/2026-05-03-ftux-onboarding-roast.md)               | Web FTUX onboarding roast — 6 P0 + 22 рекомендацій                                                                             | Archived | 3/6 P0           | 3 P0          | [`docs/launch/product-os/ftux-master-tracker.md`](../launch/product-os/ftux-master-tracker.md) |
| [`archive/2026-05-04-csp-disable-retrospective.md`](./archive/2026-05-04-csp-disable-retrospective.md)       | CSP_DISABLE retrospective audit (initiative 0011 PR 1.4)                                                                       | Archived | 5/5              | 0             | self (A1–A5 resolved 2026-05-06)                                                               |
| [`archive/2026-05-11-docs-audit-summary.md`](./archive/2026-05-11-docs-audit-summary.md)                     | Документаційний аудит 2026-05-11                                                                                               | Archived | all CRIT         | 6 scheduled   | self (future-dated follow-ups)                                                                 |
| [`archive/ux-audit-2025.md`](./archive/ux-audit-2025.md)                                                     | UX-аудит 2025                                                                                                                  | Archived | n/a              | n/a           | superseded by [`archive/2026-04-28-ux-ui-audit.md`](./archive/2026-04-28-ux-ui-audit.md)       |

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
