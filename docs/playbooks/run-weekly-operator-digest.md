# Playbook: Run Weekly Operator Digest

> **Last validated:** 2026-05-05 by @Skords-01. **Next review:** 2026-08-03.
> **Status:** Active

**Trigger:** щотижневий operating review здоровʼя репо, release-дисципліни, інцидентів і process-friction.

## Owner surface

- Primary surface: engineering operating system
- Governing skill: `sergeant-review-and-merge`

## Required context

- Перегляньте [engineering-metrics.md](../observability/engineering-metrics.md), [feature-flags.md](../feature-flags.md) і [review-checklist.md](../governance/review-checklist.md).

## Steps

### 1. Перегляньте flow-метрики

- PR lead time
- review turnaround
- CI failure rate
- кількість flaky-тестів

### 2. Перегляньте operating debt

- застарілі feature flags
- aging postmortem actions
- docs/governance гейти, що падали протягом тижня
- відкриті security SLA винятки

### 3. Оберіть одну tightening-дію

- оновити один playbook
- підкрутити один alert/runbook
- retire один застарілий прапор
- закрити один повторюваний CI pain point

## Verification

- [ ] Метрики переглянуті за останні 7 днів
- [ ] Один operating-debt item обрано для дії
- [ ] Відкрито потрібний follow-up issue або PR

## When not to use this playbook

- Ви обробляєте активний production-інцидент.
- Вам потрібен лише release checklist, а не щотижневий operating review.

## Related playbooks and skills

- [release.md](./release.md)
- [write-postmortem.md](./write-postmortem.md)
- [retire-feature-flag.md](./retire-feature-flag.md)
