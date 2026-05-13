# Playbook: Postmortem після інциденту

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Active

**Trigger:** стався SEV1/SEV2 інцидент, повторюваний продакшн-збій потребує формального уроку, або repo guardrails змінилися саме через інцидент.

## Owner surface

- Primary surface: розбір інцидентів і фоллов-апи.
- Governing skill: `sergeant-review-and-merge`.

## Required context

- Перш ніж писати — перечитати [incident-severity-policy.md](../governance/incident-severity-policy.md), [Postmortem Index](../postmortems/INDEX.md) і [TEMPLATE.md](../postmortems/TEMPLATE.md).

## Steps

### 1. Зібрати факти до того, як писати наратив

- Таймлайн від детекту до відновлення.
- Корінна причина (root cause).
- Шлях мітигації.
- Прогалини в детектуванні.
- Відсутні guardrails (тести, лінтери, alerting).

### 2. Заповнити шаблон

- Технічну причину описати конкретно — без обтічних формулювань.
- Розділити «що зламалося» від «чому це не зловили раніше».
- Додати посилання на incident log, реліз, PR або rollback-комміт.

### 3. Створити action items

- Кожен action item має мати owner-а і дедлайн.
- Маршрутизувати фікси у playbook, runbook, hard rule, тести або інфраструктуру — залежно від рівня дрейфу.

### 4. Оновити індекс

- Додати запис нового postmortem-у в [INDEX.md](../postmortems/INDEX.md).
- Прив'язати фоллов-ап issue або tracker-item.

## Verification

- [ ] Корінна причина описана конкретно (не «edge case» / «race condition» без деталей).
- [ ] Прогалини детекту й мітигації виокремлені окремо одна від одної.
- [ ] Усі action items мають owner-а і дедлайн.
- [ ] [INDEX.md](../postmortems/INDEX.md) оновлено.

## Коли цей playbook не застосовується

- Подія SEV4, тимчасова, без значущого уроку.
- Розслідування ще активне — факти неповні; чекаємо стабілізації, перш ніж писати postmortem.

## Related playbooks and skills

- [declare-incident.md](./declare-incident.md)
- [hotfix-prod-regression.md](./hotfix-prod-regression.md)
- Skill: `sergeant-deploy-and-observability`
