# Playbook: Тижневий operator-дайджест

> **Last validated:** 2026-05-05 by @Skords-01. **Next review:** 2026-08-04.
> **Status:** Active

**Trigger:** щотижневий operating review здоровʼя репо, release-дисципліни, інцидентів і process-friction.

## Owner surface

- Primary surface: інженерна operating-система (engineering operating system)
- Governing skill: `sergeant-review-and-merge`

## Required context

- Перегляньте [engineering-metrics.md](../observability/engineering-metrics.md), [feature-flags.md](../feature-flags.md) і [review-checklist.md](../governance/review-checklist.md).

## Кроки

### 1. Перегляньте flow-метрики

- час від відкриття PR до merge (lead time)
- час реакції на ревʼю (review turnaround)
- частота падінь CI (CI failure rate)
- кількість флакі-тестів за тиждень

### 2. Перегляньте operating-debt

- застарілі feature-прапори (feature flags), які пора прибрати
- просрочені post-mortem action items
- docs/governance гейти, що падали протягом тижня
- відкриті security SLA винятки

### 3. Оберіть одну посилюючу (tightening) дію

- оновити один playbook
- підкрутити один alert або runbook
- ретайрити один застарілий прапор
- закрити одну повторювану CI-проблему (recurring CI pain point)

## Verification

- [ ] Метрики переглянуті за останні 7 днів
- [ ] Один operating-debt пункт обрано для дії
- [ ] Відкрито потрібний follow-up issue або PR

## Коли цей playbook НЕ використовувати

- Ви обробляєте активний production-інцидент — використовуйте `declare-incident.md`.
- Вам потрібен лише release-чеклист, а не щотижневий operating review — використовуйте `release.md`.

## Споріднені playbook-и та skills

- [release.md](./release.md)
- [write-postmortem.md](./write-postmortem.md)
- [retire-feature-flag.md](./retire-feature-flag.md)
