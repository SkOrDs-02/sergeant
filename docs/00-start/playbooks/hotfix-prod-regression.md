# Playbook: Hotfix Production Regression

> **Last touched:** 2026-08-16 by @github-actions[bot]. **Next review:** 2026-10-22.
> **Status:** Active

**Trigger:** "Прод впав" / користувачі скаржаться / `/health` деградував / Sentry або ops канал показує активну регресію після релізу.

## Owner surface

- Primary surface: production runtime
- Governing skill: `sergeant-deploy-and-observability`

## Required context

- Почни з `sergeant-start-here`, потім відкрий `sergeant-deploy-and-observability`.
- Для root-cause repair у коді переключись на відповідний specialist skill лише після triage.
- Reviewer/incident notes мають посилатись на [review-checklist.md](../../04-governance/governance/review-checklist.md).

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

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                     | Title                                                           | Merged     |
| ------------------------------------------------------ | --------------------------------------------------------------- | ---------- |
| [#804](https://github.com/Skords-01/Sergeant/pull/804) | docs(docs): ревалідувати пʼять прострочених доків і зняти дрейф | 2026-08-16 |

_Auto-derived from `docs/04-governance/pr-ledger/index.json`. Top 1 most recent PRs touching this file._
<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
