# Playbook: Оголошення інциденту

> **Last validated:** 2026-05-13 by @andrijvigrav. **Next review:** 2026-08-11.
> **Status:** Active

**Trigger:** продакшн-проблема вийшла за межі alert triage і вимагає явної severity, owner-а, шляху мітигації або координації rollback-у.

## Owner surface

- Primary surface: координація інциденту.
- Governing skill: `sergeant-deploy-and-observability`.

## Required context

- Спершу `sergeant-start-here`, потім `sergeant-deploy-and-observability`.
- Перечитати [incident-severity-policy.md](../governance/incident-severity-policy.md) і [service-catalog.md](../architecture/service-catalog.md).

## Steps

### 1. Класифікувати severity

- Користуйся severity-матрицею, а не лише інтуїцією.
- Запиши уражену поверхню (surface), impact і рівень впевненості.

### 2. Відкрити один incident log

- Використовуй PR, issue або ops-тред, що залишиться канонічним таймлайном.
- Запиши час старту, owner-а, поточний шлях мітигації і наступний крок верифікації.

### 3. Стабілізувати

- Обери між rollback, feature-flag mitigation, env rollback або точковим hotfix.
- Спершу мінімізуй blast radius, лише потім переходь до глибшого cleanup-у.

### 4. Верифікувати відновлення

- Підтверди, що симптом зник на ураженій поверхні.
- Дивись на пов'язаний alert/метрику достатньо довго, щоб не оголосити false recovery.

### 5. Маршрутизувати фоллов-ап

- Якщо потрібен postmortem — одразу відкривай [write-postmortem.md](./write-postmortem.md).
- Якщо проблема була лише шумним alert-ом — онови runbook або alert-tuning нотатку.

## Verification

- [ ] Severity записано.
- [ ] Канонічний incident log існує.
- [ ] Рішення про мітигацію або rollback зафіксовано.
- [ ] Відновлення верифіковано на user-facing поверхні або метриці.

## Коли цей playbook не застосовується

- Подія ще на стадії розслідування — підтвердженого user impact-у або потреби в мітигації немає.
- Проблема — лише локальний CI- або staging-шум.

## Related playbooks and skills

- [investigate-alert.md](./investigate-alert.md)
- [hotfix-prod-regression.md](./hotfix-prod-regression.md)
- [write-postmortem.md](./write-postmortem.md)
- Skill: `sergeant-bugfix-and-regression`
