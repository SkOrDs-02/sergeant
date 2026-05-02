# Playbook: Hotfix Production Regression

> **Last validated:** 2026-05-02 by @claude. **Next review:** 2026-07-31.
> **Status:** Active

**Trigger:** "Прод впав" / користувачі скаржаться / `/health` деградував / Sentry або ops канал показує активну регресію після релізу.

## Owner surface

- Primary surface: production runtime
- Governing skill: `sergeant-deploy-and-observability`

## Required context

- Почни з `sergeant-start-here`, потім відкрий `sergeant-deploy-and-observability`.
- Для root-cause repair у коді переключись на відповідний specialist skill лише після triage.
- Reviewer/incident notes мають посилатись на [review-checklist.md](../governance/review-checklist.md).

## Steps

### 1. Підтверди інцидент і scope

- Що саме впало: web, API, auth, background workflow, external integration.
- Коли почалось.
- Який останній deploy або config change передував інциденту.

### 2. Визнач безпечний шлях стабілізації

- rollback
- feature flag off
- env rollback
- small hotfix
- temporary mitigation

### 3. Мінімізуй blast radius

- Не змішуй hotfix і cleanup/refactor.
- Якщо rollback дешевший і безпечніший, роби rollback першим.
- Якщо є migration dependency або stateful rollout, задокументуй порядок явно.

### 4. Внеси і перевір fix

- Відтвори локально або в preview те, що зламалось.
- Зроби мінімальний regression fix.
- Онови runbook або incident note, якщо це повторюваний class аварій.

## Verification

- [ ] Incident symptom зрозумілий і підтверджений
- [ ] Є явний rollback/backout plan
- [ ] Цільова перевірка на проблемний surface green
- [ ] Post-fix verification на `/health`, критичному user flow або alert metric виконано
- [ ] Якщо змінювався process, docs/runbook оновлено

## When not to use this playbook

- Alert ще не впливає на користувача і вимагає лише розслідування.
- Це локальний CI red або staging-only проблема.

## Related playbooks and skills

- [investigate-alert.md](./investigate-alert.md)
- [add-sql-migration.md](./add-sql-migration.md)
- Skill: `sergeant-deploy-and-observability`
- Skill: `sergeant-bugfix-and-regression`
