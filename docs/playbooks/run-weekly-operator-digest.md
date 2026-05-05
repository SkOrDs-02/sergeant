# Playbook: Тижневий operator-дайджест

> **Last validated:** 2026-05-05 by @Skords-01. **Next review:** 2026-08-04.
> **Status:** Active

**Trigger:** щотижневий операційний огляд (operating review) здоров'я репозиторію, релізної дисципліни, інцидентів і процесного тертя (process friction).

## Owner surface

- Primary surface: інженерна операційна система (engineering operating system).
- Governing skill: `sergeant-review-and-merge`.

## Потрібний контекст

- Перегляньте [engineering-metrics.md](../observability/engineering-metrics.md), [feature-flags.md](../governance/feature-flags.md) і [review-checklist.md](../governance/review-checklist.md).

## Кроки

### 1. Перегляньте метрики потоку (flow)

- час від відкриття PR до мерджу (англ. lead time)
- час реакції на ревʼю (англ. review turnaround)
- частота падінь CI за тиждень (англ. CI failure rate)
- кількість «флакі»-тестів (нестабільних) за останні 7 днів

### 2. Перегляньте операційний борг (operating debt)

- застарілі feature-прапори, які час прибрати
- прострочені пункти дій з post-mortem-ів
- governance-гейти з docs, що падали протягом тижня
- відкриті винятки з безпекового SLA

### 3. Оберіть одну посилюючу (tightening) дію

- оновіть один playbook
- підкрутіть один alert або runbook
- ретайрніть один застарілий feature-прапор
- закрийте одну повторювану CI-проблему (recurring CI pain point)

## Verification

- [ ] Метрики переглянуті за останні 7 днів
- [ ] Один пункт операційного боргу обрано для дії
- [ ] Відкрито потрібний follow-up issue або PR

## Коли цей playbook НЕ використовувати

- Ви обробляєте активний продакшн-інцидент — використовуйте `declare-incident.md`.
- Вам потрібен лише релізний чеклист, а не щотижневий операційний огляд — використовуйте `release.md`.

## Споріднені playbook-и та skills

- [release.md](./release.md)
- [write-postmortem.md](./write-postmortem.md)
- [retire-feature-flag.md](./retire-feature-flag.md)
