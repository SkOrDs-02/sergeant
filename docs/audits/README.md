# Audits

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-07-31.
> **Status:** Active

Періодичні аудити коду, архітектури та UX. Цей README — навігаційний індекс
із status-таблицею; кожен аудит сам по собі — окремий документ із власним
freshness-маркером (див. `scripts/check-tech-debt-freshness.mjs`).

## Lifecycle

- **Active** — аудит або трекер усе ще використовується для прийняття рішень / пріоритизації.
- **Closed** — оцінка завершена, fixes винесені у tracker (зазвичай — `*-implementation-roadmap.md` або `UX-IMPROVEMENT-PLAN.md`); сам документ лишається як historical record.
- **Archived** — аудит застарів і фізично переміщений у `docs/audits/archive/`. Канонічні правила тепер живуть у `docs/design/*` або `docs/governance/*`.

## Як читати таблицю

`Implemented` / `Outstanding` — coarse-grain лічильники recommended-items
у документі. Числа — приблизні («≈»), бо різні аудити форматують
рекомендації по-різному (топ-9, скоринг, секційні гаптики, P0/P1/P2-теги).
Точні per-item статуси завжди живуть у самому документі або у пов'язаному
`*-implementation-roadmap.md`. Реакомпуляція цих лічильників — раз на
квартал під час `Last validated` бампу.

## Документи

| Документ                                                                                     | Опис                                                | Status   | Implemented | Outstanding | Tracker                                                                          |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------- | -------- | ----------- | ----------- | -------------------------------------------------------------------------------- |
| [`2026-04-26-sergeant-audit-devin.md`](./2026-04-26-sergeant-audit-devin.md)                 | Незалежний аудит Devin (historical record)          | Closed   | 30/31       | 1           | embedded таблиця у самому файлі                                                  |
| [`2026-04-28-sergeant-comprehensive-audit.md`](./2026-04-28-sergeant-comprehensive-audit.md) | Комплексний генеральний аудит                       | Closed   | 12/18 ≈     | 6 ≈         | [`2026-04-28-implementation-roadmap.md`](./2026-04-28-implementation-roadmap.md) |
| [`2026-04-28-implementation-roadmap.md`](./2026-04-28-implementation-roadmap.md)             | План реалізації покращень                           | Active   | —           | —           | self                                                                             |
| [`2026-05-02-doc-hygiene-audit.md`](./2026-05-02-doc-hygiene-audit.md)                       | Doc-hygiene аудит — структура, freshness, dead code | Active   | 3/5 ≈       | 2 ≈         | embedded fix list                                                                |
| [`2026-05-03-readme-gap-analysis.md`](./2026-05-03-readme-gap-analysis.md)                   | README gap analysis — що відсутнє у root README     | Active   | 0/8 ≈       | 8 ≈         | self                                                                             |
| [`UX-UI-AUDIT-2026.md`](./UX-UI-AUDIT-2026.md)                                               | UX/UI аудит 2026                                    | Closed   | —           | —           | [`UX-IMPROVEMENT-PLAN.md`](./UX-IMPROVEMENT-PLAN.md)                             |
| [`UX-IMPROVEMENT-PLAN.md`](./UX-IMPROVEMENT-PLAN.md)                                         | Технічний план покращення UX                        | Active   | —           | —           | self                                                                             |
| [`2026-05-03-ftux-onboarding-roast.md`](./2026-05-03-ftux-onboarding-roast.md)               | Web FTUX onboarding roast — 6 P0 + 22 рекомендацій  | Active   | 0/6 P0 ≈    | 6 P0 ≈      | self                                                                             |
| [`archive/ux-audit-2025.md`](./archive/ux-audit-2025.md)                                     | UX-аудит 2025                                       | Archived | n/a         | n/a         | superseded by [`UX-UI-AUDIT-2026.md`](./UX-UI-AUDIT-2026.md)                     |

## Diagnostics (ad-hoc deep-dives)

Окремий жанр від періодичних аудитів — `docs/diagnostics/` тримає
точкові «прожарки», які роблять fresh second opinion на конкретний
зріз системи й завершуються коротким roadmap'ом. Лінкаються звідси,
бо часто породжують нові tracker-items для активних аудитів.

| Документ                                                                               | Опис                                                                          | Status | Implemented | Outstanding |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------ | ----------- | ----------- |
| [`../diagnostics/2026-05-03-web-deep-dive/`](../diagnostics/2026-05-03-web-deep-dive/) | Web deep-dive — 18-item roadmap (forms, state, security, observability, DevX) | Active | 5/18        | 13          |

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
- Для нових аудитів використовуй шаблон з `docs/audits/UX-UI-AUDIT-2026.md`
  (front-matter блок зверху + Lifecycle-status + явний tracker).
